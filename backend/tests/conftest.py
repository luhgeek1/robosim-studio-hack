import asyncio
import os
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import Settings
from app.main import create_app
from tests.contract_check import violations

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = BACKEND_DIR.parent
_BASE_DB_URL = os.environ.get(
    "RS_TEST_DATABASE_URL", "postgresql+asyncpg://roboscope:roboscope@localhost:5432/roboscope_test"
)
_REDIS_URL = os.environ.get("RS_TEST_REDIS_URL", "redis://localhost:6379/15")
DEMO_PASSWORD = "Demo12345!"
# Every response of the integration tests is checked against docs/api; set to a file path to collect instead.
_CONTRACT_LOG = os.environ.get("RS_CONTRACT_LOG")
# Seeded reference data survives between tests; only user-generated tables are truncated.
SEEDED_TABLES = frozenset(
    {
        "alembic_version",
        "sources",
        "object_types",
        "parameter_defs",
        "process_defs",
        "solution_types",
        "spec_keys",
        "industries",
        "norm_sets",
        "norms",
        "data_versions",
        "manufacturers",
        "products",
        "product_offers",
        "product_specs",
        "product_cases",
    }
)


def make_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "stage": "test",
        "database_url": _BASE_DB_URL,
        "redis_url": _REDIS_URL,
        "log_json": False,
        "log_level": "WARNING",
        "auth_rate_limit_per_min": 1000,
    }
    values.update(overrides)
    return Settings.model_validate(values)


async def _ensure_database(url: str) -> None:
    target = make_url(url)
    admin = create_async_engine(target.set(database="postgres"), isolation_level="AUTOCOMMIT")
    async with admin.connect() as conn:
        exists = await conn.scalar(
            text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": target.database}
        )
        if not exists:
            await conn.execute(text(f'CREATE DATABASE "{target.database}"'))
    await admin.dispose()


def _migrate(url: str) -> None:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "head")


@pytest.fixture(scope="session")
async def migrated_db() -> str:
    await _ensure_database(_BASE_DB_URL)
    await asyncio.to_thread(_migrate, _BASE_DB_URL)  # env.py runs its own event loop
    return _BASE_DB_URL


@pytest.fixture
async def settings(migrated_db: str) -> Settings:
    engine = create_async_engine(migrated_db)
    async with engine.begin() as conn:
        tables = await conn.scalars(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'"))
        names = ", ".join(f'"{name}"' for name in tables if name not in SEEDED_TABLES)
        if names:
            await conn.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))
    await engine.dispose()
    return make_settings()


def _log_violations(found: list[str]) -> None:
    with Path(str(_CONTRACT_LOG)).open("a", encoding="utf-8") as log:
        log.writelines(f"{line}\n" for line in found)


async def _check_contract(response: Response) -> None:
    await response.aread()
    found = violations(response.request.method, response.request.url.path, response)
    if found and _CONTRACT_LOG:
        _log_violations(found)
    elif found:
        raise AssertionError("Ответ расходится с docs/api:\n" + "\n".join(found[:10]))


@pytest.fixture
async def client(settings: Settings) -> AsyncIterator[AsyncClient]:
    app = create_app(settings)
    async with app.router.lifespan_context(app):
        await app.state.redis.flushdb()
        transport = ASGITransport(app=app)
        hooks = {"response": [_check_contract]}
        async with AsyncClient(transport=transport, base_url="http://test", event_hooks=hooks) as http:
            yield http


async def login(client: AsyncClient, email: str, password: str = DEMO_PASSWORD) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}, headers={"X-Client": "mobile"}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    return {"access": body["access_token"], "refresh": body["refresh_token"]}


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}

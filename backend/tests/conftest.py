import asyncio
import os
from collections.abc import AsyncIterator
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.core.config import Settings
from app.main import create_app
from tests.contract_check import violations

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = BACKEND_DIR.parent
_BASE_DB_URL = os.environ.get(
    "RS_TEST_DATABASE_URL", "postgresql+asyncpg://robomera:robomera@localhost:5432/robomera_test"
)
_REDIS_URL = os.environ.get("RS_TEST_REDIS_URL", "redis://localhost:6379/15")
DEMO_PASSWORD = "Demo12345!"
# Every response of the integration tests is checked against docs/api; set to a file path to collect instead.
_CONTRACT_LOG = os.environ.get("RS_CONTRACT_LOG")


def make_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "stage": "test",
        "demo_warm_on_startup": False,
        "database_url": _BASE_DB_URL,
        "redis_url": _REDIS_URL,
        "log_json": False,
        "log_level": "WARNING",
        "auth_rate_limit_per_min": 1000,
    }
    values.update(overrides)
    return Settings.model_validate(values)


@pytest.fixture(scope="session")
async def database_admin() -> AsyncIterator[AsyncEngine]:
    target = make_url(_BASE_DB_URL)
    admin = create_async_engine(target.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        yield admin
    finally:
        await admin.dispose()


async def _drop_database(admin: AsyncEngine, url: str) -> None:
    name = admin.dialect.identifier_preparer.quote(str(make_url(url).database))
    async with admin.connect() as conn:
        await conn.execute(text(f"DROP DATABASE IF EXISTS {name}"))


async def _create_database(admin: AsyncEngine, url: str, template: str = "template0") -> None:
    target = make_url(url)
    quote = admin.dialect.identifier_preparer.quote
    async with admin.connect() as conn:
        await conn.execute(text(f"CREATE DATABASE {quote(str(target.database))} TEMPLATE {quote(template)}"))


def _migrate(url: str) -> None:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "head")


@pytest.fixture(scope="session")
async def seeded_template(database_admin: AsyncEngine) -> AsyncIterator[str]:
    template = f"robomera_test_template_{uuid4().hex}"
    url = make_url(_BASE_DB_URL).set(database=template).render_as_string(hide_password=False)
    await _create_database(database_admin, url)
    try:
        await asyncio.to_thread(_migrate, url)  # env.py runs its own event loop
        app = create_app(make_settings(database_url=url))
        # The real startup seeds the snapshot once; closing the pool lets PostgreSQL clone it.
        async with app.router.lifespan_context(app):
            pass
        yield template
    finally:
        await _drop_database(database_admin, url)


@pytest.fixture
async def settings(database_admin: AsyncEngine, seeded_template: str) -> AsyncIterator[Settings]:
    await _drop_database(database_admin, _BASE_DB_URL)
    await _create_database(database_admin, _BASE_DB_URL, seeded_template)
    try:
        # Each test gets pristine reference data and users, including their password hashes.
        yield make_settings(seed_on_startup=False)
    finally:
        await _drop_database(database_admin, _BASE_DB_URL)


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

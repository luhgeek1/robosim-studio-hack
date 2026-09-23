from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.core.middleware import RequestTracingMiddleware
from app.core.problem import register_problem_handlers
from app.core.security.tokens import TokenCodec
from app.db.session import Database
from app.infra.redis import create_redis
from app.seeds.runner import run_seeds

API_DESCRIPTION = (
    "Платформа экспресс-оценки роботизации объекта (ЛЦТ 2026, задача №1). "
    "Контракт — docs/api/openapi.yaml; эта схема генерируется из кода и проверяется контрактным тестом."
)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level, as_json=settings.log_json)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.db = Database(settings)
        app.state.redis = create_redis(settings)
        if settings.seed_on_startup:
            await run_seeds(app.state.db, settings)
        try:
            yield
        finally:
            await app.state.redis.aclose()
            await app.state.db.dispose()

    app = FastAPI(
        title="РобоМера API",
        version=settings.app_version,
        description=API_DESCRIPTION,
        lifespan=lifespan,
        docs_url="/api/docs" if settings.docs_open else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if settings.docs_open else None,
    )
    app.state.settings = settings
    app.state.token_codec = TokenCodec(settings)

    register_problem_handlers(app, expose_internal=settings.stage == "dev")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "X-Process-Time-Ms"],
    )
    app.add_middleware(RequestTracingMiddleware)
    app.include_router(api_router)
    return app

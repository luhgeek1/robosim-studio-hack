from functools import lru_cache
from pathlib import Path
from typing import Literal, Self

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]

# Local-only defaults; the prod validator below refuses to start with them.
DEV_JWT_SECRET = "dev-only-jwt-secret-change-me-in-prod-0123456789"  # noqa: S105
DEV_CSRF_KEY = "dev-only-csrf-key-change-me-in-prod"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="RS_", extra="ignore")

    stage: Literal["dev", "test", "prod"] = "dev"
    app_version: str = "0.1.0"
    build_sha: str | None = None
    log_level: str = "INFO"
    log_json: bool = True
    sql_echo: bool = False
    docs_enabled: bool | None = Field(default=None, description="None = open in dev/test, closed in prod")

    database_url: str = "postgresql+asyncpg://roboscope:roboscope@localhost:5432/roboscope"
    db_pool_size: int = 10
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: SecretStr = SecretStr(DEV_JWT_SECRET)
    jwt_algorithm: str = "HS256"
    access_ttl_s: int = 15 * 60
    refresh_ttl_s: int = 7 * 24 * 60 * 60
    csrf_key: SecretStr = SecretStr(DEV_CSRF_KEY)

    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    cookie_domain: str | None = None

    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    auth_rate_limit_per_min: int = 20
    worker_heartbeat_ttl_s: int = 90

    seed_on_startup: bool = True
    data_root: Path = Field(default=REPO_ROOT, description="Folder with case/dataset and research/")
    demo_password: SecretStr = SecretStr("Demo12345!")

    @property
    def docs_open(self) -> bool:
        if self.docs_enabled is not None:
            return self.docs_enabled
        return self.stage != "prod"

    @model_validator(mode="after")
    def _forbid_dev_secrets_in_prod(self) -> Self:
        if self.stage != "prod":
            return self
        if self.jwt_secret.get_secret_value() == DEV_JWT_SECRET:
            raise ValueError("RS_JWT_SECRET must be set in prod")
        if self.csrf_key.get_secret_value() == DEV_CSRF_KEY:
            raise ValueError("RS_CSRF_KEY must be set in prod")
        if len(self.jwt_secret.get_secret_value()) < 32:
            raise ValueError("RS_JWT_SECRET must be at least 32 characters")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()

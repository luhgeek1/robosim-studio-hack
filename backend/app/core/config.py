from functools import lru_cache
from pathlib import Path
from typing import Literal, Self
from urllib.parse import urlsplit

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

    database_url: str = "postgresql+asyncpg://robomera:robomera@localhost:5432/robomera"
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

    # Set only behind a private proxy which overwrites this header (see deploy/fly/nginx.conf).
    client_ip_header: str | None = None
    auth_rate_limit_per_min: int = 20
    public_web_url: str = "http://localhost:5173"
    public_api_url: str = "http://localhost:5173"
    resend_api_key: SecretStr | None = None
    email_from: str | None = None
    yandex_client_id: str | None = None
    yandex_client_secret: SecretStr | None = None
    google_client_id: str | None = None
    google_client_secret: SecretStr | None = None
    vk_client_id: str | None = None
    verification_ttl_hours: int = Field(default=24, ge=1, le=72)
    password_reset_ttl_minutes: int = Field(default=30, ge=5, le=60)
    recent_auth_minutes: int = Field(default=10, ge=1, le=30)
    email_poll_interval_s: int = Field(default=5, ge=1)
    email_max_attempts: int = Field(default=5, ge=1, le=10)
    invitation_ttl_hours: int = Field(default=168, ge=1)
    worker_heartbeat_ttl_s: int = 90
    jobs_backend: Literal["inline", "arq"] = Field(
        default="inline", description="inline - in the API process after the response; arq - the worker"
    )
    job_timeout_s: int = 300

    demo_warm_on_startup: bool = True
    seed_on_startup: bool = True
    data_root: Path = Field(default=REPO_ROOT, description="Folder with case/dataset and research/")
    demo_password: SecretStr = SecretStr("Demo12345!")

    @property
    def email_enabled(self) -> bool:
        return bool(self.resend_api_key and self.email_from)

    @model_validator(mode="after")
    def _validate_integrations(self) -> Self:
        oauth_enabled = bool(self.yandex_client_id or self.google_client_id or self.vk_client_id)
        for client_id, secret in (
            (self.yandex_client_id, self.yandex_client_secret),
            (self.google_client_id, self.google_client_secret),
        ):
            if bool(client_id) != bool(secret):
                raise ValueError("OAuth client ID and secret must be set together")
        if oauth_enabled and self.public_api_url.rstrip("/") != self.public_web_url.rstrip("/"):
            raise ValueError("OAuth requires API and web on the same public origin (use the /api proxy)")
        if oauth_enabled and self.cookie_samesite == "strict":
            raise ValueError("OAuth requires SameSite=lax or none for the current-session callback")
        if oauth_enabled and self.stage == "prod" and not self.cookie_secure:
            raise ValueError("OAuth in prod requires RS_COOKIE_SECURE=true")
        for value in (self.public_web_url, self.public_api_url):
            url = urlsplit(value)
            if url.scheme not in {"http", "https"} or not url.hostname or url.query or url.fragment:
                raise ValueError("Public URLs must be absolute HTTP(S) URLs without query or fragment")
            if url.username or url.password or url.path not in {"", "/"}:
                raise ValueError("Public URLs must contain only an origin")
            if self.stage == "prod" and (self.email_enabled or oauth_enabled) and url.scheme != "https":
                raise ValueError("Public URLs must use HTTPS in prod")
        if bool(self.resend_api_key) != bool(self.email_from):
            raise ValueError("RS_RESEND_API_KEY and RS_EMAIL_FROM must be set together")
        if self.email_from and (
            "@" not in self.email_from or "\n" in self.email_from or "\r" in self.email_from
        ):
            raise ValueError("RS_EMAIL_FROM must contain a valid sender address")
        return self

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
        if not self.cookie_secure:
            raise ValueError("RS_COOKIE_SECURE must be true in prod")
        if len(self.csrf_key.get_secret_value()) < 32:
            raise ValueError("RS_CSRF_KEY must be at least 32 characters")
        if len(self.jwt_secret.get_secret_value()) < 32:
            raise ValueError("RS_JWT_SECRET must be at least 32 characters")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()

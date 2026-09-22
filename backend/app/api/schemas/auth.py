from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import EmailStr, Field

from app.api.schemas.base import ApiModel
from app.domain.auth import ApiKeyInfo, Role, UserProfile


class User(ApiModel):
    id: UUID
    email: EmailStr
    name: str
    role: Role
    organization: str | None = None
    position: str | None = Field(default=None, examples=["Директор по логистике"])
    vendor_manufacturer_id: UUID | None = None
    created_at: datetime
    last_login_at: datetime | None = None
    is_active: bool = True

    @classmethod
    def from_domain(cls, user: UserProfile) -> "User":
        return cls.model_validate(user)


class RegisterRequest(ApiModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=120)
    organization: str | None = None
    position: str | None = None


class LoginRequest(ApiModel):
    email: EmailStr
    password: str


class RefreshRequest(ApiModel):
    refresh_token: str | None = None


class TokenPair(ApiModel):
    access_token: str
    refresh_token: str | None = Field(
        default=None, description="Для X-Client=web всегда null — токен в httpOnly-cookie"
    )
    token_type: str = "bearer"  # noqa: S105  (OAuth2 token type, not a secret)
    expires_in: int = Field(description="Секунд до истечения access-токена")
    user: User | None = None


class UserUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    organization: str | None = None
    position: str | None = None


class ApiKeyScope(StrEnum):
    PROJECTS_WRITE = "projects:write"
    CATALOG_WRITE = "catalog:write"
    NORMS_WRITE = "norms:write"


class ApiKey(ApiModel):
    id: UUID
    name: str = Field(examples=["1С:WMS, тестовый контур"])
    prefix: str = Field(examples=["rs_live_a1b2"])
    scopes: list[ApiKeyScope] = Field(default_factory=list)
    created_at: datetime
    last_used_at: datetime | None = None

    @classmethod
    def from_domain(cls, key: ApiKeyInfo) -> "ApiKey":
        return cls(
            id=key.id,
            name=key.name,
            prefix=key.prefix,
            scopes=[ApiKeyScope(scope) for scope in key.scopes],
            created_at=key.created_at,
            last_used_at=key.last_used_at,
        )


class ApiKeyList(ApiModel):
    items: list[ApiKey]


class ApiKeyCreate(ApiModel):
    name: str = Field(min_length=1, max_length=120)
    scopes: list[ApiKeyScope]


class ApiKeyCreated(ApiKey):
    secret: str = Field(description="Показывается один раз")

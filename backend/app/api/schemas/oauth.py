from typing import Literal

from pydantic import Field

from app.api.schemas.base import ApiModel
from app.domain.auth.security import OAuthProvider


class OAuthProviderInfo(ApiModel):
    id: OAuthProvider
    name: str
    enabled: bool


class OAuthProviderList(ApiModel):
    items: list[OAuthProviderInfo]


class OAuthStartRequest(ApiModel):
    return_to: str = Field(default="/projects", max_length=2048)
    intent: Literal["login", "link"] = "login"
    keep_guest_csrf: str | None = Field(default=None, max_length=128)


class OAuthAuthorization(ApiModel):
    authorization_url: str

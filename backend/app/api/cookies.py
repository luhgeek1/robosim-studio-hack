from typing import Any

from fastapi import Response

from app.core.config import Settings

REFRESH_COOKIE = "refresh_token"
CSRF_COOKIE = "csrf_token"


def _base(settings: Settings) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "secure": settings.cookie_secure,
        "samesite": settings.cookie_samesite,
        "path": "/api/v1/auth",
    }
    if settings.cookie_domain:
        kwargs["domain"] = settings.cookie_domain
    return kwargs


def set_auth_cookies(
    response: Response, settings: Settings, *, refresh_token: str, csrf_token: str, ttl_s: int | None = None
) -> None:
    base = _base(settings)
    max_age = ttl_s if ttl_s is not None else settings.refresh_ttl_s
    response.set_cookie(REFRESH_COOKIE, refresh_token, max_age=max_age, httponly=True, **base)
    response.set_cookie(CSRF_COOKIE, csrf_token, max_age=max_age, httponly=False, **{**base, "path": "/"})


def clear_auth_cookies(response: Response, settings: Settings) -> None:
    base = _base(settings)
    response.delete_cookie(REFRESH_COOKIE, httponly=True, **base)
    response.delete_cookie(CSRF_COOKIE, httponly=False, **{**base, "path": "/"})

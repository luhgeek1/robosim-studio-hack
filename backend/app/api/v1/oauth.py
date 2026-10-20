from typing import Annotated
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import RedirectResponse

from app.api.cookies import REFRESH_COOKIE, set_auth_cookies
from app.api.deps import CodecDep, OptionalUserDep, RedisDep, SettingsDep, UowDep, rate_limited
from app.api.schemas.oauth import OAuthAuthorization, OAuthProviderInfo, OAuthProviderList, OAuthStartRequest
from app.core.errors import DomainError, ErrorCode, UnauthorizedError
from app.domain.auth.security import OAuthProvider
from app.infra.oauth import enabled, providers
from app.service.auth.oauth_flows import OAuthCallback, OAuthFlows, OAuthStart
from app.service.auth.oauth_state import COOKIE_PATH, OAUTH_TTL_S, OAuthStateStore

router = APIRouter(prefix="/auth/oauth", tags=["auth"])


@router.get("/providers", operation_id="listOAuthProviders", summary="Доступные сервисы входа")
async def list_providers(settings: SettingsDep) -> OAuthProviderList:
    return OAuthProviderList(
        items=[OAuthProviderInfo(id=p.id, name=p.name, enabled=enabled(p)) for p in providers(settings)]
    )


@router.post(
    "/{provider}/start",
    operation_id="startOAuth",
    summary="Начать вход или подключение сервиса",
    dependencies=[Depends(rate_limited("oauth-start"))],
)
async def start_oauth(
    provider: OAuthProvider,
    payload: OAuthStartRequest,
    request: Request,
    response: Response,
    user: OptionalUserDep,
    uow: UowDep,
    codec: CodecDep,
    redis: RedisDep,
    settings: SettingsDep,
) -> OAuthAuthorization:
    data = OAuthStart(
        provider=provider,
        return_to=payload.return_to,
        link=payload.intent == "link",
        keep_guest_csrf=payload.keep_guest_csrf,
    )
    started = await OAuthFlows(uow, codec, redis, settings).start(
        data, user, request.cookies.get(REFRESH_COOKIE)
    )
    response.set_cookie(
        f"oauth_{started.state}",
        started.browser,
        max_age=OAUTH_TTL_S,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path=COOKIE_PATH,
    )
    response.headers["Cache-Control"] = "no-store"
    return OAuthAuthorization(authorization_url=started.url)


@router.get(
    "/{provider}/callback",
    operation_id="finishOAuth",
    summary="Возврат из сервиса входа",
    response_class=RedirectResponse,
    status_code=303,
    dependencies=[Depends(rate_limited("oauth-callback"))],
)
async def finish_oauth(
    provider: OAuthProvider,
    request: Request,
    uow: UowDep,
    codec: CodecDep,
    redis: RedisDep,
    settings: SettingsDep,
    state: Annotated[str, Query(max_length=128, pattern=r"^[A-Za-z0-9_-]*$")] = "",
    code: Annotated[str, Query(max_length=4096)] = "",
    error: Annotated[str | None, Query(max_length=256)] = None,
    device_id: Annotated[str | None, Query(max_length=512)] = None,
) -> Response:
    error_target = "/login"
    return_to = "/projects"
    store = OAuthStateStore(redis)
    browser = request.cookies.get(f"oauth_{state}")
    try:
        context = await store.read(state, browser)
        error_target = "/account" if context.get("link_user_id") else "/login"
        return_to = context["return_to"]
        if error or not code:
            await store.consume(state, browser)
            raise UnauthorizedError("Вход отменён или не подтверждён. Повторите попытку.")
        result, target = await OAuthFlows(uow, codec, redis, settings).finish(
            OAuthCallback(
                provider=provider,
                state=state,
                browser=request.cookies.get(f"oauth_{state}"),
                code=code,
                device_id=device_id,
            ),
            request.cookies.get(REFRESH_COOKIE),
        )
    except DomainError as exc:
        await uow.rollback()
        error_key = {
            ErrorCode.CONFLICT: "account_conflict",
            ErrorCode.FORBIDDEN: "action_forbidden",
            ErrorCode.REQUEST_VALIDATION_ERROR: "email_required",
            ErrorCode.HTTP_ERROR: "provider_unavailable",
        }.get(exc.error_code, "login_failed")
        query = urlencode({"auth_error": error_key, "return_to": return_to})
        response = RedirectResponse(
            f"{settings.public_web_url.rstrip('/')}{error_target}?{query}", status_code=303
        )
    else:
        response = RedirectResponse(f"{settings.public_web_url.rstrip('/')}{target}", status_code=303)
        set_auth_cookies(
            response, settings, refresh_token=result.tokens.refresh, csrf_token=result.tokens.csrf
        )
    response.delete_cookie(
        f"oauth_{state}", httponly=True, secure=settings.cookie_secure, samesite="lax", path=COOKIE_PATH
    )
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response

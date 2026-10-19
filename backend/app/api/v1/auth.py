from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Body, Depends, Header, Request, Response, status

from app.api.cookies import REFRESH_COOKIE, clear_auth_cookies, set_auth_cookies
from app.api.deps import (
    ClientDep,
    CodecDep,
    CurrentUserDep,
    RedisDep,
    RevocationsDep,
    SettingsDep,
    UowDep,
    rate_limited,
)
from app.api.schemas.auth import LoginRequest, RefreshRequest, RegisterRequest, TokenPair, User
from app.core.config import Settings
from app.core.errors import ForbiddenError, RateLimitedError, UnauthorizedError
from app.db.repositories.users import to_profile
from app.domain.auth import Role
from app.infra.client_ip import client_ip
from app.infra.rate_limit import RateLimiter
from app.service.auth import AuthService, Registration, SessionResult
from app.service.auth.guests import create_guest, delete_guest_data, transfer_guest

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_pair(result: SessionResult, response: Response, settings: Settings, *, web: bool) -> TokenPair:
    tokens = result.tokens
    if web:
        set_auth_cookies(
            response,
            settings,
            refresh_token=tokens.refresh,
            csrf_token=tokens.csrf,
            ttl_s=max(0, int((result.user.guest_expires_at - datetime.now(UTC)).total_seconds()))
            if result.user.guest_expires_at
            else None,
        )
    return TokenPair(
        access_token=tokens.access,
        refresh_token=None if web else tokens.refresh,
        expires_in=tokens.access_ttl_s,
        user=User.from_domain(result.user),
    )


@router.post(
    "/register",
    operation_id="register",
    summary="Регистрация пользователя",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limited("register"))],
    responses={409: {"description": "Email занят"}, 429: {"description": "Слишком много запросов"}},
)
async def register(
    request: Request,
    payload: RegisterRequest,
    response: Response,
    client: ClientDep,
    uow: UowDep,
    codec: CodecDep,
    revocations: RevocationsDep,
    settings: SettingsDep,
) -> TokenPair:
    result = await AuthService(uow, codec, revocations).register(Registration(**payload.model_dump()), client)
    await _keep_guest_work(request, result, uow, codec, revocations)
    return _token_pair(result, response, settings, web=client == "web")


@router.post(
    "/login",
    operation_id="login",
    summary="Вход",
    dependencies=[Depends(rate_limited("login"))],
    responses={
        401: {"description": "Неверные учётные данные"},
        409: {"description": "Дождитесь завершения гостевых задач перед сохранением"},
        429: {"description": "Слишком много запросов"},
    },
)
async def login(
    request: Request,
    payload: LoginRequest,
    response: Response,
    client: ClientDep,
    uow: UowDep,
    codec: CodecDep,
    revocations: RevocationsDep,
    settings: SettingsDep,
) -> TokenPair:
    result = await AuthService(uow, codec, revocations).login(payload.email, payload.password, client)
    await _keep_guest_work(request, result, uow, codec, revocations)
    return _token_pair(result, response, settings, web=client == "web")


@router.post(
    "/refresh",
    operation_id="refreshTokens",
    summary="Обновить пару токенов",
    description="Для web refresh-токен берётся из httpOnly-cookie, требуется заголовок X-CSRF-Token; "
    "для других клиентов — refresh-токен в теле.",
    responses={401: {"description": "Токен недействителен"}},
)
async def refresh(
    request: Request,
    response: Response,
    uow: UowDep,
    codec: CodecDep,
    revocations: RevocationsDep,
    settings: SettingsDep,
    payload: Annotated[RefreshRequest | None, Body()] = None,
    x_csrf: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> TokenPair:
    cookie_token = request.cookies.get(REFRESH_COOKIE)
    token = cookie_token or (payload.refresh_token if payload else None)
    if not token:
        raise UnauthorizedError("Нет refresh-токена")
    service = AuthService(uow, codec, revocations)
    try:
        result = await service.refresh(token, csrf=x_csrf, from_cookie=cookie_token is not None)
    except UnauthorizedError:
        if cookie_token:
            clear_auth_cookies(response, settings)
        raise
    return _token_pair(result, response, settings, web=cookie_token is not None)


@router.post(
    "/logout",
    operation_id="logout",
    summary="Выход (отзыв refresh-токена)",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={401: {"description": "Нет refresh-токена"}},
)
async def logout(
    request: Request,
    uow: UowDep,
    codec: CodecDep,
    revocations: RevocationsDep,
    settings: SettingsDep,
    payload: Annotated[RefreshRequest | None, Body()] = None,
) -> Response:
    token = request.cookies.get(REFRESH_COOKIE) or (payload.refresh_token if payload else None)
    if not token:
        raise UnauthorizedError("Нет refresh-токена")
    await AuthService(uow, codec, revocations).logout(token)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_auth_cookies(response, settings)
    return response


async def _keep_guest_work(
    request: Request, result: SessionResult, uow: UowDep, codec: CodecDep, revocations: RevocationsDep
) -> None:
    csrf = request.headers.get("X-Keep-Guest-CSRF")
    if csrf is None:
        return
    token = request.cookies.get(REFRESH_COOKIE)
    if token is None:
        raise UnauthorizedError("Нет гостевой сессии для сохранения")
    claims = codec.decode(token, "refresh")
    if await revocations.is_revoked(claims.jti):
        raise UnauthorizedError("Гостевая сессия уже завершена")
    await transfer_guest(uow, codec, token, csrf, result.user.id)
    await revocations.revoke(claims.jti, claims.expires_at)


@router.post("/guest", operation_id="startGuestSession", summary="Начать гостевую сессию на 24 часа")
async def start_guest(
    request: Request,
    response: Response,
    client: ClientDep,
    uow: UowDep,
    codec: CodecDep,
    redis: RedisDep,
    settings: SettingsDep,
    x_client: Annotated[str, Header(alias="X-Client")],
) -> TokenPair:
    # A required custom header makes cross-origin form submissions impossible.
    ip = client_ip(request, settings)
    if not await RateLimiter(redis, limit=10, window_s=3600).hit(f"guest-start:{ip}"):
        raise RateLimitedError("Можно начать до 10 демо-сессий в час. Попробуйте позже.")
    row = await create_guest(uow)
    result = SessionResult(
        user=to_profile(row), tokens=codec.issue(row.id, row.role, row.auth_version, client)
    )
    return _token_pair(result, response, settings, web=client == "web")


@router.delete(
    "/guest", operation_id="resetGuestSession", summary="Удалить все данные текущего гостя", status_code=204
)
async def reset_guest(user: CurrentUserDep, uow: UowDep, settings: SettingsDep) -> Response:
    if user.role != Role.GUEST:
        raise ForbiddenError("Сброс демо доступен только гостю")
    await delete_guest_data(uow, [user.id])
    response = Response(status_code=204)
    clear_auth_cookies(response, settings)
    return response

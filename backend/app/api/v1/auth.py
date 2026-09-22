from typing import Annotated

from fastapi import APIRouter, Body, Depends, Header, Request, Response, status

from app.api.cookies import REFRESH_COOKIE, clear_auth_cookies, set_auth_cookies
from app.api.deps import ClientDep, CodecDep, RevocationsDep, SettingsDep, UowDep, rate_limited
from app.api.schemas.auth import LoginRequest, RefreshRequest, RegisterRequest, TokenPair, User
from app.core.config import Settings
from app.core.errors import UnauthorizedError
from app.service.auth import AuthService, Registration, SessionResult

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_pair(result: SessionResult, response: Response, settings: Settings, *, web: bool) -> TokenPair:
    tokens = result.tokens
    if web:
        set_auth_cookies(response, settings, refresh_token=tokens.refresh, csrf_token=tokens.csrf)
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
    payload: RegisterRequest,
    response: Response,
    client: ClientDep,
    uow: UowDep,
    codec: CodecDep,
    revocations: RevocationsDep,
    settings: SettingsDep,
) -> TokenPair:
    result = await AuthService(uow, codec, revocations).register(Registration(**payload.model_dump()), client)
    return _token_pair(result, response, settings, web=client == "web")


@router.post(
    "/login",
    operation_id="login",
    summary="Вход",
    dependencies=[Depends(rate_limited("login"))],
    responses={
        401: {"description": "Неверные учётные данные"},
        429: {"description": "Слишком много запросов"},
    },
)
async def login(
    payload: LoginRequest,
    response: Response,
    client: ClientDep,
    uow: UowDep,
    codec: CodecDep,
    revocations: RevocationsDep,
    settings: SettingsDep,
) -> TokenPair:
    result = await AuthService(uow, codec, revocations).login(payload.email, payload.password, client)
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

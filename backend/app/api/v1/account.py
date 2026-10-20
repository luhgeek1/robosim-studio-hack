from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Response

from app.api.deps import SettingsDep, UowDep, rate_limited, registered_user
from app.api.schemas.account import (
    AccountSecurity,
    EmailAccepted,
    EmailRequest,
    EmailTokenRequest,
    PasswordChange,
    PasswordReset,
)
from app.domain.auth import CurrentUser
from app.domain.auth.security import OAuthProvider
from app.service.auth.account_security import revoke_session, security_snapshot, set_password, unlink_identity
from app.service.auth.email_tokens import consume_email, request_email

router = APIRouter(tags=["auth"])
AccountDep = Annotated[CurrentUser, Depends(registered_user)]
MAIL_UNAVAILABLE: dict[int | str, dict[str, Any]] = {503: {"description": "Почта не настроена"}}


@router.post(
    "/auth/email/verification",
    operation_id="requestEmailVerification",
    status_code=202,
    responses=MAIL_UNAVAILABLE,
    dependencies=[Depends(rate_limited("verify-email"))],
)
async def request_verification(user: AccountDep, uow: UowDep, settings: SettingsDep) -> EmailAccepted:
    await request_email(uow, settings, user.email, "verify_email")
    return EmailAccepted()


@router.post(
    "/auth/email/verify",
    operation_id="verifyEmail",
    status_code=204,
    dependencies=[Depends(rate_limited("verify-email-token"))],
)
async def verify_email(payload: EmailTokenRequest, uow: UowDep) -> Response:
    await consume_email(uow, payload.token, "verify_email")
    return Response(status_code=204)


@router.post(
    "/auth/password/forgot",
    operation_id="requestPasswordReset",
    status_code=202,
    responses=MAIL_UNAVAILABLE,
    dependencies=[Depends(rate_limited("forgot-password"))],
)
async def forgot_password(payload: EmailRequest, uow: UowDep, settings: SettingsDep) -> EmailAccepted:
    await request_email(uow, settings, str(payload.email), "reset_password")
    return EmailAccepted()


@router.post(
    "/auth/password/reset",
    operation_id="resetPassword",
    status_code=204,
    dependencies=[Depends(rate_limited("reset-password"))],
)
async def reset_password(payload: PasswordReset, uow: UowDep) -> Response:
    await consume_email(uow, payload.token, "reset_password", payload.password)
    return Response(status_code=204)


@router.get("/me/security", operation_id="getAccountSecurity")
async def account_security(user: AccountDep, uow: UowDep) -> AccountSecurity:
    return AccountSecurity.model_validate(await security_snapshot(uow, user))


@router.put(
    "/me/password",
    operation_id="changePassword",
    status_code=204,
    dependencies=[Depends(rate_limited("change-password"))],
)
async def change_password(
    payload: PasswordChange, user: AccountDep, uow: UowDep, settings: SettingsDep
) -> Response:
    await set_password(uow, user, settings, payload.password, payload.current_password)
    return Response(status_code=204)


@router.delete("/me/sessions/{session_id}", operation_id="revokeSession", status_code=204)
async def delete_session(session_id: Annotated[UUID, Path()], user: AccountDep, uow: UowDep) -> Response:
    await revoke_session(uow, user, session_id)
    return Response(status_code=204)


@router.delete(
    "/me/identities/{provider}",
    operation_id="unlinkIdentity",
    status_code=204,
    responses={409: {"description": "Последний способ входа"}},
    dependencies=[Depends(rate_limited("unlink-identity"))],
)
async def delete_identity(
    provider: OAuthProvider, user: AccountDep, uow: UowDep, settings: SettingsDep
) -> Response:
    await unlink_identity(uow, user, settings, provider)
    return Response(status_code=204)

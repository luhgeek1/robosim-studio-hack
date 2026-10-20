import hashlib
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select

from app.core.errors import UnauthorizedError
from app.core.security.tokens import ClientKind, IssuedTokens, TokenClaims, TokenCodec
from app.db.models import AuthSession, User
from app.db.uow import UnitOfWork


def jti_hash(jti: str) -> str:
    return hashlib.sha256(jti.encode()).hexdigest()


async def new_session(
    uow: UnitOfWork, codec: TokenCodec, user: User, client: ClientKind, method: str
) -> IssuedTokens:
    session_id = uuid4()
    tokens = codec.issue(user.id, user.role, user.auth_version, client, session_id, user.guest_expires_at)
    claims = codec.decode(tokens.refresh, "refresh")
    uow.session.add(
        AuthSession(
            id=session_id,
            user_id=user.id,
            client=client,
            method=method,
            refresh_jti_hash=jti_hash(claims.jti),
            expires_at=claims.expires_at,
            last_seen_at=datetime.now(UTC),
        )
    )
    await uow.flush()
    return tokens


async def live_session(uow: UnitOfWork, claims: TokenClaims, *, lock: bool = False) -> AuthSession:
    query = select(AuthSession).where(AuthSession.id == claims.session_id)
    if lock:
        query = query.with_for_update()
    session = await uow.session.scalar(query)
    if (
        session is None
        or session.user_id != claims.user_id
        or session.revoked_at is not None
        or (session.expires_at <= datetime.now(UTC))
    ):
        raise UnauthorizedError("Сессия завершена. Войдите снова.")
    return session

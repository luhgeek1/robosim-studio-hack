from datetime import UTC, datetime, timedelta

from sqlalchemy import delete

from app.db.models import AuthEmailToken, AuthSession
from app.db.session import Database
from app.db.uow import UnitOfWork


async def purge_auth_history(db: Database) -> None:
    now = datetime.now(UTC)
    async with UnitOfWork(db.session()) as uow:
        await uow.session.execute(
            delete(AuthSession).where(AuthSession.expires_at < now - timedelta(days=30))
        )
        await uow.session.execute(
            delete(AuthEmailToken).where(AuthEmailToken.expires_at < now - timedelta(days=1))
        )
        await uow.commit()

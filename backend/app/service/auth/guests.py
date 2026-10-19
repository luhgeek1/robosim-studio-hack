"""Guest lifecycle; projects and all calculations remain in the regular services."""

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import delete, select, update

from app.core.errors import ConflictError, ForbiddenError, UnauthorizedError
from app.core.security.tokens import TokenCodec
from app.db.models import Job, Project, ProjectParam, Report, Source, StoredFile, User
from app.db.session import Database
from app.db.uow import UnitOfWork
from app.domain.auth import Role
from app.domain.common.provenance import SourceKind
from app.domain.jobs import JobStatus

MAX_GUEST_SCENARIOS = 30
GUEST_TTL_S = 24 * 60 * 60
CLEANUP_INTERVAL_S = 60
logger = logging.getLogger(__name__)


def ensure_guest_active(user: User) -> None:
    if user.role == Role.GUEST and (
        user.guest_expires_at is None or user.guest_expires_at <= datetime.now(UTC)
    ):
        raise UnauthorizedError("Временный проект удалён через 24 часа. Откройте новое демо.")


async def create_guest(uow: UnitOfWork) -> User:
    user = User(
        email=f"guest-{uuid4().hex}@guest.robomera.demo",
        # Not a password hash: this identity cannot be entered through password login.
        password_hash="!guest",  # noqa: S106 — deliberately invalid hash; password login is impossible
        name="Гость",
        role=Role.GUEST,
        guest_expires_at=datetime.now(UTC) + timedelta(seconds=GUEST_TTL_S),
        auth_version=1,
        is_active=True,
    )
    uow.users.add(user)
    await uow.flush()
    return user


async def transfer_guest(uow: UnitOfWork, codec: TokenCodec, token: str, csrf: str, owner_id: UUID) -> None:
    """A cookie alone is not proof of intent to attach guest work to an account (login CSRF)."""
    if not codec.csrf_matches(token, csrf):
        raise ForbiddenError("Неверный CSRF-токен гостевой сессии")
    claims = codec.decode(token, "refresh")
    guest = await uow.session.scalar(select(User).where(User.id == claims.user_id).with_for_update())
    if guest is None or guest.role != Role.GUEST or guest.auth_version != claims.auth_version:
        raise UnauthorizedError("Гостевая сессия недействительна")
    ensure_guest_active(guest)
    active = await uow.session.scalar(
        select(Job.id)
        .where(Job.owner_id == guest.id, Job.status.in_([JobStatus.QUEUED, JobStatus.RUNNING]))
        .limit(1)
    )
    if active is not None:
        raise ConflictError("Дождитесь завершения имитации или отчёта, затем сохраните проект в аккаунте")
    for model in (Project, Report, StoredFile, Job):
        await uow.session.execute(update(model).where(model.owner_id == guest.id).values(owner_id=owner_id))
    await uow.session.delete(guest)
    await uow.flush()


async def purge_expired_guests(db: Database) -> None:
    """Deleting an identity cascades to its projects, imports, layouts, replays, reports and files."""
    async with UnitOfWork(db.session()) as uow:
        expired = (
            select(User.id)
            .where(User.role == Role.GUEST, User.guest_expires_at <= datetime.now(UTC))
            .with_for_update(skip_locked=True)
        )
        ids = list(await uow.session.scalars(expired))
        if ids:
            await delete_guest_data(uow, ids)
        await uow.commit()


async def delete_guest_data(uow: UnitOfWork, ids: list[UUID]) -> None:
    emails = list(await uow.session.scalars(select(User.email).where(User.id.in_(ids))))
    # Jobs use ON DELETE SET NULL; remove payload/results explicitly. Other data cascades.
    await uow.session.execute(delete(Job).where(Job.owner_id.in_(ids)))
    await uow.session.execute(delete(User).where(User.id.in_(ids)))
    # Import provenance is not owned by a project. Remove even sources of overwritten parameters,
    # but keep a source if a surviving project still cites it.
    await uow.session.execute(
        delete(Source).where(
            Source.kind == SourceKind.USER_INPUT,
            Source.note.in_([f"Загружен {email}" for email in emails]),
            ~select(ProjectParam.id).where(ProjectParam.source_id == Source.id).exists(),
        )
    )


async def guest_cleanup_loop(db: Database) -> None:
    while True:
        try:
            await purge_expired_guests(db)
        except Exception:
            logger.exception("guest_cleanup_failed")
        await asyncio.sleep(CLEANUP_INTERVAL_S)

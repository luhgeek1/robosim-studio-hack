"""Idempotent seed tasks, run in order at startup (dev/demo) or via ``python -m app.seeds``.

Each task checks what already exists and only inserts what is missing, so re-running is safe.
"""

import logging
from collections.abc import Awaitable, Callable

from sqlalchemy import text

from app.core.config import Settings
from app.db.session import Database
from app.db.uow import UnitOfWork
from app.seeds.users import seed_demo_users

logger = logging.getLogger(__name__)

SeedTask = Callable[[UnitOfWork, Settings], Awaitable[int]]

# Arbitrary constant key: serialises seeding across API processes starting at the same time.
SEED_LOCK_KEY = 7_202_609

SEED_TASKS: list[tuple[str, SeedTask]] = [
    ("demo_users", seed_demo_users),
]


async def run_seeds(db: Database, settings: Settings) -> None:
    for name, task in SEED_TASKS:
        async with UnitOfWork(db.session()) as uow:
            await uow.session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": SEED_LOCK_KEY})
            inserted = await task(uow, settings)
            await uow.commit()
        logger.info("seed done", extra={"seed": name, "inserted": inserted})

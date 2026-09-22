import logging
from collections.abc import Awaitable, Callable

from sqlalchemy import text

from app.core.config import Settings
from app.db.session import Database
from app.db.uow import UnitOfWork
from app.seeds.catalog import seed_catalog
from app.seeds.norms import seed_norms
from app.seeds.reference import seed_industries, seed_object_types, seed_solution_types, seed_spec_keys
from app.seeds.users import seed_demo_users

logger = logging.getLogger(__name__)

SeedTask = Callable[[UnitOfWork, Settings], Awaitable[int]]

# Arbitrary constant key: serialises seeding across API processes starting at the same time.
SEED_LOCK_KEY = 7_202_609

SEED_TASKS: list[tuple[str, SeedTask]] = [
    ("demo_users", seed_demo_users),
    ("solution_types", seed_solution_types),
    ("spec_keys", seed_spec_keys),
    ("industries", seed_industries),
    ("object_types", seed_object_types),
    ("norms", seed_norms),
    ("catalog", seed_catalog),
]


async def run_seeds(db: Database, settings: Settings) -> None:
    for name, task in SEED_TASKS:
        async with UnitOfWork(db.session()) as uow:
            await uow.session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": SEED_LOCK_KEY})
            inserted = await task(uow, settings)
            await uow.commit()
        logger.info("seed done", extra={"seed": name, "inserted": inserted})

import asyncio

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import Database
from app.seeds.runner import run_seeds


async def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level, as_json=settings.log_json)
    db = Database(settings)
    try:
        await run_seeds(db, settings)
    finally:
        await db.dispose()


if __name__ == "__main__":
    asyncio.run(main())

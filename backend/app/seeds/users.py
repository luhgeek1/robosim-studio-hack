from sqlalchemy import select

from app.core.config import Settings
from app.core.security.passwords import hash_password
from app.db.models import Manufacturer, User
from app.db.uow import UnitOfWork
from app.domain.auth import Role

DEMO_USERS: list[tuple[str, str, Role, str | None]] = [
    ("admin@robomera.demo", "Администратор платформы", Role.ADMIN, "АНО «ФЦ БАС»"),
    ("user@robomera.demo", "Операционный директор", Role.USER, "ООО «Демо-Логистик»"),
    ("vendor@robomera.demo", "Менеджер производителя", Role.VENDOR, None),
]
# The demo vendor speaks for a real catalog company with warehouse robots, so the cabinet opens with demand.
DEMO_VENDOR_EMAIL = "vendor@robomera.demo"
DEMO_VENDOR_MANUFACTURER = 'ООО "Ронави Роботикс"'


async def seed_demo_users(uow: UnitOfWork, settings: Settings) -> int:
    inserted = 0
    password_hash: str | None = None
    for email, name, role, organization in DEMO_USERS:
        if await uow.users.email_exists(email):
            continue
        password_hash = password_hash or await hash_password(settings.demo_password.get_secret_value())
        uow.users.add(
            User(email=email, password_hash=password_hash, name=name, role=role, organization=organization)
        )
        inserted += 1
    await uow.flush()
    return inserted


async def seed_vendor_binding(uow: UnitOfWork, _settings: Settings) -> int:
    """Runs after the catalog: binds the demo vendor to its company once, never overriding the admin."""
    user = await uow.users.get_by_email(DEMO_VENDOR_EMAIL)
    if user is None or user.vendor_manufacturer_id is not None:
        return 0
    manufacturer = await uow.session.scalar(
        select(Manufacturer).where(Manufacturer.name == DEMO_VENDOR_MANUFACTURER)
    )
    if manufacturer is None:
        return 0
    user.vendor_manufacturer_id = manufacturer.id
    user.organization = manufacturer.name
    await uow.flush()
    return 1

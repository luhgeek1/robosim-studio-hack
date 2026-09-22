"""Demo accounts for the jury (ТЗ 8.2: демо-учётки). Password comes from settings, not from code."""

from app.core.config import Settings
from app.core.security.passwords import hash_password
from app.db.models import User
from app.db.uow import UnitOfWork
from app.domain.auth import Role

DEMO_USERS: list[tuple[str, str, Role, str | None]] = [
    ("admin@roboscope.demo", "Администратор платформы", Role.ADMIN, "АНО «ФЦ БАС»"),
    ("user@roboscope.demo", "Операционный директор", Role.USER, "ООО «Демо-Логистик»"),
    ("vendor@roboscope.demo", "Менеджер производителя", Role.VENDOR, None),
]


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

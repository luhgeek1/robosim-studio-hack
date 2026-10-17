from dataclasses import dataclass
from uuid import NAMESPACE_URL, uuid5

from app.core.errors import NotFoundError
from app.domain.auth import CurrentUser, Role

DEMO_REVISION = "public-demo-v1"
DEMO_OWNER_ID = uuid5(NAMESPACE_URL, "https://robomera.demo/public-examples")
DEMO_OWNER = CurrentUser(DEMO_OWNER_ID, "public-examples@robomera.invalid", Role.USER, 1)


@dataclass(frozen=True, slots=True)
class Example:
    key: str
    object_type: str
    name: str
    description: str
    processes: tuple[str, ...]
    scope: str


EXAMPLES = (
    Example(
        "warehouse_demo_01",
        "warehouse",
        "Склад: перевозка паллет",
        "Данные организатора · склад 20 000 м². От исходной формулы до проверенного парка и его стоимости.",
        ("pallet_transport",),
        "Горизонтальное перемещение паллет. "
        "Работа с ярусами и остальные функции погрузчика остаются у людей.",
    ),
    Example(
        "warehouse_showcase_24x7",
        "warehouse",
        "Фулфилмент: несколько процессов",
        "Демо команды · тот же склад в три смены. Перевозка, отбор и уборка с общей проверкой ресурсов.",
        ("pallet_transport", "order_picking", "floor_cleaning"),
        "Режим 24/7 и ручная выработка — явные допущения команды. Уборка оценивается аналитически.",
    ),
    Example(
        "hospital_demo_01",
        "hospital",
        "Больница: доставка питания",
        "Данные организатора · 650 коек и общие лифты. Проверьте, оправданы ли вложения в доставку.",
        ("meal_delivery",),
        "Только транспортировка питания: раздача пациентам и клиническая работа остаются у персонала.",
    ),
    Example(
        "airport_demo_01",
        "airport",
        "Аэропорт: перевозка багажа",
        "Данные организатора · тягачи и багажные сцепки. "
        "Экономика может показать, что внедрение пока невыгодно.",
        ("baggage_handling",),
        "Транспортировка багажа тягачом. Погрузка и разгрузка остаются у людей; "
        "допуск на перрон требует проверки.",
    ),
)


def example(key: str) -> Example:
    found = next((item for item in EXAMPLES if item.key == key), None)
    if found is None:
        raise NotFoundError("Демо-пример не найден")
    return found

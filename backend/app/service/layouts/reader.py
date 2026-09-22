from uuid import UUID

from app.db.models import Layout
from app.db.repositories.layouts import LayoutRepository
from app.db.uow import UnitOfWork
from app.domain.layout.models import RouteKey
from app.engine.trace import Book, InputKind, Quantity


def layout_book(layout: Layout | None) -> Book:
    """Route lengths of the project's layout as named inputs for the cycle model (`layout_route_*_m`)."""
    if layout is None:
        return Book(InputKind.LAYOUT, {})
    routes = {item["key"]: item for item in layout.stats.get("routes", [])}
    items: dict[str, Quantity] = {}
    for key in RouteKey:
        route = routes.get(key.value)
        if route is None:
            continue
        items[key.param_key] = Quantity(
            key.param_key,
            f"Маршрут по планировке v{layout.version}: {route['name'].lower()}",
            float(route["value_m"]),
            "м",
            InputKind.LAYOUT,
        )
    return Book(InputKind.LAYOUT, items)


class LayoutReader:
    def __init__(self, uow: UnitOfWork) -> None:
        self._repo = LayoutRepository(uow.session)

    async def layout(self, project_id: UUID) -> Layout | None:
        return await self._repo.get(project_id)

    async def book(self, project_id: UUID) -> Book:
        return layout_book(await self._repo.get(project_id))

from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import func, select

from app.core.errors import ConflictError, InvalidInputError, NotFoundError
from app.db.models import Product, Rfq, Scenario, ScenarioItem
from app.db.repositories.catalog import CatalogRepository
from app.db.uow import UnitOfWork
from app.domain.auth import CurrentUser
from app.domain.vendor import RfqDecision, RfqInfo, RfqStatus
from app.service.catalog.mappers import to_summary
from app.service.projects.context import ProjectContext, ProjectLoader
from app.service.vendor.proposals import vendor_manufacturer


def _snapshot(context: ProjectContext, process_keys: set[str]) -> dict[str, Any]:
    """What the vendor needs to quote: the object's required parameters and the processes, not the project."""
    return {
        "object_type": context.object_type.key.value,
        "object_type_name": context.object_type.name,
        "industry": context.object_type.industry,
        "params": [
            {"key": p.key, "name": p.definition.name, "value": p.value, "unit": p.unit}
            for p in context.params
            if p.definition.required and p.value is not None
        ],
        "processes": [
            {"key": p.key, "name": p.name} for p in context.object_type.processes if p.key in process_keys
        ],
    }


class RfqService:
    """Requests for a commercial offer (createRfq): the buyer asks from a scenario, the vendor answers."""

    def __init__(self, uow: UnitOfWork, user: CurrentUser) -> None:
        self._uow = uow
        self._user = user
        self._catalog = CatalogRepository(uow.session)

    async def create(
        self,
        project_id: UUID,
        scenario_id: UUID,
        items: Sequence[tuple[UUID, int | None]],
        message: str | None,
        share_contact: bool,
    ) -> list[RfqInfo]:
        context = await ProjectLoader(self._uow).context(self._user, project_id)
        scenario = await self._uow.session.get(Scenario, scenario_id)
        if scenario is None or scenario.project_id != project_id:
            raise NotFoundError("Сценарий не найден в проекте")
        rows = (
            await self._uow.session.scalars(
                select(ScenarioItem).where(ScenarioItem.scenario_id == scenario_id)
            )
        ).all()
        in_scenario = {row.product_id: row.process_key for row in rows}
        if not items:
            raise InvalidInputError("Выберите хотя бы одно решение")
        unknown = [pid for pid, _ in items if pid not in in_scenario]
        if unknown:
            raise InvalidInputError("Запросить КП можно только по решениям этого сценария")
        products = {p.id: p for p in await self._catalog.get_many([pid for pid, _ in items])}
        snapshot = _snapshot(context, set(in_scenario.values()))
        created = [
            Rfq(
                manufacturer_id=products[pid].manufacturer_id,
                product_id=pid,
                project_id=project_id,
                scenario_id=scenario_id,
                requester_id=self._user.id,
                status=RfqStatus.SENT,
                quantity=quantity,
                message=message.strip() if message and message.strip() else None,
                share_contact=share_contact,
                snapshot=snapshot,
            )
            for pid, quantity in items
        ]
        self._uow.session.add_all(created)
        await self._uow.flush()
        return await self._infos(created, with_contact=False)

    async def for_project(self, project_id: UUID) -> list[RfqInfo]:
        await ProjectLoader(self._uow).project(self._user, project_id)
        statement = select(Rfq).where(Rfq.project_id == project_id).order_by(Rfq.created_at.desc())
        return await self._infos((await self._uow.session.scalars(statement)).all(), with_contact=False)

    async def inbox(self) -> list[RfqInfo]:
        manufacturer = await vendor_manufacturer(self._uow, self._user)
        statement = select(Rfq).where(Rfq.manufacturer_id == manufacturer.id).order_by(Rfq.created_at.desc())
        return await self._infos((await self._uow.session.scalars(statement)).all(), with_contact=True)

    async def reply(
        self,
        rfq_id: UUID,
        decision: RfqDecision,
        price_rub: float | None,
        vat_included: bool,
        lead_time_weeks: int | None,
        message: str | None,
    ) -> RfqInfo:
        manufacturer = await vendor_manufacturer(self._uow, self._user)
        row = await self._uow.session.get(Rfq, rfq_id, with_for_update=True)
        if row is None or row.manufacturer_id != manufacturer.id:
            raise NotFoundError("Запрос не найден")
        if row.status != RfqStatus.SENT:
            raise ConflictError("На запрос уже ответили")
        if decision == RfqDecision.OFFER and not (price_rub and price_rub > 0):
            raise InvalidInputError("Укажите цену за единицу больше нуля")
        if decision == RfqDecision.DECLINE and not (message and message.strip()):
            raise InvalidInputError("Объясните заказчику причину отказа")
        row.status = RfqStatus.ANSWERED if decision == RfqDecision.OFFER else RfqStatus.DECLINED
        row.price_rub = price_rub if decision == RfqDecision.OFFER else None
        row.vat_included = vat_included
        row.lead_time_weeks = lead_time_weeks
        row.response_message = message.strip() if message and message.strip() else None
        row.responded_at = datetime.now(UTC)
        await self._uow.flush()
        return (await self._infos([row], with_contact=True))[0]

    async def open_count(self, manufacturer_id: UUID) -> int:
        statement = select(func.count()).where(
            Rfq.manufacturer_id == manufacturer_id, Rfq.status == RfqStatus.SENT
        )
        return int(await self._uow.session.scalar(statement) or 0)

    async def _infos(self, rows: Sequence[Rfq], *, with_contact: bool) -> list[RfqInfo]:
        products: dict[UUID, Product] = {
            p.id: p for p in await self._catalog.get_many([r.product_id for r in rows])
        }
        manufacturers = await self._catalog.manufacturers({p.manufacturer_id for p in products.values()})
        names = await self._catalog.solution_type_names()
        users = {r.requester_id for r in rows if r.requester_id and r.share_contact}
        contacts = {
            u.id: {"name": u.name, "email": u.email, "organization": u.organization}
            for u in [await self._uow.users.get(uid) for uid in users]
            if u is not None
        }
        return [
            RfqInfo(
                id=r.id,
                status=r.status,
                project_id=r.project_id,
                scenario_id=r.scenario_id,
                product=to_summary(
                    products[r.product_id], manufacturers[products[r.product_id].manufacturer_id], names
                ),
                quantity=r.quantity,
                message=r.message,
                snapshot=r.snapshot,
                contact=contacts.get(r.requester_id) if with_contact and r.requester_id else None,
                created_at=r.created_at,
                price_rub=r.price_rub,
                vat_included=r.vat_included,
                lead_time_weeks=r.lead_time_weeks,
                response_message=r.response_message,
                responded_at=r.responded_at,
            )
            for r in rows
        ]

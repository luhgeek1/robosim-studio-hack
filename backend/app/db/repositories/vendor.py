from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    ManualCandidate,
    Manufacturer,
    ProcessDef,
    Product,
    Project,
    ScenarioItem,
    User,
    VendorProposal,
)
from app.domain.vendor import ProposalStatus


class VendorRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def manufacturer(self, manufacturer_id: UUID) -> Manufacturer | None:
        return await self._session.get(Manufacturer, manufacturer_id)

    async def manufacturers(self) -> Sequence[Manufacturer]:
        return (await self._session.scalars(select(Manufacturer).order_by(Manufacturer.name))).all()

    async def product_counts(self) -> dict[UUID, int]:
        statement = (
            select(Product.manufacturer_id, func.count())
            .where(Product.hidden_at.is_(None))
            .group_by(Product.manufacturer_id)
        )
        return {mid: int(n) for mid, n in (await self._session.execute(statement)).tuples()}

    async def products(self, manufacturer_id: UUID) -> Sequence[Product]:
        statement = (
            select(Product)
            .where(Product.manufacturer_id == manufacturer_id, Product.hidden_at.is_(None))
            .order_by(Product.name)
        )
        return (await self._session.scalars(statement)).all()

    async def projects_by_object_type(self, object_types: Sequence[str]) -> dict[str, int]:
        if not object_types:
            return {}
        statement = (
            select(Project.object_type, func.count())
            .where(Project.object_type.in_(object_types))
            .group_by(Project.object_type)
        )
        return {str(key): int(value) for key, value in (await self._session.execute(statement)).tuples()}

    async def scenario_counts(self, product_ids: Sequence[UUID]) -> dict[UUID, int]:
        if not product_ids:
            return {}
        statement = (
            select(ScenarioItem.product_id, func.count(func.distinct(ScenarioItem.scenario_id)))
            .where(ScenarioItem.product_id.in_(product_ids))
            .group_by(ScenarioItem.product_id)
        )
        return {pid: int(n) for pid, n in (await self._session.execute(statement)).tuples() if pid}

    async def scenarios_with_any(self, product_ids: Sequence[UUID]) -> int:
        if not product_ids:
            return 0
        statement = select(func.count(func.distinct(ScenarioItem.scenario_id))).where(
            ScenarioItem.product_id.in_(product_ids)
        )
        return int(await self._session.scalar(statement) or 0)

    async def manual_counts(self, product_ids: Sequence[UUID]) -> dict[UUID, int]:
        if not product_ids:
            return {}
        statement = (
            select(ManualCandidate.product_id, func.count())
            .where(ManualCandidate.product_id.in_(product_ids))
            .group_by(ManualCandidate.product_id)
        )
        return {pid: int(n) for pid, n in (await self._session.execute(statement)).tuples()}

    async def process_defs(self) -> Sequence[ProcessDef]:
        return (await self._session.scalars(select(ProcessDef))).all()

    async def proposals(
        self, *, manufacturer_id: UUID | None = None, status: ProposalStatus | None = None
    ) -> Sequence[VendorProposal]:
        statement = select(VendorProposal).order_by(VendorProposal.created_at.desc())
        if manufacturer_id is not None:
            statement = statement.where(VendorProposal.manufacturer_id == manufacturer_id)
        if status is not None:
            statement = statement.where(VendorProposal.status == status)
        return (await self._session.scalars(statement)).all()

    async def proposal(self, proposal_id: UUID, *, lock: bool = False) -> VendorProposal | None:
        statement = select(VendorProposal).where(VendorProposal.id == proposal_id)
        if lock:
            statement = statement.with_for_update()
        return (await self._session.scalars(statement)).one_or_none()

    async def pending_for(self, product_ids: Sequence[UUID]) -> dict[UUID, UUID]:
        if not product_ids:
            return {}
        statement = select(VendorProposal.product_id, VendorProposal.id).where(
            VendorProposal.product_id.in_(product_ids), VendorProposal.status == ProposalStatus.PENDING
        )
        return {
            pid: proposal_id for pid, proposal_id in (await self._session.execute(statement)).tuples() if pid
        }

    async def status_counts(self, manufacturer_id: UUID | None = None) -> dict[str, int]:
        statement = select(VendorProposal.status, func.count()).group_by(VendorProposal.status)
        if manufacturer_id is not None:
            statement = statement.where(VendorProposal.manufacturer_id == manufacturer_id)
        return {str(status): int(n) for status, n in (await self._session.execute(statement)).tuples()}

    async def user_names(self, user_ids: set[UUID]) -> dict[UUID, tuple[str, str]]:
        if not user_ids:
            return {}
        rows = await self._session.execute(
            select(User.id, User.name, User.email).where(User.id.in_(user_ids))
        )
        return {uid: (name, email) for uid, name, email in rows.tuples()}

    def add(self, row: VendorProposal) -> None:
        self._session.add(row)

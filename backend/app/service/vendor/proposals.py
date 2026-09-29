from collections.abc import Sequence
from dataclasses import replace
from datetime import UTC, datetime
from uuid import UUID

from app.core.errors import ConflictError, InvalidInputError, NotFoundError
from app.db.models import Manufacturer, Product, VendorProposal
from app.db.repositories.catalog import CatalogRepository
from app.db.repositories.catalog_admin import CATALOG_VERSION_KEY, CatalogAdminRepository
from app.db.repositories.reference import ReferenceRepository
from app.db.repositories.vendor import VendorRepository
from app.db.uow import UnitOfWork
from app.domain.admin import ProductInput, SpecInput
from app.domain.auth import CurrentUser
from app.domain.catalog import Badge
from app.domain.common.provenance import ProvenanceStatus
from app.domain.vendor import (
    ManufacturerRef,
    ProposalDecision,
    ProposalInfo,
    ProposalKind,
    ProposalStatus,
    product_from_json,
    product_to_json,
    spec_from_json,
    spec_to_json,
)
from app.service.admin.catalog import CatalogAdminService, check_specs

NOT_BOUND = "Учётная запись производителя не привязана к компании — обратитесь к администратору платформы"
NOT_YOURS = "Продукт не найден среди продуктов вашей компании"
# Badges the admin grants (registry, ФЦ БАС tests); a vendor cannot award them to itself.
_ADMIN_BADGES = frozenset({Badge.IN_REGISTRY_719, Badge.TESTED_FCBAS})
_REVIEWABLE_SPEC_STATUSES = frozenset({ProvenanceStatus.VENDOR_CLAIM, ProvenanceStatus.CONFIRMED})


def manufacturer_ref(row: Manufacturer) -> ManufacturerRef:
    return ManufacturerRef(
        id=row.id, name=row.name, country=row.country, region=row.region, website=row.website
    )


async def vendor_manufacturer(uow: UnitOfWork, user: CurrentUser) -> Manufacturer:
    """The company a vendor account speaks for; everything in the cabinet is scoped to it."""
    profile = await uow.users.get(user.id)
    manufacturer_id = profile.vendor_manufacturer_id if profile else None
    manufacturer = await uow.session.get(Manufacturer, manufacturer_id) if manufacturer_id else None
    if manufacturer is None:
        raise ConflictError(NOT_BOUND)
    return manufacturer


class ProposalService:
    """Vendor edits reach the catalog only through an admin's approval (ТЗ 3.1.1, D-033)."""

    def __init__(self, uow: UnitOfWork, user: CurrentUser) -> None:
        self._uow = uow
        self._user = user
        self._repo = VendorRepository(uow.session)
        self._catalog = CatalogRepository(uow.session)
        self._admin_repo = CatalogAdminRepository(uow.session)

    async def submit(
        self, product_id: UUID | None, card: ProductInput | None, specs: Sequence[SpecInput], comment: str
    ) -> ProposalInfo:
        manufacturer = await vendor_manufacturer(self._uow, self._user)
        product = await self._own_product(product_id, manufacturer.id) if product_id else None
        if product is None and card is None:
            raise InvalidInputError("Для нового продукта заполните карточку")
        if product is None and specs:
            raise InvalidInputError("ТТХ нового продукта отправьте после его одобрения")
        if card is None and not specs:
            raise InvalidInputError("Заявка пуста: измените карточку или добавьте характеристики")
        if product is not None and product.id in await self._repo.pending_for([product.id]):
            raise ConflictError("По продукту уже есть заявка на модерации: дождитесь решения или отзовите её")
        if card is not None:
            card = _as_manufacturer(card, manufacturer)
            await self._check_card(card)
        claims = [replace(spec, status=ProvenanceStatus.VENDOR_CLAIM) for spec in specs]
        if claims:
            keys = await self._admin_repo.spec_keys()
            check_specs(claims, {key: row.value_type for key, row in keys.items()})
        row = VendorProposal(
            manufacturer_id=manufacturer.id,
            product_id=product.id if product else None,
            kind=ProposalKind.UPDATE if product else ProposalKind.NEW_PRODUCT,
            status=ProposalStatus.PENDING,
            product_name=card.name.strip() if card else product.name if product else "",
            card=product_to_json(card) if card else None,
            specs=[spec_to_json(spec) for spec in claims],
            comment=comment.strip(),
            catalog_version=await ReferenceRepository(self._uow.session).data_version(CATALOG_VERSION_KEY)
            or "none",
            author_id=self._user.id,
        )
        self._repo.add(row)
        await self._uow.flush()
        return (await self._infos([row]))[0]

    async def mine(self) -> list[ProposalInfo]:
        manufacturer = await vendor_manufacturer(self._uow, self._user)
        return await self._infos(await self._repo.proposals(manufacturer_id=manufacturer.id))

    async def withdraw(self, proposal_id: UUID) -> ProposalInfo:
        manufacturer = await vendor_manufacturer(self._uow, self._user)
        row = await self._repo.proposal(proposal_id, lock=True)
        if row is None or row.manufacturer_id != manufacturer.id:
            raise NotFoundError("Заявка не найдена")
        if row.status != ProposalStatus.PENDING:
            raise ConflictError("Отозвать можно только заявку на модерации")
        row.status = ProposalStatus.WITHDRAWN
        await self._uow.flush()
        return (await self._infos([row]))[0]

    async def queue(self, status: ProposalStatus | None) -> list[ProposalInfo]:
        return await self._infos(await self._repo.proposals(status=status))

    async def review(
        self,
        proposal_id: UUID,
        decision: ProposalDecision,
        comment: str | None,
        specs_status: ProvenanceStatus = ProvenanceStatus.VENDOR_CLAIM,
    ) -> ProposalInfo:
        row = await self._repo.proposal(proposal_id, lock=True)
        if row is None:
            raise NotFoundError("Заявка не найдена")
        if row.status != ProposalStatus.PENDING:
            raise ConflictError("Заявка уже рассмотрена или отозвана")
        note = comment.strip() if comment and comment.strip() else None
        if decision == ProposalDecision.REJECT:
            if note is None:
                raise InvalidInputError("Объясните производителю причину отказа")
        else:
            if specs_status not in _REVIEWABLE_SPEC_STATUSES:
                raise InvalidInputError(
                    "Характеристики принимаются как заявка производителя или подтверждённые"
                )
            row.product_id = await self._apply(row, specs_status)
        row.status = (
            ProposalStatus.APPROVED if decision == ProposalDecision.APPROVE else ProposalStatus.REJECTED
        )
        row.reviewer_id = self._user.id
        row.reviewed_at = datetime.now(UTC)
        row.review_comment = note
        await self._uow.flush()
        return (await self._infos([row]))[0]

    async def _apply(self, row: VendorProposal, specs_status: ProvenanceStatus) -> UUID:
        service = CatalogAdminService(self._uow, self._user.email)
        card = product_from_json(row.card) if row.card else None
        product_id = row.product_id
        if product_id is None:
            assert card is not None
            product_id = (await service.create(card)).summary.id
        elif card is not None:
            current = await self._catalog.get(product_id)
            kept = [Badge(b) for b in current.badges if Badge(b) in _ADMIN_BADGES] if current else []
            await service.update(product_id, replace(card, badges=kept))
        if row.specs:
            reviewed = f"Заявка производителя от {row.created_at:%d.%m.%Y}, одобрил {self._user.email}"
            specs = [spec_from_json(raw) for raw in row.specs]
            specs = [
                replace(
                    spec,
                    status=specs_status,
                    source=replace(spec.source, note=spec.source.note or reviewed),
                )
                for spec in specs
            ]
            await service.upsert_specs(product_id, specs)
        return product_id

    async def _own_product(self, product_id: UUID, manufacturer_id: UUID) -> Product:
        product = await self._catalog.get(product_id)
        if product is None or product.hidden_at is not None or product.manufacturer_id != manufacturer_id:
            raise NotFoundError(NOT_YOURS)
        return product

    async def _check_card(self, card: ProductInput) -> None:
        """The same checks the admin form runs, so moderation never meets a card it cannot save."""
        if await self._admin_repo.solution_type(card.solution_type) is None:
            raise InvalidInputError(f"Тип решения «{card.solution_type}» не найден в справочнике")
        unknown = sorted(set(card.processes) - await self._admin_repo.process_keys(card.object_types))
        if unknown:
            raise InvalidInputError(f"Процессы {', '.join(unknown)} не относятся к выбранным типам объектов")
        industries = await self._admin_repo.industry_keys()
        for offer in card.offers:
            if offer.industry.strip() not in industries:
                raise InvalidInputError(f"Отрасль «{offer.industry}» не найдена в справочнике")

    async def _infos(self, rows: Sequence[VendorProposal]) -> list[ProposalInfo]:
        users = await self._repo.user_names(
            {uid for row in rows for uid in (row.author_id, row.reviewer_id) if uid is not None}
        )
        products = {
            p.id: p for p in await self._catalog.get_many([row.product_id for row in rows if row.product_id])
        }
        manufacturers = {m.id: m for m in await self._repo.manufacturers()}
        result: list[ProposalInfo] = []
        for row in rows:
            author = users.get(row.author_id) if row.author_id else None
            reviewer = users.get(row.reviewer_id) if row.reviewer_id else None
            product = products.get(row.product_id) if row.product_id else None
            changed = (
                row.status == ProposalStatus.PENDING
                and product is not None
                and product.updated_at > row.created_at
            )
            result.append(
                ProposalInfo(
                    id=row.id,
                    kind=row.kind,
                    status=row.status,
                    manufacturer=manufacturer_ref(manufacturers[row.manufacturer_id]),
                    product_id=row.product_id,
                    product_name=product.name if product and row.card is None else row.product_name,
                    card=row.card,
                    specs=list(row.specs),
                    comment=row.comment,
                    author_name=author[0] if author else None,
                    author_email=author[1] if author else None,
                    created_at=row.created_at,
                    catalog_version=row.catalog_version,
                    product_changed_since=changed,
                    reviewed_at=row.reviewed_at,
                    reviewer_name=reviewer[0] if reviewer else None,
                    review_comment=row.review_comment,
                )
            )
        return result


def _as_manufacturer(card: ProductInput, manufacturer: Manufacturer) -> ProductInput:
    """The company comes from the account binding, not from the form: a vendor edits only its own cards."""
    return replace(
        card,
        manufacturer_name=manufacturer.name,
        manufacturer_country=manufacturer.country,
        manufacturer_region=manufacturer.region,
        badges=[],
    )

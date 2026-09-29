from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.api.schemas.admin import OfferWrite, ProductWrite, SourceWrite, SpecWrite
from app.api.schemas.base import ApiModel
from app.api.schemas.catalog import Manufacturer, Product
from app.api.schemas.common import Money
from app.domain.admin import SourceInput
from app.domain.common.provenance import ProvenanceStatus
from app.domain.reference import ObjectTypeKey
from app.domain.vendor import (
    ManufacturerRef,
    ProposalDecision,
    ProposalInfo,
    ProposalKind,
    ProposalStatus,
    VendorFit as VendorFitInfo,
    VendorOverview as VendorOverviewInfo,
    product_from_json,
    spec_from_json,
)


def _source(source: SourceInput) -> SourceWrite:
    return SourceWrite(
        kind=source.kind,
        title=source.title,
        url=source.url,
        retrieved_at=source.retrieved_at,
        note=source.note,
    )


def _card(raw: dict[str, Any]) -> ProductWrite:
    card = product_from_json(raw)
    return ProductWrite(
        name=card.name,
        manufacturer_name=card.manufacturer_name,
        manufacturer_country=card.manufacturer_country,
        manufacturer_region=card.manufacturer_region,
        solution_type=card.solution_type,
        subtype=card.subtype,
        status=card.status,
        trl=card.trl,
        market_potential=card.market_potential,
        description=card.description,
        image_url=card.image_url,
        object_types=[ObjectTypeKey(t) for t in card.object_types],
        processes=card.processes,
        badges=card.badges,
        offers=[
            OfferWrite(
                industry=offer.industry,
                scenario=offer.scenario,
                price=Money(amount_rub=offer.price_rub, vat_included=offer.vat_included),
                cases_text=offer.cases_text,
                source=_source(offer.source) if offer.source else None,
            )
            for offer in card.offers
        ],
    )


def _spec(raw: dict[str, Any]) -> SpecWrite:
    spec = spec_from_json(raw)
    status: Literal["confirmed", "vendor_claim", "assumption"] = (
        "confirmed" if spec.status == ProvenanceStatus.CONFIRMED else "vendor_claim"
    )
    return SpecWrite(
        key=spec.key,
        value=spec.value,
        unit=spec.unit,
        status=status,
        source=_source(spec.source),
        note=spec.note,
    )


def _manufacturer(ref: ManufacturerRef) -> Manufacturer:
    return Manufacturer(id=ref.id, name=ref.name, country=ref.country, region=ref.region, website=ref.website)


class ProposalWrite(ApiModel):
    product_id: UUID | None = Field(default=None, description="null — предложить новый продукт")
    card: ProductWrite | None = Field(
        default=None, description="Новая карточка и цены; производитель берётся из привязки учётной записи"
    )
    specs: list[SpecWrite] = Field(default_factory=list, description="Сохраняются со статусом vendor_claim")
    comment: str = Field(
        min_length=1, max_length=2000, description="Что изменилось и почему — для модератора"
    )


class ProposalPerson(ApiModel):
    name: str
    email: str


class Proposal(ApiModel):
    id: UUID
    kind: ProposalKind
    status: ProposalStatus
    manufacturer: Manufacturer
    product_id: UUID | None = None
    product_name: str
    card: ProductWrite | None = None
    specs: list[SpecWrite]
    comment: str
    author: ProposalPerson | None = None
    created_at: datetime
    catalog_version: str = Field(description="Версия каталога, на которой вендор готовил заявку")
    product_changed_since: bool = Field(
        description="Карточку меняли после подачи заявки — сверьте перед решением"
    )
    reviewed_at: datetime | None = None
    reviewer_name: str | None = None
    review_comment: str | None = None

    @classmethod
    def from_domain(cls, item: ProposalInfo) -> "Proposal":
        return cls(
            id=item.id,
            kind=item.kind,
            status=item.status,
            manufacturer=_manufacturer(item.manufacturer),
            product_id=item.product_id,
            product_name=item.product_name,
            card=_card(item.card) if item.card else None,
            specs=[_spec(raw) for raw in item.specs],
            comment=item.comment,
            author=ProposalPerson(name=item.author_name, email=item.author_email)
            if item.author_name and item.author_email
            else None,
            created_at=item.created_at,
            catalog_version=item.catalog_version,
            product_changed_since=item.product_changed_since,
            reviewed_at=item.reviewed_at,
            reviewer_name=item.reviewer_name,
            review_comment=item.review_comment,
        )


class ProposalList(ApiModel):
    items: list[Proposal]
    total: int

    @classmethod
    def from_domain(cls, items: list[ProposalInfo]) -> "ProposalList":
        return cls(items=[Proposal.from_domain(item) for item in items], total=len(items))


class ProposalReview(ApiModel):
    decision: ProposalDecision
    comment: str | None = Field(default=None, max_length=2000, description="Обязателен при отказе")
    specs_status: Literal["vendor_claim", "confirmed"] = Field(
        default="vendor_claim",
        description="С каким статусом принять ТТХ: заявка производителя или подтверждено (проверен источник)",
    )


class KeySpec(ApiModel):
    key: str
    name: str


class VendorProduct(ApiModel):
    product: Product
    missing_key_specs: list[KeySpec] = Field(
        description="Ключевые ТТХ типа решения без значения — подбор их проверить не может"
    )
    relevant_projects: int = Field(description="Проекты платформы с типами объектов этого продукта")
    scenarios_count: int = Field(description="Сценарии, в которые продукт включён")
    manual_adds: int = Field(description="Сколько раз пользователи добавили продукт в подбор вручную")
    pending_proposal_id: UUID | None = None


class VendorGapItem(ApiModel):
    object_type: str
    process_key: str
    process_name: str
    no_fit_count: int
    solution_types: list[str]


class VendorOverview(ApiModel):
    manufacturer: Manufacturer
    products: list[VendorProduct]
    projects_total: int
    projects_by_object_type: dict[str, int]
    scenarios_with_products: int
    proposals_by_status: dict[str, int]
    gaps: list[VendorGapItem] = Field(
        description="Процессы без подходящих продуктов в каталоге — там, где работают ваши типы решений"
    )

    @classmethod
    def from_domain(cls, item: VendorOverviewInfo) -> "VendorOverview":
        stats = {s.product_id: s for s in item.stats}
        return cls(
            manufacturer=_manufacturer(item.manufacturer),
            products=[
                VendorProduct(
                    product=Product.from_domain(summary),
                    missing_key_specs=[
                        KeySpec(key=g.key, name=g.name) for g in stats[summary.id].missing_key_specs
                    ],
                    relevant_projects=stats[summary.id].relevant_projects,
                    scenarios_count=stats[summary.id].scenarios_count,
                    manual_adds=stats[summary.id].manual_adds,
                    pending_proposal_id=stats[summary.id].pending_proposal_id,
                )
                for summary in item.products
            ],
            projects_total=item.projects_total,
            projects_by_object_type=item.projects_by_object_type,
            scenarios_with_products=item.scenarios_with_products,
            proposals_by_status=item.proposals_by_status,
            gaps=[
                VendorGapItem(
                    object_type=g.object_type,
                    process_key=g.process_key,
                    process_name=g.process_name,
                    no_fit_count=g.no_fit_count,
                    solution_types=g.solution_types,
                )
                for g in item.gaps
            ],
        )


class ManufacturerList(ApiModel):
    items: list[Manufacturer]


class FitReasonItem(ApiModel):
    code: str
    text: str = Field(description="Пример формулировки из одного проекта")
    spec_key: str | None = None
    count: int


class FitMissingItem(ApiModel):
    spec_key: str
    name: str
    count: int


class ProductFitItem(ApiModel):
    product_id: UUID
    appearances: int = Field(description="Сколько раз продукт был кандидатом (проект × процесс)")
    fit: int
    check: int
    excluded: int
    manual: int
    top3: int = Field(description="Сколько раз продукт в тройке лучших среди подходящих")
    blocking: list[FitReasonItem] = Field(description="Частые причины исключения")
    missing: list[FitMissingItem] = Field(description="Каких ТТХ не хватило подбору для проверки")


class VendorFit(ApiModel):
    projects_analysed: int
    computed_at: datetime
    products: list[ProductFitItem]

    @classmethod
    def from_domain(cls, item: VendorFitInfo) -> "VendorFit":
        return cls(
            projects_analysed=item.projects_analysed,
            computed_at=item.computed_at,
            products=[
                ProductFitItem(
                    product_id=p.product_id,
                    appearances=p.appearances,
                    fit=p.fit,
                    check=p.check,
                    excluded=p.excluded,
                    manual=p.manual,
                    top3=p.top3,
                    blocking=[
                        FitReasonItem(code=r.code, text=r.text, spec_key=r.spec_key, count=r.count)
                        for r in p.blocking
                    ],
                    missing=[
                        FitMissingItem(spec_key=m.spec_key, name=m.name, count=m.count) for m in p.missing
                    ],
                )
                for p in item.products
            ],
        )

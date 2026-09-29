from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query, status

from app.api.deps import UowDep, require
from app.api.schemas.catalog import Manufacturer
from app.api.schemas.vendor import (
    ManufacturerList,
    Proposal,
    ProposalList,
    ProposalReview,
    ProposalWrite,
    VendorFit,
    VendorOverview,
)
from app.db.repositories.vendor import VendorRepository
from app.domain.auth import CurrentUser, Permission
from app.domain.common.provenance import ProvenanceStatus
from app.domain.vendor import ProposalStatus
from app.service.vendor import ProposalService, VendorFitService, VendorOverviewService

router = APIRouter()

VendorDep = Annotated[CurrentUser, Depends(require(Permission.CATALOG_PROPOSE))]
CatalogAdmin = Annotated[CurrentUser, Depends(require(Permission.CATALOG_WRITE))]
ProposalIdPath = Annotated[UUID, Path()]
NOT_FOUND: dict[int | str, dict[str, Any]] = {404: {"description": "Не найдено"}}
CONFLICT: dict[int | str, dict[str, Any]] = {409: {"description": "Конфликт"}}


@router.get(
    "/vendor/overview",
    tags=["vendor"],
    operation_id="vendorOverview",
    summary="Кабинет производителя: продукты, пробелы карточек, спрос",
    responses=CONFLICT,
)
async def vendor_overview(user: VendorDep, uow: UowDep) -> VendorOverview:
    return VendorOverview.from_domain(await VendorOverviewService(uow, user).overview())


@router.get(
    "/vendor/fit",
    tags=["vendor"],
    operation_id="vendorFit",
    summary="Как продукты проходят подбор в проектах платформы: статусы, причины исключения, недостающие ТТХ",
    responses=CONFLICT,
)
async def vendor_fit(user: VendorDep, uow: UowDep) -> VendorFit:
    return VendorFit.from_domain(await VendorFitService(uow, user).fit())


@router.get(
    "/vendor/proposals",
    tags=["vendor"],
    operation_id="vendorListProposals",
    summary="Заявки производителя на правку каталога",
    responses=CONFLICT,
)
async def vendor_list_proposals(user: VendorDep, uow: UowDep) -> ProposalList:
    return ProposalList.from_domain(await ProposalService(uow, user).mine())


@router.post(
    "/vendor/proposals",
    tags=["vendor"],
    operation_id="vendorCreateProposal",
    summary="Предложить правку своей карточки или новый продукт (на модерацию)",
    status_code=status.HTTP_201_CREATED,
    responses={**NOT_FOUND, **CONFLICT},
)
async def vendor_create_proposal(payload: ProposalWrite, user: VendorDep, uow: UowDep) -> Proposal:
    proposal = await ProposalService(uow, user).submit(
        payload.product_id,
        payload.card.to_domain() if payload.card else None,
        [spec.to_domain() for spec in payload.specs],
        payload.comment,
    )
    return Proposal.from_domain(proposal)


@router.post(
    "/vendor/proposals/{proposal_id}/withdraw",
    tags=["vendor"],
    operation_id="vendorWithdrawProposal",
    summary="Отозвать заявку до решения модератора",
    responses={**NOT_FOUND, **CONFLICT},
)
async def vendor_withdraw_proposal(proposal_id: ProposalIdPath, user: VendorDep, uow: UowDep) -> Proposal:
    return Proposal.from_domain(await ProposalService(uow, user).withdraw(proposal_id))


@router.get(
    "/admin/proposals",
    tags=["admin"],
    operation_id="adminListProposals",
    summary="Заявки производителей на модерацию",
)
async def admin_list_proposals(
    user: CatalogAdmin,
    uow: UowDep,
    proposal_status: Annotated[ProposalStatus | None, Query(alias="status")] = None,
) -> ProposalList:
    return ProposalList.from_domain(await ProposalService(uow, user).queue(proposal_status))


@router.post(
    "/admin/proposals/{proposal_id}/review",
    tags=["admin"],
    operation_id="adminReviewProposal",
    summary="Одобрить заявку (правка попадает в каталог, версия каталога растёт) или отклонить с причиной",
    responses={**NOT_FOUND, **CONFLICT},
)
async def admin_review_proposal(
    proposal_id: ProposalIdPath, payload: ProposalReview, user: CatalogAdmin, uow: UowDep
) -> Proposal:
    proposal = await ProposalService(uow, user).review(
        proposal_id, payload.decision, payload.comment, ProvenanceStatus(payload.specs_status)
    )
    return Proposal.from_domain(proposal)


@router.get(
    "/admin/manufacturers",
    tags=["admin"],
    operation_id="adminListManufacturers",
    summary="Производители — для привязки учётной записи вендора",
)
async def admin_list_manufacturers(_: CatalogAdmin, uow: UowDep) -> ManufacturerList:
    repo = VendorRepository(uow.session)
    counts = await repo.product_counts()
    return ManufacturerList(
        items=[
            Manufacturer(id=m.id, name=m.name, country=m.country, region=m.region, website=m.website)
            for m in await repo.manufacturers()
            if counts.get(m.id, 0) > 0
        ]
    )

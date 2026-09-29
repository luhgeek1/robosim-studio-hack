from collections import Counter
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select

from app.db.models import Project
from app.db.repositories.matching import MatchingRepository
from app.db.repositories.vendor import VendorRepository
from app.db.uow import UnitOfWork
from app.domain.auth import CurrentUser
from app.domain.vendor import FitMissing, FitReason, ProductFit, VendorFit
from app.engine.matching import CandidateStatus, Severity
from app.service.matching.service import MatchingService
from app.service.projects.context import ProjectLoader
from app.service.vendor.proposals import vendor_manufacturer

# Response-time cap, not a model coefficient: matching one project takes ~0.1–0.3 s, so the vendor's page
# stays within a few seconds on the most recently edited projects.
FIT_PROJECTS_LIMIT = 30
TOP_PLACES = 3
TOP_ITEMS = 5


class VendorFitService:
    """How the vendor's products fare in matching, aggregated over projects (no project data)."""

    def __init__(self, uow: UnitOfWork, user: CurrentUser) -> None:
        self._uow = uow
        self._user = user

    async def fit(self) -> VendorFit:
        manufacturer = await vendor_manufacturer(self._uow, self._user)
        products = await VendorRepository(self._uow.session).products(manufacturer.id)
        ids = {p.id for p in products}
        object_types = sorted({t for p in products for t in p.object_types})
        statement = (
            select(Project)
            .where(Project.object_type.in_(object_types))
            .order_by(Project.updated_at.desc())
            .limit(FIT_PROJECTS_LIMIT)
        )
        projects = list((await self._uow.session.scalars(statement)).all()) if object_types else []
        contexts = await ProjectLoader(self._uow).contexts(projects)
        matching = MatchingService(self._uow, self._user)
        settings_repo = MatchingRepository(self._uow.session)
        statuses: dict[UUID, Counter[str]] = {pid: Counter() for pid in ids}
        top3: Counter[UUID] = Counter()
        blocking: dict[UUID, Counter[tuple[str, str | None]]] = {pid: Counter() for pid in ids}
        example: dict[tuple[UUID, str, str | None], str] = {}
        missing: dict[UUID, Counter[str]] = {pid: Counter() for pid in ids}
        names: dict[str, str] = {}
        for context in contexts:
            outcome = await matching.outcome(context, await settings_repo.settings(context.project.id))
            for process in outcome.processes:
                for candidate in process.candidates:
                    pid = candidate.data.product.id
                    if pid not in ids:
                        continue
                    result = candidate.result
                    statuses[pid][result.status.value] += 1
                    if result.rank is not None and result.rank <= TOP_PLACES:
                        top3[pid] += 1
                    if result.status == CandidateStatus.EXCLUDED:
                        for reason in result.reasons:
                            if reason.severity == Severity.BLOCKING:
                                key = (reason.code, reason.spec_key)
                                blocking[pid][key] += 1
                                example.setdefault((pid, *key), reason.text)
                    for gap in result.missing_data:
                        missing[pid][gap.spec_key] += 1
                        names[gap.spec_key] = gap.name
        return VendorFit(
            projects_analysed=len(contexts),
            computed_at=datetime.now(UTC),
            products=[
                ProductFit(
                    product_id=p.id,
                    appearances=sum(statuses[p.id].values()),
                    fit=statuses[p.id][CandidateStatus.FIT.value],
                    check=statuses[p.id][CandidateStatus.CHECK.value],
                    excluded=statuses[p.id][CandidateStatus.EXCLUDED.value],
                    manual=statuses[p.id][CandidateStatus.MANUAL.value],
                    top3=top3[p.id],
                    blocking=[
                        FitReason(code=code, text=example[(p.id, code, spec)], spec_key=spec, count=n)
                        for (code, spec), n in blocking[p.id].most_common(TOP_ITEMS)
                    ],
                    missing=[
                        FitMissing(spec_key=key, name=names[key], count=n)
                        for key, n in missing[p.id].most_common(TOP_ITEMS)
                    ],
                )
                for p in products
            ],
        )

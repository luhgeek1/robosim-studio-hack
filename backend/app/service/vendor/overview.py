from app.db.repositories.analytics import AnalyticsRepository
from app.db.repositories.catalog import CatalogRepository
from app.db.repositories.reference import ReferenceRepository
from app.db.repositories.vendor import VendorRepository
from app.db.uow import UnitOfWork
from app.domain.auth import CurrentUser
from app.domain.vendor import KeySpecGap, VendorGap, VendorOverview, VendorProductStats
from app.service.catalog import CatalogService
from app.service.catalog.mappers import to_summary
from app.service.vendor.proposals import manufacturer_ref, vendor_manufacturer


class VendorOverviewService:
    """What the vendor's cabinet opens with: its cards, their gaps and the demand around them.

    Demand is aggregated over all projects of the platform without names, owners or parameters: a vendor sees
    how many objects of which type are being assessed, never whose they are (ТЗ 4.4.3).
    """

    def __init__(self, uow: UnitOfWork, user: CurrentUser) -> None:
        self._uow = uow
        self._user = user
        self._repo = VendorRepository(uow.session)
        self._catalog = CatalogRepository(uow.session)

    async def overview(self) -> VendorOverview:
        manufacturer = await vendor_manufacturer(self._uow, self._user)
        products = list(await self._repo.products(manufacturer.id))
        ids = [p.id for p in products]
        names = await self._catalog.solution_type_names()
        spec_names = {k.key: k.name for k in await ReferenceRepository(self._uow.session).spec_keys()}
        object_types = sorted({t for p in products for t in p.object_types})
        by_type = await self._repo.projects_by_object_type(object_types)
        scenarios = await self._repo.scenario_counts(ids)
        manual = await self._repo.manual_counts(ids)
        pending = await self._repo.pending_for(ids)
        catalog = CatalogService(self._uow)
        stats: list[VendorProductStats] = []
        for product in products:
            detail = await catalog.detail(product.id)
            stats.append(
                VendorProductStats(
                    product_id=product.id,
                    missing_key_specs=[
                        KeySpecGap(key=key, name=spec_names.get(key, key)) for key in detail.missing_key_specs
                    ],
                    relevant_projects=sum(by_type.get(t, 0) for t in set(product.object_types)),
                    scenarios_count=scenarios.get(product.id, 0),
                    manual_adds=manual.get(product.id, 0),
                    pending_proposal_id=pending.get(product.id),
                )
            )
        return VendorOverview(
            manufacturer=manufacturer_ref(manufacturer),
            products=[to_summary(p, manufacturer, names) for p in products],
            stats=stats,
            projects_total=sum(by_type.values()),
            projects_by_object_type=by_type,
            scenarios_with_products=await self._repo.scenarios_with_any(ids),
            proposals_by_status=await self._repo.status_counts(manufacturer.id),
            gaps=await self._gaps({p.solution_type for p in products}),
        )

    async def _gaps(self, solution_types: set[str]) -> list[VendorGap]:
        """Assessed processes that no catalog product serves, among the vendor's solution types."""
        processes = {(p.object_type, p.key): p for p in await self._repo.process_defs()}
        result: list[VendorGap] = []
        for gap in await AnalyticsRepository(self._uow.session, None, None).catalog_gaps():
            process = processes.get((gap.object_type, gap.process_key))
            if process is None:
                continue
            matching = sorted(solution_types & set(process.solution_types))
            if matching:
                result.append(
                    VendorGap(
                        object_type=gap.object_type,
                        process_key=gap.process_key,
                        process_name=process.name,
                        no_fit_count=gap.no_fit_count,
                        solution_types=matching,
                    )
                )
        return result

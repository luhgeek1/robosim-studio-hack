import hashlib
import json
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from app.core.versions import ENGINE_VERSION
from app.db.models import Norm, Product, ProductOffer, Project, Scenario, ScenarioItem, Source, SpecKey
from app.db.repositories.catalog import CatalogRepository
from app.db.repositories.matching import MatchingRepository
from app.db.repositories.reference import ReferenceRepository
from app.db.repositories.sources import to_source
from app.db.uow import UnitOfWork
from app.domain.common.provenance import Provenance, ProvenanceStatus, SourceInfo
from app.domain.project.params import PERCENT_UNIT
from app.domain.reference import ProcessDef
from app.domain.scenario.models import CountMode, NormOverride
from app.engine.calculation import CalculationInput, ItemInput, ParamMeta
from app.engine.matching import CandidateStatus, evaluate
from app.engine.trace import Book, InputKind, Quantity
from app.service.matching.candidates import ProcessSizing, build_candidate, choose_offer, spec_book
from app.service.projects.context import ProjectContext
from app.service.projects.norms import NormLoader
from app.service.scenarios.views import Versions, financing_from_json, financing_to_json, overrides_from_json

PERCENT = 100
TEAM_SOURCE_KIND = "team_assumption"
_SHARE_UNIT = "доля"


@dataclass(slots=True)
class Snapshot:
    """Everything one calculation reads, frozen at calculation time: engine input and provenance."""

    input: CalculationInput
    project: Project
    scenario: Scenario
    versions: Versions
    norm_rows: dict[str, Norm]
    overrides: dict[str, NormOverride]
    sources: dict[UUID, Source]
    param_provenance: dict[str, Provenance]
    spec_status: dict[str, dict[str, ProvenanceStatus]]
    candidate_status: dict[str, str]
    budget_rub: float | None
    inputs: dict[str, Any] = field(default_factory=dict)

    @property
    def inputs_hash(self) -> str:
        payload = json.dumps(self.inputs, sort_keys=True, ensure_ascii=False, default=str)
        return hashlib.sha256(payload.encode()).hexdigest()

    @property
    def assumption_norms(self) -> frozenset[str]:
        return frozenset(
            key
            for key, norm in self.norm_rows.items()
            if (source := self.sources.get(norm.source_id)) is not None and source.kind == TEAM_SOURCE_KIND
        )

    def norm_source(self, key: str) -> SourceInfo | None:
        norm = self.norm_rows.get(key)
        source = self.sources.get(norm.source_id) if norm else None
        return to_source(source) if source else None


def _param_meta(context: ProjectContext) -> dict[str, ParamMeta]:
    return {
        p.key: ParamMeta(
            name=p.definition.name,
            unit=_SHARE_UNIT if p.definition.unit == PERCENT_UNIT else p.definition.unit,
            status=p.provenance.status,
        )
        for p in context.params
    }


class SnapshotBuilder:
    def __init__(self, uow: UnitOfWork) -> None:
        self._catalog = CatalogRepository(uow.session)
        self._reference = ReferenceRepository(uow.session)
        self._matching = MatchingRepository(uow.session)
        self._norms = NormLoader(uow)

    async def norms(self, object_type: str, overrides: list[NormOverride]) -> tuple[Book, dict[str, Norm]]:
        rows = {norm.key: norm for norm in await self._norms.rows(object_type)}
        changed = {o.norm_key: o for o in overrides}
        book = Book.of(
            InputKind.NORM,
            [
                (
                    key,
                    f"{norm.name} (изменено в сценарии)" if key in changed else norm.name,
                    changed[key].value if key in changed else norm.value,
                    norm.unit,
                )
                for key, norm in rows.items()
            ],
        )
        return book, rows

    async def build(
        self, context: ProjectContext, scenario: Scenario, versions: Versions, horizon_years: int
    ) -> Snapshot:
        project, object_type = context.project, context.object_type
        values = context.numeric()
        overrides = overrides_from_json(scenario.overrides)
        norms, rows = await self.norms(project.object_type, overrides)
        for key, quantity in norms.items.items():
            values.setdefault(key, quantity.value)
        items, spec_status, statuses = await self._items(context, scenario, norms, values)
        discount = (
            Quantity(
                "scenario_discount_rate",
                "Ставка дисконтирования (задана в сценарии)",
                scenario.discount_rate_pct / PERCENT,
                _SHARE_UNIT,
                InputKind.PARAM,
            )
            if scenario.discount_rate_pct is not None
            else norms.get("discount_rate")
        )
        financing = financing_from_json(scenario.financing)
        engine_input = CalculationInput(
            object_type=project.object_type,
            kind=scenario.kind,
            horizon_years=horizon_years,
            discount_rate=discount,
            financing=financing,
            params={k: v for k, v in context.numeric().items() if v is not None},
            param_meta=_param_meta(context),
            norms=norms,
            processes=object_type.processes,
            labor_groups=object_type.labor_groups,
            site_costs=object_type.site_costs,
            items=items,
        )
        sources = await self._reference.sources({norm.source_id for norm in rows.values()})
        budget = values.get("capex_budget_mln_rub")
        snapshot = Snapshot(
            input=engine_input,
            project=project,
            scenario=scenario,
            versions=versions,
            norm_rows=rows,
            overrides={o.norm_key: o for o in overrides},
            sources=sources,
            param_provenance={p.key: p.provenance for p in context.params},
            spec_status=spec_status,
            candidate_status=statuses,
            budget_rub=budget * 1_000_000 if budget else None,
        )
        snapshot.inputs = _inputs_json(snapshot, financing_to_json(financing))
        return snapshot

    async def _items(
        self, context: ProjectContext, scenario: Scenario, norms: Book, values: dict[str, float | None]
    ) -> tuple[list[ItemInput], dict[str, dict[str, ProvenanceStatus]], dict[str, str]]:
        product_ids = [item.product_id for item in scenario.items]
        products = {p.id: p for p in await self._catalog.get_many(product_ids)}
        offers = list(await self._catalog.offers_for(product_ids))
        specs = await self._catalog.specs(product_ids)
        keys: dict[str, SpecKey] = {k.key: k for k in await self._reference.spec_keys()}
        models = {t.key: t.sizing_model for t in await self._reference.solution_types()}
        cases = await self._catalog.cases_count(product_ids)
        manual = {(m.process_key, m.product_id) for m in await self._matching.manual(context.project.id)}
        settings = await self._matching.settings(context.project.id)
        industry = await self._catalog.industry_key(context.object_type.industry)
        processes = {p.key: p for p in context.object_type.processes}
        sizing = ProcessSizing(demand=None, norms=norms, distance=None, spec_keys=keys)
        result: list[ItemInput] = []
        spec_status: dict[str, dict[str, ProvenanceStatus]] = {}
        statuses: dict[str, str] = {}
        for item in scenario.items:
            product = products[item.product_id]
            own_specs = [s for s in specs if s.product_id == product.id]
            offer = self._offer(item, [o for o in offers if o.product_id == product.id], industry)
            data = build_candidate(product, offer, own_specs, cases.get(product.id, 0), None, sizing)
            process: ProcessDef = processes[item.process_key]
            include_rnd = settings.include_rnd if settings else False
            status = evaluate(data.input, process.requirements, values, include_rnd=include_rnd).status
            if (item.process_key, product.id) in manual:
                status = CandidateStatus.MANUAL
            statuses[item.process_key] = status.value
            spec_status[item.process_key] = {s.key: s.status for s in own_specs if s.is_primary}
            result.append(self._item_input(item, product, offer, spec_book(own_specs, keys), models, status))
        return result, spec_status, statuses

    @staticmethod
    def _offer(item: ScenarioItem, offers: list[ProductOffer], industry: str | None) -> ProductOffer | None:
        return next((o for o in offers if o.id == item.offer_id), None) or choose_offer(offers, industry)

    @staticmethod
    def _item_input(
        item: ScenarioItem,
        product: Product,
        offer: ProductOffer | None,
        specs: Book,
        models: dict[str, Any],
        status: CandidateStatus,
    ) -> ItemInput:
        catalog_price = offer.price_rub if offer else product.price_from_rub
        return ItemInput(
            process_key=item.process_key,
            product_id=product.id,
            product_name=product.name,
            solution_type=product.solution_type,
            sizing_model=models.get(product.solution_type),
            price=item.price_override_rub or catalog_price,
            specs=specs,
            price_overridden=item.price_override_rub is not None,
            count_mode=item.count_mode,
            count_manual=item.count_manual if item.count_mode == CountMode.MANUAL else None,
            stations_manual=item.stations_count if item.stations_mode == CountMode.MANUAL else None,
            throughput_override=item.throughput_override_per_hour,
            candidate_status=status.value,
        )


def _inputs_json(snapshot: Snapshot, financing: dict[str, Any]) -> dict[str, Any]:
    inp = snapshot.input
    return {
        "engine_version": ENGINE_VERSION,
        "object_type": inp.object_type,
        "kind": inp.kind.value,
        "horizon_years": inp.horizon_years,
        "discount_rate": inp.discount_rate.value,
        "financing": financing,
        "params": dict(sorted(inp.params.items())),
        "param_names": {k: meta.name for k, meta in sorted(inp.param_meta.items())},
        "norms": {k: q.value for k, q in sorted(inp.norms.items.items())},
        "norm_names": {k: q.name for k, q in sorted(inp.norms.items.items())},
        "overrides": snapshot.scenario.overrides,
        "candidate_status": snapshot.candidate_status,
        "items": [
            {
                "process_key": item.process_key,
                "product_id": str(item.product_id),
                "product_name": item.product_name,
                "price": item.price,
                "price_overridden": item.price_overridden,
                "specs": {k: q.value for k, q in sorted(item.specs.items.items())},
                "count_mode": item.count_mode.value,
                "count_manual": item.count_manual,
                "stations_manual": item.stations_manual,
                "throughput_override": item.throughput_override,
            }
            for item in inp.items
        ],
    }

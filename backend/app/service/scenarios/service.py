from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.core.errors import ConflictError, InvalidInputError, NotFoundError
from app.db.models import Product, ProductOffer, Project, Scenario, ScenarioItem
from app.db.repositories.catalog import CatalogRepository
from app.db.repositories.projects import ProjectRepository
from app.db.repositories.scenarios import ScenarioRepository
from app.db.uow import UnitOfWork
from app.domain.auth import CurrentUser
from app.domain.reference import ObjectTypeDetail
from app.domain.scenario.models import (
    CountMode,
    Financing,
    FinancingKind,
    NormOverride,
    ScenarioItemSpec,
    ScenarioKind,
)
from app.engine.matching import CandidateStatus
from app.service.matching.candidates import choose_offer
from app.service.matching.service import CandidateView, MatchingService
from app.service.projects.audit import AuditLog
from app.service.projects.context import ProjectLoader
from app.service.projects.norms import NormLoader
from app.service.scenarios.state import VersionReader
from app.service.scenarios.views import (
    ScenarioView,
    financing_to_json,
    overrides_to_json,
    scenario_view,
)

SCENARIO_NOT_FOUND = "Сценарий не найден или недоступен"
BASELINE_NAME = "Как сейчас"
KIND_NAMES = {
    ScenarioKind.PURCHASE: "Покупка",
    ScenarioKind.RAAS: "RaaS",
    ScenarioKind.LEASE: "Лизинг",
    ScenarioKind.BASELINE: BASELINE_NAME,
}
_ALLOWED_FINANCING = {
    ScenarioKind.PURCHASE: {FinancingKind.OWN_FUNDS, FinancingKind.LOAN},
    ScenarioKind.LEASE: {FinancingKind.LEASE},
    ScenarioKind.RAAS: {FinancingKind.OWN_FUNDS},
    ScenarioKind.BASELINE: {FinancingKind.OWN_FUNDS},
}


@dataclass(frozen=True, slots=True)
class ScenarioDraft:
    name: str
    kind: ScenarioKind
    items: list[ScenarioItemSpec] = field(default_factory=list)
    financing: Financing | None = None
    horizon_years: int | None = None
    discount_rate_pct: float | None = None
    overrides: list[NormOverride] = field(default_factory=list)
    from_recommendation: bool = False


@dataclass(frozen=True, slots=True)
class ScenarioPatch:
    fields: frozenset[str]
    name: str | None = None
    items: list[ScenarioItemSpec] | None = None
    financing: Financing | None = None
    horizon_years: int | None = None
    discount_rate_pct: float | None = None
    overrides: list[NormOverride] | None = None


def _snapshot(scenario: Scenario) -> dict[str, Any]:
    return {
        "name": scenario.name,
        "kind": scenario.kind.value,
        "version": scenario.version,
        "financing": scenario.financing,
        "horizon_years": scenario.horizon_years,
        "discount_rate_pct": scenario.discount_rate_pct,
        "overrides": scenario.overrides,
        "items": [
            {
                "process_key": i.process_key,
                "product_id": str(i.product_id),
                "count_mode": i.count_mode.value,
                "count_manual": i.count_manual,
                "price_override_rub": i.price_override_rub,
                "throughput_override_per_hour": i.throughput_override_per_hour,
                "override_reason": i.override_reason,
            }
            for i in scenario.items
        ],
    }


class ScenarioService:
    def __init__(self, uow: UnitOfWork, user: CurrentUser) -> None:
        self._uow = uow
        self._user = user
        self._repo = ScenarioRepository(uow.session)
        self._catalog = CatalogRepository(uow.session)
        self._loader = ProjectLoader(uow)
        self._norms = NormLoader(uow)
        self._versions = VersionReader(uow)
        self._audit = AuditLog(ProjectRepository(uow.session), user)

    async def owned(self, scenario_id: UUID, *, lock: bool = False) -> Scenario:
        scenario = await self._repo.get_owned(scenario_id, self._user.id, lock=lock)
        if scenario is None:
            raise NotFoundError(SCENARIO_NOT_FOUND)
        return scenario

    async def ensure_baseline(self, project: Project) -> None:
        scenarios = await self._repo.for_project(project.id)
        if any(s.is_baseline for s in scenarios):
            return
        self._repo.add(
            Scenario(
                project_id=project.id,
                name=BASELINE_NAME,
                kind=ScenarioKind.BASELINE,
                is_baseline=True,
                financing=financing_to_json(Financing()),
                overrides=[],
                created_by=self._user.email,
            )
        )
        await self._uow.flush()

    async def list_scenarios(self, project_id: UUID) -> list[ScenarioView]:
        project = await self._loader.project(self._user, project_id)
        await self.ensure_baseline(project)
        return await self.views(project, list(await self._repo.for_project(project.id)))

    async def get(self, scenario_id: UUID) -> ScenarioView:
        scenario = await self.owned(scenario_id)
        project = await self._loader.project(self._user, scenario.project_id)
        return (await self.views(project, [scenario]))[0]

    async def views(self, project: Project, scenarios: list[Scenario]) -> list[ScenarioView]:
        context = await self._loader.context(self._user, project.id)
        horizon = await self.default_horizon(project.object_type, context.numeric())
        runs = await self._repo.latest_runs([s.id for s in scenarios])
        versions = await self._versions.current(project)
        product_ids = list({item.product_id for s in scenarios for item in s.items})
        products = {p.id: p for p in await self._catalog.get_many(product_ids)}
        offers = {o.id: o for o in await self._catalog.offers_for(product_ids)}
        prices = {
            item.product_id: (offers[item.offer_id].price_rub if item.offer_id in offers else 0.0)
            or products[item.product_id].price_from_rub
            for s in scenarios
            for item in s.items
            if item.product_id in products
        }
        return [
            scenario_view(
                s,
                horizon_years=horizon,
                names={pid: p.name for pid, p in products.items()},
                prices=prices,
                run=runs.get(s.id),
                stale=s.id in runs and versions.is_stale(runs[s.id], s.version),
            )
            for s in scenarios
        ]

    async def default_horizon(self, object_type: str, values: dict[str, float | None]) -> int:
        """Dataset horizon (склад 5, аэропорт и больница 7), else the norm of the object type."""
        horizon = values.get("horizon_years")
        if horizon:
            return int(horizon)
        norms = await self._norms.book(object_type)
        return int(norms.value(f"horizon_years_{object_type}"))

    async def create(self, project_id: UUID, draft: ScenarioDraft) -> ScenarioView:
        project = await self._loader.project(self._user, project_id, lock=True)
        await self.ensure_baseline(project)
        if draft.kind == ScenarioKind.BASELINE:
            raise ConflictError("Базовый сценарий создаётся автоматически и в проекте только один")
        context = await self._loader.context(self._user, project_id)
        items = draft.items
        if draft.from_recommendation and not items:
            items = await self._recommended_items(project_id)
        financing = self._financing(draft.kind, draft.financing)
        scenario = Scenario(
            project_id=project.id,
            name=draft.name.strip(),
            kind=draft.kind,
            is_baseline=False,
            financing=financing_to_json(financing),
            horizon_years=draft.horizon_years,
            discount_rate_pct=draft.discount_rate_pct,
            overrides=overrides_to_json(await self._overrides(project.object_type, draft.overrides)),
            created_by=self._user.email,
        )
        scenario.items = await self._items(context.object_type, items)
        self._repo.add(scenario)
        await self._uow.flush()
        self._audit.write(project.id, f"scenario:{scenario.id}", "create", after=_snapshot(scenario))
        return await self.get(scenario.id)

    async def update(self, scenario_id: UUID, patch: ScenarioPatch) -> ScenarioView:
        scenario = await self.owned(scenario_id, lock=True)
        project = await self._loader.project(self._user, scenario.project_id)
        before = _snapshot(scenario)
        if "name" in patch.fields and patch.name:
            scenario.name = patch.name.strip()
        if "items" in patch.fields and patch.items is not None:
            if scenario.is_baseline and patch.items:
                raise InvalidInputError("В базовом сценарии нет роботов — создайте сценарий роботизации")
            context = await self._loader.context(self._user, project.id)
            items = await self._items(context.object_type, patch.items)
            _keep_simulation(scenario.items, items)
            # Old rows go first: the new composition may reuse the same (scenario, process) unique key.
            scenario.items.clear()
            await self._uow.flush()
            scenario.items = items
        if "financing" in patch.fields:
            scenario.financing = financing_to_json(self._financing(scenario.kind, patch.financing))
        if "horizon_years" in patch.fields:
            scenario.horizon_years = patch.horizon_years
        if "discount_rate_pct" in patch.fields:
            scenario.discount_rate_pct = patch.discount_rate_pct
        if "overrides" in patch.fields and patch.overrides is not None:
            overrides = await self._overrides(project.object_type, patch.overrides)
            scenario.overrides = overrides_to_json(overrides)
        scenario.version += 1
        scenario.updated_at = datetime.now(UTC)
        await self._uow.flush()
        self._audit.write(
            project.id, f"scenario:{scenario.id}", "update", before=before, after=_snapshot(scenario)
        )
        return await self.get(scenario.id)

    async def delete(self, scenario_id: UUID) -> None:
        scenario = await self.owned(scenario_id, lock=True)
        if scenario.is_baseline:
            raise ConflictError("Базовый сценарий удалить нельзя: от него считается эффект остальных")
        self._audit.write(
            scenario.project_id, f"scenario:{scenario.id}", "delete", before=_snapshot(scenario)
        )
        await self._repo.delete(scenario)
        await self._uow.flush()

    async def copy(self, scenario_id: UUID, name: str | None, kind: ScenarioKind | None) -> ScenarioView:
        source = await self.owned(scenario_id)
        target_kind = kind or (ScenarioKind.PURCHASE if source.is_baseline else source.kind)
        if target_kind == ScenarioKind.BASELINE:
            raise ConflictError("Базовый сценарий в проекте только один")
        financing = financing_to_json(Financing()) if target_kind != source.kind else source.financing
        copy = Scenario(
            project_id=source.project_id,
            name=(name or f"{KIND_NAMES[target_kind]}: копия «{source.name}»").strip(),
            kind=target_kind,
            is_baseline=False,
            financing=financing,
            horizon_years=source.horizon_years,
            discount_rate_pct=source.discount_rate_pct,
            overrides=list(source.overrides),
            created_by=self._user.email,
        )
        copy.items = [
            ScenarioItem(
                position=item.position,
                process_key=item.process_key,
                product_id=item.product_id,
                offer_id=item.offer_id,
                count_mode=item.count_mode,
                count_manual=item.count_manual,
                stations_mode=item.stations_mode,
                stations_count=item.stations_count,
                price_override_rub=item.price_override_rub,
                throughput_override_per_hour=item.throughput_override_per_hour,
                override_reason=item.override_reason,
                notes=item.notes,
                # The fleet is the same whatever the financing: the sweep's answer carries over.
                simulated_count=item.simulated_count,
                simulation_id=item.simulation_id,
                simulated_project_version=item.simulated_project_version,
                simulated_basis=item.simulated_basis,
                simulation_note=item.simulation_note,
            )
            for item in source.items
        ]
        self._repo.add(copy)
        await self._uow.flush()
        self._audit.write(
            copy.project_id,
            f"scenario:{copy.id}",
            "copy",
            after=_snapshot(copy),
            note=f"Копия сценария «{source.name}»",
        )
        return await self.get(copy.id)

    @staticmethod
    def _financing(kind: ScenarioKind, financing: Financing | None) -> Financing:
        financing = financing or Financing()
        if kind == ScenarioKind.LEASE and financing.kind != FinancingKind.LEASE:
            financing = replace(financing, kind=FinancingKind.LEASE)
        if financing.kind not in _ALLOWED_FINANCING[kind]:
            raise InvalidInputError(
                f"Финансирование «{financing.kind.value}» не подходит к сценарию «{kind.value}»",
                details=[{"field": "financing.kind", "message": "недопустимое сочетание"}],
            )
        return financing

    async def _overrides(self, object_type: str, overrides: list[NormOverride]) -> list[NormOverride]:
        norms = {norm.key: norm for norm in await self._norms.rows(object_type)}
        result: list[NormOverride] = []
        for override in overrides:
            norm = norms.get(override.norm_key)
            if norm is None:
                raise InvalidInputError(f"Норматив {override.norm_key} не найден")
            if not norm.editable_by_user:
                raise InvalidInputError(f"Норматив «{norm.name}» нельзя переопределять в сценарии")
            if not override.reason.strip():
                raise InvalidInputError(f"Укажите причину изменения норматива «{norm.name}»")
            result.append(
                replace(
                    override,
                    unit=norm.unit,
                    default_value=norm.value,
                    changed_by=override.changed_by or self._user.email,
                    changed_at=override.changed_at or datetime.now(UTC),
                )
            )
        return result

    async def _items(
        self, object_type: ObjectTypeDetail, specs: list[ScenarioItemSpec]
    ) -> list[ScenarioItem]:
        processes = {p.key: p for p in object_type.processes}
        products = {p.id: p for p in await self._catalog.get_many([s.product_id for s in specs])}
        offers = list(await self._catalog.offers_for(list(products)))
        industry = await self._catalog.industry_key(object_type.industry)
        seen: set[str] = set()
        items: list[ScenarioItem] = []
        for position, spec in enumerate(specs):
            process = processes.get(spec.process_key)
            if process is None:
                raise InvalidInputError(
                    f"Процесс {spec.process_key} не найден у типа объекта «{object_type.name}»"
                )
            if spec.process_key in seen:
                raise InvalidInputError(f"Процесс «{process.name}» указан дважды: одно решение на процесс")
            seen.add(spec.process_key)
            product = products.get(spec.product_id)
            if product is None:
                raise InvalidInputError(f"Продукт {spec.product_id} не найден в каталоге")
            if (
                spec.process_key not in product.processes
                and product.solution_type not in process.solution_types
            ):
                raise InvalidInputError(f"«{product.name}» не решает процесс «{process.name}»")
            self._check_item(spec, product.name)
            items.append(self._item(spec, position, product, offers, industry))
        return items

    @staticmethod
    def _check_item(spec: ScenarioItemSpec, name: str) -> None:
        if spec.count_mode == CountMode.MANUAL and not spec.count_manual:
            raise InvalidInputError(f"Для «{name}» выбран ручной режим — укажите количество")
        overridden = spec.price_override_rub is not None or spec.throughput_override_per_hour is not None
        if overridden and not (spec.override_reason or "").strip():
            raise InvalidInputError(f"Укажите причину ручной цены или производительности для «{name}»")
        for value in (spec.price_override_rub, spec.throughput_override_per_hour):
            if value is not None and value <= 0:
                raise InvalidInputError(f"Цена и производительность «{name}» должны быть больше нуля")

    @staticmethod
    def _item(
        spec: ScenarioItemSpec,
        position: int,
        product: Product,
        offers: list[ProductOffer],
        industry: str | None,
    ) -> ScenarioItem:
        own = [o for o in offers if o.product_id == product.id]
        if spec.offer_id is not None and spec.offer_id not in {o.id for o in own}:
            raise InvalidInputError(f"Предложение {spec.offer_id} не относится к «{product.name}»")
        offer = spec.offer_id or (chosen.id if (chosen := choose_offer(own, industry)) else None)
        return ScenarioItem(
            position=position,
            process_key=spec.process_key,
            product_id=product.id,
            offer_id=offer,
            count_mode=spec.count_mode,
            count_manual=spec.count_manual if spec.count_mode == CountMode.MANUAL else None,
            stations_mode=spec.stations_mode,
            stations_count=spec.stations_count if spec.stations_mode == CountMode.MANUAL else None,
            price_override_rub=spec.price_override_rub,
            throughput_override_per_hour=spec.throughput_override_per_hour,
            override_reason=spec.override_reason,
            notes=spec.notes,
        )

    async def _recommended_items(self, project_id: UUID) -> list[ScenarioItemSpec]:
        """Per process, the best-ranked candidate whose own purchase has a positive NPV («подходит» first).

        If no process pays back, the least unprofitable one is taken so the user sees why robotization loses.
        """
        outcome = await MatchingService(self._uow, self._user).run(project_id)
        chosen: list[tuple[str, CandidateView]] = []
        fallback: tuple[str, CandidateView] | None = None
        for process in outcome.processes:
            priced = [c for c in process.candidates if c.economics is not None]
            for status in (CandidateStatus.FIT, CandidateStatus.CHECK):
                good = [c for c in priced if c.result.status == status and _npv(c) > 0]
                if good:
                    chosen.append((process.process_key, good[0]))
                    break
            for candidate in (c for c in priced if c.economics and c.economics.effect_rub_year > 0):
                if fallback is None or _npv(candidate) > _npv(fallback[1]):
                    fallback = (process.process_key, candidate)
        if not chosen and fallback is not None:
            chosen = [fallback]
        if not chosen:
            raise ConflictError(
                "Ни одно решение из подбора не даёт положительного эффекта на этом объекте — "
                "выберите продукты вручную, чтобы сравнить варианты"
            )
        return [
            ScenarioItemSpec(
                process_key=key,
                product_id=view.data.product.id,
                offer_id=view.data.offer.id if view.data.offer else None,
                notes="Требует проверки ТТХ у вендора"
                if view.result.status == CandidateStatus.CHECK
                else None,
            )
            for key, view in chosen
        ]


def _npv(view: CandidateView) -> float:
    return view.economics.npv_rub if view.economics else float("-inf")


def _keep_simulation(old: list[ScenarioItem], new: list[ScenarioItem]) -> None:
    """A fleet sweep stays valid while the process keeps the same product; any other change drops it."""
    previous = {(item.process_key, item.product_id): item for item in old}
    for item in new:
        source = previous.get((item.process_key, item.product_id))
        if source is not None and source.simulated_count:
            item.simulated_count = source.simulated_count
            item.simulation_id = source.simulation_id
            item.simulated_project_version = source.simulated_project_version
            item.simulated_basis = source.simulated_basis
            item.simulation_note = source.simulation_note

import time
from dataclasses import asdict, replace
from datetime import UTC, datetime
from uuid import uuid4

from app.api.schemas.calculations import CalculationRun
from app.api.schemas.demo import DemoSnapshot, DemoWhatIfRequest, DemoWhatIfResult
from app.db.uow import UnitOfWork
from app.engine.calculation import calculate
from app.engine.sensitivity import Driver, DriverKind, Group, apply
from app.engine.verdict import assess_risks, interpret
from app.service.demo.registry import DEMO_OWNER
from app.service.scenarios.calculations import CalculationService, verdict_context
from app.service.scenarios.serialize import payload
from app.service.scenarios.service import ScenarioService

CASH_SHARE = "labor_cash_realization_share"


async def what_if(uow: UnitOfWork, demo: DemoSnapshot, request: DemoWhatIfRequest) -> DemoWhatIfResult:
    scenario_id = next(s.id for s in demo.scenarios if s.kind == request.scenario_kind)
    scenario = await ScenarioService(uow, DEMO_OWNER).owned(scenario_id)
    snapshot = await CalculationService(uow, DEMO_OWNER).snapshot(scenario)
    inp = snapshot.input
    for group, value in (
        (Group.LABOR_COST, request.salary_multiplier),
        (Group.EQUIPMENT_PRICE, request.robot_price_multiplier),
        (Group.OPERATIONS_VOLUME, request.volume_multiplier),
    ):
        inp = apply(inp, Driver(group, group.value, DriverKind.GROUP, None, 1, 0.5, 2), value)
    if request.labor_cash_realization_share is not None:
        base = inp.norms.value(CASH_SHARE)
        inp = apply(
            inp,
            Driver(CASH_SHARE, "Денежная реализация труда", DriverKind.NORM, "доля", base, 0, 1),
            request.labor_cash_realization_share,
        )
    if request.horizon_years is not None:
        inp = replace(inp, horizon_years=request.horizon_years)
    snapshot = replace(snapshot, input=inp, inputs={**snapshot.inputs, "guest_changes": request.model_dump()})
    started = time.perf_counter()
    result = calculate(inp)
    context = verdict_context(snapshot)
    body, _ = payload(result, snapshot, interpret(result, context), assess_risks(result, context), [])
    body.pop("cashflow_overlay", None)
    body.pop("undocumented_constants", None)
    calculation = CalculationRun.model_validate(
        {
            **body,
            "id": uuid4(),
            "scenario_id": scenario_id,
            "status": "fresh",
            "duration_ms": int((time.perf_counter() - started) * 1000),
            "versions": {
                **asdict(snapshot.versions),
                "computed_at": datetime.now(UTC),
                "inputs_hash": snapshot.inputs_hash,
                "layout_version": snapshot.layout_version,
            },
        }
    )
    confirmed = request.volume_multiplier == 1 and bool(demo.sweep and demo.sweep.applied)
    notes = ["Пробный расчёт в текущей вкладке. Общий пример и его отчёт не изменены."]
    if request.volume_multiplier != 1:
        notes.append(
            "Изменилась нагрузка: парк рассчитан аналитически. "
            "Сохранённая имитация не подтверждает эти условия. "
            "Множитель также масштабирует штат ручного процесса."
        )
    if request.robot_price_multiplier != 1:
        notes.append("Цена оборудования изменена гостем; это допущение, а не новое предложение поставщика.")
    return DemoWhatIfResult(
        metrics=calculation.metrics,
        interpretation=calculation.interpretation,
        cashflow_yearly=calculation.cashflow.yearly,
        calculation=calculation,
        simulation_valid=confirmed,
        notes=notes,
    )

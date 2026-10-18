import math
from collections.abc import Callable
from dataclasses import dataclass, field, replace

from app.engine.simulation import Prepared, SimInput, SimMode, SimResult, simulate
from app.engine.simulation.sweep import Sweep, SweepResult
from app.engine.trace import fmt

PERCENT = 100.0


@dataclass(frozen=True, slots=True)
class ProcessValidation:
    process_key: str
    target_pct: float
    sla_min_pct: float | None
    passed: bool


@dataclass(frozen=True, slots=True)
class JointValidation:
    status: str
    replications: int
    fleet: dict[str, int]
    processes: list[ProcessValidation]


@dataclass(frozen=True, slots=True)
class JointSweep:
    result: SweepResult
    candidate_count: int | None
    validation: JointValidation
    bases: dict[str, int]
    fixed_fleet: frozenset[str] = field(default_factory=frozenset)


def with_fleet(inp: SimInput, fleet: dict[str, int], fixed: frozenset[str] = frozenset()) -> SimInput:
    """Reprice the physical charger provision exactly as final count + reserve in the calculation."""
    per_charger = inp.settings.robots_per_charger
    chargers = (
        sum(
            math.ceil(
                (count + (0 if key in fixed else math.ceil(count * inp.settings.fleet_reserve_share)))
                / per_charger
            )
            for key, count in fleet.items()
        )
        if per_charger
        else inp.config.chargers
    )
    return replace(inp, config=replace(inp.config, fleet=fleet, chargers=chargers))


def validate_fleet(
    inp: SimInput,
    fleet: dict[str, int],
    replications: int,
    prepared: Prepared,
    fixed: frozenset[str] = frozenset(),
) -> JointValidation:
    """Each modeled process must meet its own target on every common-random-number replication."""
    inp = with_fleet(inp, fleet, fixed)
    runs: list[SimResult] = []
    for replication in range(max(1, replications)):
        config = replace(
            inp.config,
            mode=SimMode.PEAK,
            fleet=fleet,
            seed=inp.config.seed + replication,
            record_events=False,
        )
        runs.append(simulate(replace(inp, config=config), prepared))
    checks: list[ProcessValidation] = []
    for process in inp.processes:
        outcomes = [
            next((p for p in run.record.processes if p.process_key == process.key), None) for run in runs
        ]
        slas = [PERCENT * p.on_time / p.demand for p in outcomes if p is not None and p.demand > 0]
        minimum = min(slas) if len(slas) == len(runs) else None
        target = process.target_share * PERCENT
        checks.append(
            ProcessValidation(process.key, target, minimum, minimum is not None and minimum >= target)
        )
    return JointValidation(
        "passed" if checks and all(p.passed for p in checks) else "failed", len(runs), fleet, checks
    )


def joint_sweep(
    inp: SimInput,
    process_key: str,
    replications: int,
    prepared: Prepared,
    progress: Callable[[float, str], None] | None = None,
    bounds: tuple[int | None, int | None] = (None, None),
    fixed_fleet: dict[str, int] | None = None,
) -> JointSweep:
    """Separate searches seed one joint configuration; shared bottleneck failure never confirms any N."""
    target = Sweep(inp, process_key, replications, prepared, progress).run(*bounds)
    fleet: dict[str, int] = {}
    bases = {p.key: p.analytic_robots or p.robots for p in inp.processes}
    searches = {process_key: target}
    fixed = {key: count for key, count in (fixed_fleet or {}).items() if key != process_key}
    for process in inp.processes:
        if process.key in fixed:
            fleet[process.key] = fixed[process.key]
            continue
        if process.key != process_key:
            searches[process.key] = Sweep(inp, process.key, replications, prepared, progress).run()
        candidate = searches[process.key].recommended_count
        if candidate is not None:
            fleet[process.key] = candidate
    if len(fleet) != len(inp.processes):
        missing = [p.name for p in inp.processes if p.key not in fleet]
        reason = "Совместная проверка не выполнена: не найден парк с SLA для процессов: " + ", ".join(missing)
        validation = JointValidation("not_run", 0, fleet, [])
    else:
        if progress:
            progress(len(target.points), "Проверка всех процессов с общими ресурсами")
        validation = validate_fleet(inp, fleet, replications, prepared, frozenset(fixed))
        names = {process.key: process.name for process in inp.processes}
        failed = [
            f"{names[p.process_key]}: {fmt(p.sla_min_pct)} % при цели {fmt(p.target_pct)} %"
            if p.sla_min_pct is not None
            else f"{names[p.process_key]}: нет наблюдений для подтверждения SLA"
            for p in validation.processes
            if not p.passed
        ]
        reason = (
            f"Совместно все имитируемые процессы держат SLA во всех {validation.replications} прогонах. "
            "Подтверждён парк этих процессов; резерв добавляется в расчёте."
            if validation.status == "passed"
            else "Совместная проверка не пройдена: "
            + "; ".join(failed)
            + ". Результат не применён. Проверьте общие ресурсы и их пропускную способность."
        )
    result = replace(
        target,
        recommended_count=target.recommended_count if validation.status == "passed" else None,
        explanation=target.explanation + ". " + reason,
    )
    return JointSweep(result, target.recommended_count, validation, bases, frozenset(fixed))

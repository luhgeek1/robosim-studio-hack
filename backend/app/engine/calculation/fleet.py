import math

from app.domain.reference import ProcessDef
from app.domain.scenario.models import CountMode, CountSource
from app.engine.calculation.context import Context
from app.engine.calculation.models import CalculationError, CountResult, ItemInput, ItemSizing
from app.engine.economics import FleetItem
from app.engine.expressions import ExpressionError, MissingValueError
from app.engine.sizing import DemandInput, SizingOptions, SizingOutcome, size
from app.engine.trace import InputKind, Quantity, Section, TraceStep, display_formula, namespaced

FMR_SOLUTION_TYPE = "fmr_forklift"


def _optional_expression(ctx: Context, source: str | None) -> tuple[float, list[Quantity]] | None:
    if not source:
        return None
    try:
        return ctx.books.expression(source)
    except (MissingValueError, ExpressionError):
        return None


def size_item(
    ctx: Context, item: ItemInput, process: ProcessDef, demand: dict[str, TraceStep]
) -> SizingOutcome | None:
    if item.sizing_model is None:
        return None
    ns = process.key
    weight = _optional_expression(ctx, process.unit_weight)
    route = _optional_expression(ctx, process.route_length)
    distance = None
    if route is not None:
        value, inputs = route
        distance = ctx.tr.record(
            f"{ns}.route_length_m",
            "Длина маршрута в одну сторону",
            value,
            "м",
            display_formula(process.route_length or ""),
            inputs,
            Section.SIZING,
        ).as_quantity()
        if all(q.kind == InputKind.NORM for q in inputs):
            ctx.warnings.append(f"{process.name}: длина маршрута по нормативу — нет замера и планировки")
    override = (
        Quantity(
            "throughput_override_per_hour",
            "Производительность робота (задана вручную)",
            item.throughput_override,
            "ед/ч",
            InputKind.PARAM,
        )
        if item.throughput_override
        else None
    )
    outcome = size(
        item.sizing_model,
        DemandInput(
            process_key=ns,
            peak_per_hour=demand["peak"].value,
            avg_per_hour=demand["avg"].value,
            demand_per_day=demand["per_day"].value,
            hours_per_day=demand["hours"].value,
            unit_weight_kg=weight[0] if weight else None,
        ),
        item.specs,
        ctx.books.norms,
        SizingOptions(
            distance=distance,
            is_fmr=item.solution_type == FMR_SOLUTION_TYPE,
            render=ctx.tr.render,
            throughput_override=override,
        ),
    )
    ctx.tr.steps.extend(namespaced(step, ns) for step in outcome.trace.steps)
    return outcome


def resolve_count(
    ctx: Context, item: ItemInput, process: ProcessDef, outcome: SizingOutcome | None
) -> CountResult:
    ns = process.key
    sized = outcome is not None and outcome.robots is not None
    if not sized and not (item.count_mode == CountMode.MANUAL and item.count_manual):
        missing = ", ".join(outcome.missing) if outcome else "нет модели производительности"
        raise CalculationError(
            f"Не удалось рассчитать число роботов «{item.product_name}» для процесса «{process.name}» "
            f"({missing}). Задайте количество вручную."
        )
    analytic = outcome.robots or 0 if outcome else 0
    reserve = outcome.reserve or 0 if outcome else 0
    if item.count_mode == CountMode.MANUAL and item.count_manual:
        final, source = item.count_manual, CountSource.MANUAL
        text = f"Задано пользователем: {final} шт." + (
            f" Расчёт по циклу — {analytic} + резерв {reserve}." if sized else ""
        )
        manual = Quantity("count_manual", "Количество, заданное вручную", float(final), "шт", InputKind.PARAM)
        ctx.tr.record(
            f"{ns}.robots_total", "Роботов в процессе", final, "шт", manual.key, [manual], Section.SIZING
        )
    elif item.simulated_robots:
        share = ctx.books.norms.get("fleet_reserve_share")
        reserve = math.ceil(item.simulated_robots * share.value)
        final, source = item.simulated_robots + reserve, CountSource.SIMULATED
        text = (
            f"Аналитически {analytic}; имитация подтвердила SLA при {item.simulated_robots}; "
            f"резерв +{reserve}"
        )
        simulated = Quantity(
            "simulated_robots",
            "Роботов по имитации (SLA выполнен)",
            float(item.simulated_robots),
            "шт",
            InputKind.SIMULATION,
        )
        ctx.tr.record(
            f"{ns}.robots_total",
            "Роботов в процессе",
            final,
            "шт",
            f"simulated_robots + ⌈simulated_robots × {share.key}⌉",
            [simulated, share],
            Section.SIZING,
        )
    else:
        final, source = analytic + reserve, CountSource.ANALYTIC
        text = (
            f"Аналитически {analytic} по времени цикла и пиковому спросу; резерв +{reserve}; "
            "имитация ещё не запускалась"
        )
        ctx.tr.record(
            f"{ns}.robots_total",
            "Роботов в процессе",
            final,
            "шт",
            f"{ns}.robots_analytic + {ns}.robots_reserve",
            [
                Quantity(
                    f"{ns}.robots_analytic", "Роботов по расчёту", float(analytic), "шт", InputKind.METRIC
                ),
                Quantity(f"{ns}.robots_reserve", "Резерв", float(reserve), "шт", InputKind.METRIC),
            ],
            Section.SIZING,
        )
    return CountResult(analytic, reserve, final, source, text, item.simulated_robots, item.simulation_id)


def build_fleet_item(
    ctx: Context, item: ItemInput, payroll: Quantity, days: Quantity
) -> tuple[FleetItem, ItemSizing]:
    process = ctx.processes.get(item.process_key)
    if process is None:
        raise CalculationError(f"Процесс {item.process_key} не найден у этого типа объекта")
    ns = process.key
    demand = ctx.demand(process)
    labor_cost, fte = ctx.process_labor(process, payroll)
    outcome = size_item(ctx, item, process, demand)
    count = resolve_count(ctx, item, process, outcome)
    warnings = list(outcome.warnings) if outcome else []
    effective = outcome.effective_per_hour if outcome else None
    working = min(count.final, count.analytic) if count.analytic else count.final
    metric = InputKind.METRIC
    robots = Quantity(f"{ns}.robots_total", "Роботов в процессе", float(count.final), "шт", metric)
    working_q = ctx.tr.record(
        f"{ns}.robots_working",
        "Роботов в работе (без резерва)",
        working,
        "шт",
        f"min({robots.key}, {ns}.robots_analytic)" if count.analytic else robots.key,
        [robots],
        Section.SIZING,
    ).as_quantity()
    peak = demand["peak"].as_quantity()
    if effective:
        per_robot = Quantity(
            f"{ns}.effective_per_hour", "Эффективная производительность робота", effective, "ед/ч", metric
        )
        coverage = ctx.tr.record(
            f"{ns}.coverage",
            "Доля пикового спроса, которую закрывает парк",
            min(1.0, working * effective / peak.value) if peak.value else 1.0,
            "доля",
            f"min(1, {working_q.key} × {per_robot.key} / {peak.key})",
            [working_q, per_robot, peak],
            Section.SIZING,
        ).as_quantity()
    else:
        warnings.append("Покрытие спроса не проверено: нет модели производительности, берём 100 %")
        coverage = Quantity(f"{ns}.coverage", "Доля пикового спроса (не проверена)", 1.0, "доля", metric)
    chargers = _chargers(ctx, ns, count, outcome, robots)
    stations = (
        item.stations_manual if item.stations_manual is not None else (outcome.stations if outcome else None)
    )
    release_formula = process.release_formula(item.solution_type)
    release = (
        ctx.record_expression(
            f"{ns}.release_share",
            "Доля высвобождаемого персонала",
            release_formula,
            "доля",
            Section.EFFECT,
        ).as_quantity()
        if release_formula
        else None
    )
    operations = ctx.tr.record(
        f"{ns}.annual_operations",
        "Операций в год",
        demand["per_day"].value * days.value,
        "ед/год",
        f"{demand['per_day'].key} × {days.key}",
        [demand["per_day"].as_quantity(), days],
        Section.DEMAND,
    ).as_quantity()
    price = Quantity(
        f"{ns}.price_rub",
        f"Цена «{item.product_name}» ({'задана вручную' if item.price_overridden else 'каталог'}, с НДС)",
        item.price,
        "₽",
        InputKind.PARAM if item.price_overridden else InputKind.SPEC,
    )
    fleet = FleetItem(
        key=ns,
        process_name=process.name,
        product_name=item.product_name,
        solution_type=item.solution_type,
        price=price,
        robots=robots,
        robots_working=working_q,
        chargers=Quantity(f"{ns}.chargers", "Зарядных станций", float(chargers), "шт", metric),
        stations=Quantity(f"{ns}.stations", "Станций отбора", float(stations or 0), "шт", metric),
        hours_per_day=demand["hours"].as_quantity(),
        coverage=coverage,
        labor_cost=labor_cost,
        labor_fte=fte,
        release=release,
        service_life=item.specs.optional("service_life_years")
        or ctx.books.norms.get("robot_service_life_years"),
        rent_month=item.specs.optional("rent_rub_month"),
        annual_operations=operations,
    )
    sizing = ItemSizing(
        item=item,
        process_name=process.name,
        demand_peak_per_hour=peak.value,
        demand_avg_per_hour=demand["avg"].value,
        outcome=outcome,
        count=count,
        stations=stations,
        chargers=chargers,
        fleet_per_hour=working * effective if effective else None,
        coverage=coverage.value,
        warnings=warnings,
    )
    return fleet, sizing


def _chargers(
    ctx: Context, ns: str, count: CountResult, outcome: SizingOutcome | None, robots: Quantity
) -> int:
    if count.source == CountSource.ANALYTIC and outcome is not None and outcome.chargers is not None:
        return outcome.chargers
    per_charger = ctx.books.norms.get("robots_per_charging_station")
    return int(
        ctx.tr.record(
            f"{ns}.chargers",
            "Зарядных станций",
            float(math.ceil(count.final / per_charger.value)),
            "шт",
            f"⌈{robots.key} / {per_charger.key}⌉",
            [robots, per_charger],
            Section.SIZING,
        ).value
    )

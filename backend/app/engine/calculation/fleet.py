import math

from app.domain.reference import ProcessDef, SizingModel
from app.domain.scenario.models import CountMode, CountSource
from app.engine.calculation.context import Context
from app.engine.calculation.labor import release_cap
from app.engine.calculation.models import CalculationError, CountResult, ItemInput, ItemSizing
from app.engine.calculation.stations import fleet_capacity, station_capacity, station_count, station_share
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


def _sizing_expression(
    ctx: Context, process: ProcessDef, key: str, name: str, source: str | None, unit: str
) -> float | None:
    if not source or _optional_expression(ctx, source) is None:
        return None
    return ctx.record_expression(f"{process.key}.{key}", name, source, unit, Section.SIZING).value


def size_item(
    ctx: Context, item: ItemInput, process: ProcessDef, demand: dict[str, TraceStep]
) -> SizingOutcome | None:
    if item.sizing_model is None:
        return None
    ns = process.key
    weight = _sizing_expression(
        ctx, process, "unit_weight_kg", "Масса единицы спроса", process.unit_weight, "кг"
    )
    load = _sizing_expression(
        ctx,
        process,
        "load_per_trip",
        "Единиц спроса за рейс",
        (process.demand or {}).get("load_per_trip"),
        "ед",
    )
    tare = _sizing_expression(
        ctx, process, "trip_tare_kg", "Масса пустых тележек", (process.demand or {}).get("trip_tare_kg"), "кг"
    )
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
            ctx.warnings.append(f"{process.name}: длина маршрута по нормативу - нет замера и планировки")
    extras = tuple(
        ctx.record_expression(
            f"{ns}.{extra.key}", extra.name, extra.formula, "с", Section.SIZING
        ).as_quantity()
        for extra in process.cycle_extras
    )
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
            unit_weight_kg=weight,
            units_per_trip=load,
            trip_tare_kg=tare,
        ),
        item.specs,
        ctx.books.norms,
        SizingOptions(
            distance=distance,
            is_fmr=item.solution_type == FMR_SOLUTION_TYPE,
            render=ctx.tr.render,
            throughput_override=override,
            extras=extras,
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
        raise CalculationError(
            f"Не удалось рассчитать число роботов «{item.product_name}» для процесса «{process.name}». "
            "В разделе «Состав и условия» у этого решения выберите «Количество → задать вручную» "
            "и заполните поле «Штук». Либо укажите свою производительность с обоснованием.",
            process_key=process.key,
        )
    analytic = outcome.robots or 0 if outcome else 0
    reserve = outcome.reserve or 0 if outcome else 0
    if item.count_mode == CountMode.MANUAL and item.count_manual:
        final, source = item.count_manual, CountSource.MANUAL
        text = f"Задано пользователем: {final} шт." + (
            f" Расчёт по циклу - {analytic} + резерв {reserve}." if sized else ""
        )
        manual = Quantity("count_manual", "Количество, заданное вручную", float(final), "шт", InputKind.PARAM)
        ctx.tr.record(
            f"{ns}.robots_total", "Роботов в процессе", final, "шт", manual.key, [manual], Section.SIZING
        )
    elif _valid_simulation(item, analytic):
        share = ctx.books.norms.get("fleet_reserve_share")
        simulated = _simulated(item)
        count = int(simulated.value)
        reserve = math.ceil(count * share.value)
        final, source = count + reserve, CountSource.SIMULATED
        text = f"Аналитически {analytic}; имитация подтвердила SLA при {count}; резерв +{reserve}"
        ctx.tr.record(
            f"{ns}.robots_total",
            "Роботов в процессе",
            final,
            "шт",
            f"{simulated.key} + ⌈{simulated.key} × {share.key}⌉",
            [simulated, share],
            Section.SIZING,
        )
        return CountResult(analytic, reserve, final, source, text, count, item.simulation_id)
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
    return CountResult(analytic, reserve, final, source, text)


def _valid_simulation(item: ItemInput, analytic: int) -> bool:
    """Only an unchanged, successful fleet may retain its simulation evidence."""
    return bool(
        item.simulated_robots
        and not item.simulation_outdated
        and not (item.sizing_model == SizingModel.GOODS_TO_PERSON and item.stations_manual == 0)
        and (item.simulated_basis is None or item.simulated_basis == analytic)
    )


def _simulated(item: ItemInput) -> Quantity:
    """Use the verified fleet verbatim; analytical scaling is not another simulation."""
    return Quantity(
        "simulated_robots",
        "Роботов по имитации (SLA выполнен)",
        float(item.simulated_robots or 0),
        "шт",
        InputKind.SIMULATION,
    )


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
    if item.simulation_outdated or (item.simulated_robots and not _valid_simulation(item, count.analytic)):
        warnings.append(
            "Число роботов по имитации получено для прежних входных данных, поэтому взято по циклу: "
            "перезапустите перебор флота"
        )
    effective = outcome.effective_per_hour if outcome else None
    simulated = count.source == CountSource.SIMULATED and bool(count.simulated)
    working: int = (
        (count.simulated or 0)
        if simulated
        else (min(count.final, count.analytic) if count.analytic else count.final)
    )
    metric = InputKind.METRIC
    robots = Quantity(f"{ns}.robots_total", "Роботов в процессе", float(count.final), "шт", metric)
    working_q = ctx.tr.record(
        f"{ns}.robots_working",
        "Роботов в работе (без резерва)",
        float(working),
        "шт",
        "simulated_robots"
        if simulated
        else (f"min({robots.key}, {ns}.robots_analytic)" if count.analytic else robots.key),
        [_simulated_robots(count)] if simulated else [robots],
        Section.SIZING,
    ).as_quantity()
    peak = demand["peak"].as_quantity()
    stations = (
        item.stations_manual if item.stations_manual is not None else (outcome.stations if outcome else None)
    )
    stations_q = station_count(ctx, item, outcome)
    station_limit = station_capacity(ctx, item, stations_q, simulated=simulated)
    station_fraction = station_share(station_limit, peak, warnings)
    if simulated:
        # The sweep checked this fleet against the peak demand in time, so it covers the peak by definition.
        met = Quantity(
            "simulated_sla_met", "SLA выполнен в имитации (1 - да)", 1.0, "доля", InputKind.SIMULATION
        )
        coverage = ctx.tr.record(
            f"{ns}.coverage",
            "Доля пикового спроса, которую закрывает парк (по имитации)",
            min(met.value, station_fraction),
            "доля",
            f"min({met.key}, {station_limit.key} / {peak.key})" if station_limit else met.key,
            [met, station_limit, peak] if station_limit else [met],
            Section.SIZING,
        ).as_quantity()
    elif effective:
        per_robot = Quantity(
            f"{ns}.effective_per_hour", "Эффективная производительность робота", effective, "ед/ч", metric
        )
        coverage = ctx.tr.record(
            f"{ns}.coverage",
            "Доля пикового спроса, которую закрывает парк",
            min(station_fraction, working * effective / peak.value) if peak.value else 1.0,
            "доля",
            f"min(1, {working_q.key} × {per_robot.key} / {peak.key}"
            + (f", {station_limit.key} / {peak.key}" if station_limit else "")
            + ")",
            [working_q, per_robot, peak, *([station_limit] if station_limit else [])],
            Section.SIZING,
        ).as_quantity()
    else:
        warnings.append("Покрытие спроса роботами не проверено: нет модели производительности")
        coverage = ctx.tr.record(
            f"{ns}.coverage",
            "Доля пикового спроса (роботы не проверены)",
            station_fraction,
            "доля",
            f"min(1, {station_limit.key} / {peak.key})" if station_limit else "1",
            [station_limit, peak] if station_limit else [],
            Section.SIZING,
        ).as_quantity()
    chargers = _chargers(ctx, ns, count, outcome, robots)
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
    cap = release_cap(ctx, process, demand, days)
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
        chargers=chargers,
        stations=stations_q,
        hours_per_day=demand["hours"].as_quantity(),
        coverage=coverage,
        labor_cost=labor_cost,
        labor_fte=fte,
        release=release,
        service_life=item.specs.optional("service_life_years")
        or ctx.books.norms.get("robot_service_life_years"),
        rent_month=item.specs.optional("rent_rub_month"),
        annual_operations=operations,
        release_cap_fte=cap,
    )
    sizing = ItemSizing(
        item=item,
        process_name=process.name,
        demand_peak_per_hour=peak.value,
        demand_avg_per_hour=demand["avg"].value,
        outcome=outcome,
        count=count,
        stations=stations,
        chargers=int(chargers.value),
        # A simulated fleet held the peak in the DES; the cycle model's derated rate would understate it.
        fleet_per_hour=fleet_capacity(working, effective, peak.value, simulated, station_limit),
        coverage=coverage.value,
        warnings=warnings,
    )
    return fleet, sizing


def _simulated_robots(count: CountResult) -> Quantity:
    return Quantity(
        "simulated_robots",
        "Роботов по имитации (SLA выполнен)",
        float(count.simulated or 0),
        "шт",
        InputKind.SIMULATION,
    )


def _chargers(
    ctx: Context, ns: str, count: CountResult, outcome: SizingOutcome | None, robots: Quantity
) -> Quantity:
    if count.source == CountSource.ANALYTIC and outcome is not None and outcome.chargers is not None:
        return Quantity(f"{ns}.chargers", "Зарядных станций", float(outcome.chargers), "шт", InputKind.METRIC)
    per_charger = ctx.books.norms.get("robots_per_charging_station")
    # A new key: the analytic sizing already recorded «chargers» for its own fleet size.
    return ctx.tr.record(
        f"{ns}.chargers_final",
        "Зарядных станций для итогового парка",
        float(math.ceil(count.final / per_charger.value)),
        "шт",
        f"⌈{robots.key} / {per_charger.key}⌉",
        [robots, per_charger],
        Section.SIZING,
    ).as_quantity()

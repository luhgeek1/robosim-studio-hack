import math
from dataclasses import dataclass, field

from app.domain.reference import SizingModel
from app.engine.trace import Book, InputKind, MissingInputError, Quantity, Section, Tracer

SECONDS_PER_HOUR = 3600.0
MINUTES_PER_HOUR = 60.0
ROUND_TRIP = 2.0


@dataclass(frozen=True, slots=True)
class DemandInput:
    process_key: str
    peak_per_hour: float
    avg_per_hour: float
    demand_per_day: float
    hours_per_day: float
    unit_weight_kg: float | None = None
    units_per_trip: float | None = None
    trip_tare_kg: float | None = None


@dataclass(frozen=True, slots=True)
class CycleComponent:
    key: str
    name: str
    seconds: float


@dataclass(slots=True)
class SizingOutcome:
    model: SizingModel
    robots: int | None = None
    reserve: int | None = None
    stations: int | None = None
    chargers: int | None = None
    cycle_components: list[CycleComponent] = field(default_factory=list)
    cycle_time_s: float | None = None
    nominal_per_hour: float | None = None
    availability: float | None = None
    utilization: float | None = None
    effective_per_hour: float | None = None
    fleet_per_hour: float | None = None
    missing: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    trace: Tracer = field(default_factory=Tracer)

    @property
    def total_robots(self) -> int | None:
        return None if self.robots is None else self.robots + (self.reserve or 0)


def _metric(key: str, name: str, value: float, unit: str | None) -> Quantity:
    return Quantity(key, name, value, unit, InputKind.METRIC)


class _Sizer:
    def __init__(
        self,
        demand: DemandInput,
        specs: Book,
        norms: Book,
        distance: Quantity | None,
        is_fmr: bool,
        render: bool = True,
        extras: tuple[Quantity, ...] = (),
    ) -> None:
        self.demand = demand
        self.specs = specs
        self.norms = norms
        self.distance = distance
        self.is_fmr = is_fmr
        self.extras = extras
        self.trace = Tracer(render=render)

    def peak(self) -> Quantity:
        return _metric("demand_peak_per_hour", "Спрос в пиковый час", self.demand.peak_per_hour, "ед/ч")

    def availability(self, out: SizingOutcome) -> Quantity:
        runtime, charging = self.specs.optional("runtime_h"), self.specs.optional("charging_time_min")
        if runtime and charging:
            value = runtime.value / (runtime.value + charging.value / MINUTES_PER_HOUR)
            step = self.trace.record(
                "availability",
                "Доступность (работа / (работа + зарядка))",
                value,
                "доля",
                "runtime_h / (runtime_h + charging_time_min / 60)",
                [runtime, charging],
                Section.SIZING,
            )
            out.availability = value
            return step.as_quantity()
        norm = self.norms.get("analytic_availability_default")
        out.availability = norm.value
        out.warnings.append("Нет ТТХ по автономности и зарядке — доступность взята по нормативу")
        return norm

    def cycle(self, out: SizingOutcome, *extras: Quantity | None) -> Quantity:
        speed = self.specs.get("max_speed_mps")
        factor = self.norms.get("effective_speed_factor")
        distance = self.distance or self.norms.get("transport_default_one_way_distance_m")
        if self.distance is None:
            out.warnings.append("Длина маршрута взята по нормативу: планировка ещё не сгенерирована")
        travel = self.trace.record(
            "travel_time_s",
            "Пробег туда и обратно",
            ROUND_TRIP * distance.value / (speed.value * factor.value),
            "с",
            f"2 × {distance.key} / ({speed.key} × {factor.key})",
            [distance, speed, factor],
            Section.SIZING,
        )
        load, unload = self.norms.get("load_handling_time_s"), self.norms.get("unload_handling_time_s")
        parts = [travel.as_quantity(), load, unload]
        out.cycle_components = [
            CycleComponent("travel", f"Пробег {distance.value:.0f} м × 2", travel.value),
            CycleComponent("load", load.name, load.value),
            CycleComponent("unload", unload.name, unload.value),
        ]
        # The process's own per-trip operations (lift ride, disinfection) come from the reference data.
        for extra in (*extras, *self.extras):
            if extra is not None:
                parts.append(extra)
                out.cycle_components.append(CycleComponent(extra.key, extra.name, extra.value))
        formula = " + ".join(q.key for q in parts)
        cycle = self.trace.record(
            "cycle_time_s", "Время цикла", sum(q.value for q in parts), "с", formula, parts, Section.SIZING
        )
        out.cycle_time_s = cycle.value
        return cycle.as_quantity()

    def per_robot(self, out: SizingOutcome, units_per_cycle: Quantity | None, cycle: Quantity) -> Quantity:
        availability = self.availability(out)
        utilization = self.norms.get("amr_utilization_target")
        out.utilization = utilization.value
        nominal_inputs = [cycle] + ([units_per_cycle] if units_per_cycle else [])
        nominal_value = SECONDS_PER_HOUR / cycle.value * (units_per_cycle.value if units_per_cycle else 1.0)
        nominal_formula = f"3600 / {cycle.key}" + (f" × {units_per_cycle.key}" if units_per_cycle else "")
        nominal = self.trace.record(
            "nominal_per_hour",
            "Номинальная производительность робота",
            nominal_value,
            "ед/ч",
            nominal_formula,
            nominal_inputs,
            Section.SIZING,
        )
        out.nominal_per_hour = nominal.value
        effective = self.trace.record(
            "effective_per_hour",
            "Эффективная производительность робота",
            nominal.value * availability.value * utilization.value,
            "ед/ч",
            f"nominal_per_hour × {availability.key} × {utilization.key}",
            [nominal.as_quantity(), availability, utilization],
            Section.SIZING,
        )
        out.effective_per_hour = effective.value
        return effective.as_quantity()

    def count(self, out: SizingOutcome, per_robot: Quantity, demand: Quantity | None = None) -> None:
        peak = demand or self.peak()
        robots = self.trace.record(
            "robots_analytic",
            "Роботов по расчёту (без резерва)",
            float(max(1, math.ceil(peak.value / per_robot.value))),
            "шт",
            f"⌈{peak.key} / {per_robot.key}⌉",
            [peak, per_robot],
            Section.SIZING,
        )
        reserve_share = self.norms.get("fleet_reserve_share")
        reserve = self.trace.record(
            "robots_reserve",
            "Резерв к пиковой потребности",
            float(math.ceil(robots.value * reserve_share.value)),
            "шт",
            f"⌈robots_analytic × {reserve_share.key}⌉",
            [robots.as_quantity(), reserve_share],
            Section.SIZING,
        )
        per_charger = self.norms.get("robots_per_charging_station")
        chargers = self.trace.record(
            "chargers",
            "Зарядных станций",
            float(math.ceil((robots.value + reserve.value) / per_charger.value)),
            "шт",
            f"⌈(robots_analytic + robots_reserve) / {per_charger.key}⌉",
            [robots.as_quantity(), reserve.as_quantity(), per_charger],
            Section.SIZING,
        )
        out.robots, out.reserve, out.chargers = int(robots.value), int(reserve.value), int(chargers.value)
        out.fleet_per_hour = robots.value * per_robot.value


def _load(s: _Sizer) -> Quantity | None:
    """Demand units one trip carries (порций на отделение, кг в контейнере); None — one unit per trip."""
    units = s.demand.units_per_trip
    return _metric("units_per_trip", "Единиц спроса за рейс", units, "ед") if units else None


def _transport(s: _Sizer, out: SizingOutcome) -> None:
    extra = s.norms.get("fork_lift_cycle_extra_s") if s.is_fmr else None
    s.count(out, s.per_robot(out, _load(s), s.cycle(out, extra)))


def _goods_to_person(s: _Sizer, out: SizingOutcome) -> None:
    """The robot waits at the station while the operator picks its lines: part of the cycle (found by DES)."""
    lines = s.norms.get("g2p_robot_lines_per_trip")
    station = s.specs.optional("station_throughput_lines_h") or s.norms.get("g2p_station_lines_per_hour")
    dwell = s.trace.record(
        "station_dwell_s",
        "Стоянка у станции, пока отбирают строки",
        lines.value * SECONDS_PER_HOUR / station.value,
        "с",
        f"{lines.key} × 3600 / {station.key}",
        [lines, station],
        Section.SIZING,
    ).as_quantity()
    s.count(out, s.per_robot(out, lines, s.cycle(out, dwell)))
    _stations(s, out)


def _stations(s: _Sizer, out: SizingOutcome) -> None:
    station = s.specs.optional("station_throughput_lines_h") or s.norms.get("g2p_station_lines_per_hour")
    target = s.norms.get("g2p_station_utilization_target")
    stations = s.trace.record(
        "stations",
        "Станций отбора",
        float(math.ceil(s.demand.peak_per_hour / (station.value * target.value))),
        "шт",
        f"⌈demand_peak_per_hour / ({station.key} × {target.key})⌉",
        [s.peak(), station, target],
        Section.SIZING,
    )
    out.stations = int(stations.value)


def _real_coverage(s: _Sizer) -> tuple[Quantity, list[Quantity], str]:
    """Real-world m²/h if the vendor publishes it; otherwise passport m²/h × real-to-passport norm."""
    real = s.specs.optional("coverage_real_m2_h")
    if real is not None:
        return real, [real], real.key
    passport, share = s.specs.get("coverage_m2_h"), s.norms.get("cleaning_real_to_passport_share")
    return passport, [passport, share], f"{passport.key} × {share.key}"


def _area(s: _Sizer, out: SizingOutcome) -> None:
    coverage, inputs, expression = _real_coverage(s)
    factor = 1.0 if coverage.key == "coverage_real_m2_h" else s.norms.value("cleaning_real_to_passport_share")
    availability = s.availability(out)
    hours = _metric("hours_per_day", "Рабочих часов в сутки", s.demand.hours_per_day, "ч")
    per_robot = s.trace.record(
        "effective_per_day",
        "Площадь за сутки одним роботом",
        coverage.value * factor * availability.value * hours.value,
        "м²/сут",
        f"{expression} × {availability.key} × hours_per_day",
        [*inputs, availability, hours],
        Section.SIZING,
    )
    out.effective_per_hour = _effective(
        s,
        per_robot.value / hours.value,
        "effective_per_day / hours_per_day",
        [per_robot.as_quantity(), hours],
    )
    demand = _metric("demand_per_day", "Площадь к обработке в сутки", s.demand.demand_per_day, "м²/сут")
    s.count(out, per_robot.as_quantity(), demand)


def _effective(s: _Sizer, value: float, formula: str, inputs: list[Quantity]) -> float:
    """The fleet coverage check reads this step, so every model records it, not only the cycle ones."""
    return s.trace.record(
        "effective_per_hour",
        "Эффективная производительность робота",
        value,
        "ед/ч",
        formula,
        inputs,
        Section.SIZING,
    ).value


def _station(s: _Sizer, out: SizingOutcome) -> None:
    throughput = s.specs.get("throughput_units_h")
    s.count(
        out,
        s.per_robot(out, _metric("units_per_cycle", "Единиц за цикл", throughput.value, "ед"), _one_hour()),
    )


def _one_hour() -> Quantity:
    return _metric("hour_s", "Час работы", SECONDS_PER_HOUR, "с")


def _tow(s: _Sizer, out: SizingOutcome) -> None:
    """Trip load = min(train capacity, (towing mass − tare of the carts) / unit weight)."""
    towing = s.specs.get("towing_capacity_kg")
    weight = s.demand.unit_weight_kg
    if weight is None:
        raise MissingInputError(InputKind.PARAM, "unit_weight_kg")
    tare = s.demand.trip_tare_kg or 0.0
    by_mass = max(1.0, math.floor((towing.value - tare) / weight))
    capacity = s.demand.units_per_trip
    units = min(by_mass, capacity) if capacity else by_mass
    load = s.trace.record(
        "units_per_trip",
        "Единиц за рейс сцепки",
        units,
        "ед",
        f"min(train_capacity, ⌊({towing.key} − train_tare_kg) / unit_weight_kg⌋)",
        [
            towing,
            _metric("train_capacity", "Вместимость сцепки", capacity or by_mass, "ед"),
            _metric("train_tare_kg", "Масса пустых тележек", tare, "кг"),
            _metric("unit_weight_kg", "Масса единицы", weight, "кг"),
        ],
        Section.SIZING,
    )
    if capacity and by_mass < capacity:
        out.warnings.append(
            f"Буксируемой массы хватает на {by_mass:.0f} из {capacity:.0f} мест сцепки — рейс неполный"
        )
    s.count(out, s.per_robot(out, load.as_quantity(), s.cycle(out)))


def _elevator(s: _Sizer, out: SizingOutcome) -> None:
    """Transport with lifts: the lift ride is one of the process's cycle extras (floors, wait, travel)."""
    if not s.extras:
        raise MissingInputError(InputKind.NORM, "cycle_extras")
    s.count(out, s.per_robot(out, _load(s), s.cycle(out)))


def _override(s: _Sizer, out: SizingOutcome, throughput: Quantity) -> None:
    """ТЗ 3.5.3: the user sets robot throughput by hand; the cycle model is skipped, the value is traced."""
    out.warnings.append(f"Производительность робота задана вручную: {throughput.value:g} ед/ч")
    out.effective_per_hour = _effective(s, throughput.value, throughput.key, [throughput])
    if out.model == SizingModel.AREA_COVERAGE:
        hours = _metric("hours_per_day", "Рабочих часов в сутки", s.demand.hours_per_day, "ч")
        per_day = s.trace.record(
            "effective_per_day",
            "Площадь за сутки одним роботом",
            throughput.value * hours.value,
            "м²/сут",
            f"{throughput.key} × hours_per_day",
            [throughput, hours],
            Section.SIZING,
        )
        demand = _metric("demand_per_day", "Площадь к обработке в сутки", s.demand.demand_per_day, "м²/сут")
        s.count(out, per_day.as_quantity(), demand)
        return
    s.count(out, throughput)
    if out.model == SizingModel.GOODS_TO_PERSON:
        _stations(s, out)


_MODELS = {
    SizingModel.TRANSPORT_CYCLE: _transport,
    SizingModel.GOODS_TO_PERSON: _goods_to_person,
    SizingModel.AREA_COVERAGE: _area,
    SizingModel.STATION_THROUGHPUT: _station,
    SizingModel.TOW_TRAIN: _tow,
    SizingModel.ELEVATOR_CYCLE: _elevator,
}


@dataclass(frozen=True, slots=True)
class SizingOptions:
    distance: Quantity | None = None
    is_fmr: bool = False
    render: bool = True
    throughput_override: Quantity | None = None
    extras: tuple[Quantity, ...] = ()


def size(
    model: SizingModel, demand: DemandInput, specs: Book, norms: Book, options: SizingOptions | None = None
) -> SizingOutcome:
    """Analytic robot count for one process and product.

    Throughput per robot = 3600 / cycle × units per cycle × availability × utilization;
    N = ⌈peak demand / throughput⌉; reserve = ⌈N × fleet_reserve_share⌉ (legend: 15–20 %).
    The simulation later checks and refines N (D-007); this is the starting point of that search.
    """
    opts = options or SizingOptions()
    sizer = _Sizer(demand, specs, norms, opts.distance, opts.is_fmr, opts.render, opts.extras)
    out = SizingOutcome(model=model, trace=sizer.trace)
    try:
        if opts.throughput_override is not None:
            _override(sizer, out, opts.throughput_override)
        else:
            _MODELS[model](sizer, out)
    except MissingInputError as exc:
        out.robots = out.reserve = out.chargers = None
        out.missing.append(f"{exc.kind.value}:{exc.key}")
    return out

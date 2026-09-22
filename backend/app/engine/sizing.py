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
        self, demand: DemandInput, specs: Book, norms: Book, distance: Quantity | None, is_fmr: bool
    ) -> None:
        self.demand = demand
        self.specs = specs
        self.norms = norms
        self.distance = distance
        self.is_fmr = is_fmr
        self.trace = Tracer()

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

    def cycle(self, out: SizingOutcome, extra_s: Quantity | None = None) -> Quantity:
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
        if extra_s is not None:
            parts.append(extra_s)
            out.cycle_components.append(CycleComponent(extra_s.key, extra_s.name, extra_s.value))
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


def _transport(s: _Sizer, out: SizingOutcome) -> None:
    extra = s.norms.get("fork_lift_cycle_extra_s") if s.is_fmr else None
    s.count(out, s.per_robot(out, None, s.cycle(out, extra)))


def _goods_to_person(s: _Sizer, out: SizingOutcome) -> None:
    lines = s.norms.get("g2p_robot_lines_per_trip")
    s.count(out, s.per_robot(out, lines, s.cycle(out)))
    station = s.specs.optional("station_throughput_lines_h") or s.norms.get("g2p_station_lines_per_hour")
    stations = s.trace.record(
        "stations",
        "Станций отбора",
        float(math.ceil(s.demand.peak_per_hour / station.value)),
        "шт",
        f"⌈demand_peak_per_hour / {station.key}⌉",
        [s.peak(), station],
        Section.SIZING,
    )
    out.stations = int(stations.value)


def _area(s: _Sizer, out: SizingOutcome) -> None:
    coverage = s.specs.get("coverage_m2_h")
    real = s.norms.get("cleaning_real_to_passport_share")
    availability = s.availability(out)
    hours = _metric("hours_per_day", "Рабочих часов в сутки", s.demand.hours_per_day, "ч")
    per_robot = s.trace.record(
        "effective_per_day",
        "Площадь за сутки одним роботом",
        coverage.value * real.value * availability.value * hours.value,
        "м²/сут",
        f"{coverage.key} × {real.key} × {availability.key} × hours_per_day",
        [coverage, real, availability, hours],
        Section.SIZING,
    )
    out.effective_per_hour = per_robot.value / hours.value
    demand = _metric("demand_per_day", "Площадь к обработке в сутки", s.demand.demand_per_day, "м²/сут")
    s.count(out, per_robot.as_quantity(), demand)


def _station(s: _Sizer, out: SizingOutcome) -> None:
    throughput = s.specs.get("throughput_units_h")
    s.count(
        out,
        s.per_robot(out, _metric("units_per_cycle", "Единиц за цикл", throughput.value, "ед"), _one_hour()),
    )


def _one_hour() -> Quantity:
    return _metric("hour_s", "Час работы", SECONDS_PER_HOUR, "с")


def _tow(s: _Sizer, out: SizingOutcome) -> None:
    towing = s.specs.get("towing_capacity_kg")
    carts = s.norms.get("tow_train_carts_per_trip")
    if s.demand.unit_weight_kg is None:
        raise MissingInputError(InputKind.PARAM, "unit_weight_kg")
    units = _metric(
        "units_per_trip", "Единиц за рейс", max(1.0, math.floor(towing.value / s.demand.unit_weight_kg)), "ед"
    )
    out.warnings.append(
        f"Сцепка из {carts.value:.0f} тележек; вместимость рейса ограничена буксируемой массой"
    )
    s.count(out, s.per_robot(out, units, s.cycle(out)))


def _elevator(s: _Sizer, out: SizingOutcome) -> None:
    elevator = s.norms.get("elevator_cycle_time_s")
    s.count(out, s.per_robot(out, None, s.cycle(out, elevator)))


_MODELS = {
    SizingModel.TRANSPORT_CYCLE: _transport,
    SizingModel.GOODS_TO_PERSON: _goods_to_person,
    SizingModel.AREA_COVERAGE: _area,
    SizingModel.STATION_THROUGHPUT: _station,
    SizingModel.TOW_TRAIN: _tow,
    SizingModel.ELEVATOR_CYCLE: _elevator,
}


def size(
    model: SizingModel,
    demand: DemandInput,
    specs: Book,
    norms: Book,
    *,
    distance: Quantity | None = None,
    is_fmr: bool = False,
) -> SizingOutcome:
    """Analytic robot count for one process and product.

    Throughput per robot = 3600 / cycle × units per cycle × availability × utilization;
    N = ⌈peak demand / throughput⌉; reserve = ⌈N × fleet_reserve_share⌉ (legend: 15–20 %).
    The simulation later checks and refines N (D-007); this is the starting point of that search.
    """
    sizer = _Sizer(demand, specs, norms, distance, is_fmr)
    out = SizingOutcome(model=model, trace=sizer.trace)
    try:
        _MODELS[model](sizer, out)
    except MissingInputError as exc:
        out.robots = out.reserve = out.chargers = None
        out.missing.append(f"{exc.kind.value}:{exc.key}")
    return out

import math
import random
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from enum import StrEnum

from app.engine.calculation import CalculationError, CalculationInput, calculate
from app.engine.economics import Metrics
from app.engine.expressions import parse
from app.engine.trace import Book, InputKind, Quantity

PERCENT = 100
HISTOGRAM_BINS = 20
P10, P50, P90 = 0.1, 0.5, 0.9


class DriverKind(StrEnum):
    PARAM = "param"
    NORM = "norm"
    CATALOG = "catalog"
    GROUP = "group"


class Group(StrEnum):
    EQUIPMENT_PRICE = "equipment_price"
    LABOR_COST = "labor_cost"
    OPERATIONS_VOLUME = "operations_volume"


GROUP_NAMES = {
    Group.EQUIPMENT_PRICE: "Цена оборудования",
    Group.LABOR_COST: "Стоимость труда (все зарплаты)",
    Group.OPERATIONS_VOLUME: "Объём операций",
}


@dataclass(frozen=True, slots=True)
class Driver:
    """One uncertain input: its base value and the low/high it can take (norm range or ±% of base)."""

    key: str
    name: str
    kind: DriverKind
    unit: str | None
    base: float
    low: float
    high: float
    status: str | None = None
    dist: str = "triangular"

    def sample(self, rng: random.Random) -> float:
        """Triangular low–base–high by default; uniform low–high; normal around base, σ = (high − low) / 2."""
        if self.dist == "uniform":
            return rng.uniform(self.low, self.high)
        if self.dist == "normal":
            return rng.gauss(self.base, (self.high - self.low) / 2)
        return rng.triangular(self.low, self.high, self.base)


@dataclass(frozen=True, slots=True)
class TornadoItem:
    driver: Driver
    metric_at_low: float | None
    metric_at_high: float | None
    swing: float
    rank: int = 0


@dataclass(frozen=True, slots=True)
class Heatmap:
    x: Driver
    y: Driver
    x_values: list[float]
    y_values: list[float]
    z: list[list[float | None]]


@dataclass(frozen=True, slots=True)
class MonteCarloOutcome:
    n: int
    metric: str
    p10: float
    p50: float
    p90: float
    mean: float
    probability: dict[str, float]
    bins: list[float]
    counts: list[int]
    top_drivers: list[tuple[Driver, float]] = field(default_factory=list)
    failed: int = 0


MetricFn = Callable[[Metrics], float | None]
METRICS: dict[str, MetricFn] = {
    "payback_years": lambda m: m.payback_years,
    "npv_rub": lambda m: m.npv_rub,
    "roi_pct": lambda m: m.roi_pct,
    "effect_rub_year": lambda m: m.effect_rub_year,
    "tco_rub": lambda m: m.tco_rub,
}


def _scale_params(inp: CalculationInput, keys: set[str], factor: float) -> CalculationInput:
    params = {k: (v * factor if k in keys and v is not None else v) for k, v in inp.params.items()}
    return replace(inp, params=params)


def volume_params(inp: CalculationInput) -> set[str]:
    """Daily volumes that drive demand of the scenario's processes (the `per_day` formulas)."""
    used = {item.process_key for item in inp.items}
    keys: set[str] = set()
    for process in inp.processes:
        if process.key in used and process.demand:
            keys |= {name for name in parse(process.demand["per_day"]).names if name in inp.params}
    return keys


def staff_params(inp: CalculationInput) -> set[str]:
    """Headcounts of the staff groups that work in the scenario's processes."""
    used = {item.process_key for item in inp.items}
    groups = {g.key: g for g in inp.labor_groups}
    return {
        groups[key].headcount_param
        for process in inp.processes
        if process.key in used
        for key in process.labor_allocation
        if key in groups
    }


def salary_params(inp: CalculationInput) -> set[str]:
    return {group.salary_param for group in inp.labor_groups if group.salary_param}


def apply(inp: CalculationInput, driver: Driver, value: float) -> CalculationInput:
    """Returns the input with one driver moved to `value` (groups scale all their members by value / base)."""
    if driver.kind == DriverKind.NORM:
        items = dict(inp.norms.items)
        items[driver.key] = replace(items[driver.key], value=value)
        moved = replace(inp, norms=Book(InputKind.NORM, items))
        # The scenario's discount rate is resolved from the norm once; move it too, or NPV would not react.
        if inp.discount_rate.key == driver.key:
            moved = replace(moved, discount_rate=replace(inp.discount_rate, value=value))
        return moved
    if driver.kind == DriverKind.PARAM:
        return replace(inp, params={**inp.params, driver.key: value})
    factor = value / driver.base if driver.base else 1.0
    if driver.key == Group.EQUIPMENT_PRICE:
        return replace(inp, items=[replace(item, price=item.price * factor) for item in inp.items])
    if driver.key == Group.LABOR_COST:
        return _scale_params(inp, salary_params(inp), factor)
    if driver.key == Group.OPERATIONS_VOLUME:
        # AS-IS has to handle the same volume: without the staff moving too, more work would only add robots,
        # and the heatmap showed NPV falling as volume grows (people handling +20 % at the same headcount).
        return _scale_params(inp, volume_params(inp) | staff_params(inp), factor)
    raise KeyError(driver.key)


def evaluate_metric(inp: CalculationInput, metric: str) -> tuple[float | None, Metrics | None]:
    try:
        metrics = calculate(inp, render=False).economics.metrics
    except CalculationError:
        return None, None
    return METRICS[metric](metrics), metrics


def _comparable(value: float | None, metric: str, horizon: int) -> float | None:
    """A payback that never happens is at least the horizon — used for ranking, never reported."""
    if value is None and metric == "payback_years":
        return float(horizon)
    return value


def tornado(
    inp: CalculationInput, drivers: Sequence[Driver], metric: str
) -> tuple[float | None, list[TornadoItem]]:
    """ТЗ 3.5.6: move each driver to its low and high value one at a time; rank by the swing of the metric."""
    base, _ = evaluate_metric(inp, metric)
    items: list[TornadoItem] = []
    for driver in drivers:
        low, _ = evaluate_metric(apply(inp, driver, driver.low), metric)
        high, _ = evaluate_metric(apply(inp, driver, driver.high), metric)
        a = _comparable(low, metric, inp.horizon_years)
        b = _comparable(high, metric, inp.horizon_years)
        swing = abs(a - b) if a is not None and b is not None else 0.0
        items.append(TornadoItem(driver, low, high, swing))
    ordered = sorted(items, key=lambda item: -item.swing)
    return base, [replace(item, rank=position) for position, item in enumerate(ordered, start=1)]


def _grid(driver: Driver, steps: int) -> list[float]:
    if steps < 2:
        return [driver.base]
    return [driver.low + (driver.high - driver.low) * i / (steps - 1) for i in range(steps)]


def heatmap(inp: CalculationInput, x: Driver, y: Driver, steps: int, metric: str) -> Heatmap:
    xs, ys = _grid(x, steps), _grid(y, steps)
    z = [[evaluate_metric(apply(apply(inp, x, xv), y, yv), metric)[0] for xv in xs] for yv in ys]
    return Heatmap(x, y, xs, ys, z)


def _percentile(values: Sequence[float], share: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * share
    lower, upper = math.floor(position), math.ceil(position)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def _ranks(values: Sequence[float]) -> list[float]:
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    for rank, index in enumerate(order):
        ranks[index] = float(rank)
    return ranks


def spearman(a: Sequence[float], b: Sequence[float]) -> float:
    ra, rb = _ranks(a), _ranks(b)
    mean_a, mean_b = sum(ra) / len(ra), sum(rb) / len(rb)
    cov = sum((x - mean_a) * (y - mean_b) for x, y in zip(ra, rb, strict=True))
    var = math.sqrt(sum((x - mean_a) ** 2 for x in ra) * sum((y - mean_b) ** 2 for y in rb))
    return cov / var if var else 0.0


def _histogram(values: Sequence[float]) -> tuple[list[float], list[int]]:
    low, high = min(values), max(values)
    if high == low:
        return [low, high], [len(values)]
    width = (high - low) / HISTOGRAM_BINS
    counts = [0] * HISTOGRAM_BINS
    for value in values:
        counts[min(HISTOGRAM_BINS - 1, int((value - low) / width))] += 1
    return [low + width * i for i in range(HISTOGRAM_BINS + 1)], counts


def monte_carlo(
    inp: CalculationInput,
    drivers: Sequence[Driver],
    *,
    n: int,
    metric: str,
    seed: int | None,
    thresholds: Mapping[str, float],
) -> MonteCarloOutcome:
    """Triangular sampling low–base–high for every driver at once; the analytic model is re-run each time."""
    rng = random.Random(seed)  # noqa: S311 — a reproducible model sample, not cryptography
    samples: list[list[float]] = []
    values: list[float] = []
    paybacks: list[float | None] = []
    npvs: list[float] = []
    failed = 0
    for _ in range(n):
        draw = [d.sample(rng) for d in drivers]
        case = inp
        for driver, drawn in zip(drivers, draw, strict=True):
            case = apply(case, driver, drawn)
        result, metrics = evaluate_metric(case, metric)
        if metrics is None:
            failed += 1
            continue
        comparable = _comparable(result, metric, inp.horizon_years)
        if comparable is None:
            failed += 1
            continue
        samples.append(draw)
        values.append(comparable)
        paybacks.append(metrics.payback_years)
        npvs.append(metrics.npv_rub)
    if not values:
        raise CalculationError("Ни один прогон Монте-Карло не рассчитался — проверьте сценарий")
    probability = {
        f"payback_le_{years:g}y": sum(1 for p in paybacks if p is not None and p <= years) / len(paybacks)
        for years in thresholds.values()
    }
    probability["npv_positive"] = sum(1 for v in npvs if v > 0) / len(npvs)
    bins, counts = _histogram(values)
    correlations = [(driver, spearman([s[i] for s in samples], values)) for i, driver in enumerate(drivers)]
    top = sorted(correlations, key=lambda item: -abs(item[1]))
    return MonteCarloOutcome(
        n=len(values),
        metric=metric,
        p10=_percentile(values, P10),
        p50=_percentile(values, P50),
        p90=_percentile(values, P90),
        mean=sum(values) / len(values),
        probability=probability,
        bins=bins,
        counts=counts,
        top_drivers=top,
        failed=failed,
    )


def percent_driver(
    key: str, name: str, kind: DriverKind, unit: str | None, base: float, low_pct: float, high_pct: float
) -> Driver:
    return Driver(
        key, name, kind, unit, base, base * (1 + low_pct / PERCENT), base * (1 + high_pct / PERCENT)
    )


def norm_driver(norm: Quantity, low: float | None, high: float | None, status: str | None = None) -> Driver:
    return Driver(
        norm.key,
        norm.name,
        DriverKind.NORM,
        norm.unit,
        norm.value,
        low if low is not None else norm.value,
        high if high is not None else norm.value,
        status,
    )

import math
from collections.abc import Callable
from dataclasses import dataclass, replace

from app.engine.simulation import Prepared, SimInput, SimResult, simulate
from app.engine.simulation.models import ProcessModel, SimMode, SimulationError
from app.engine.trace import fmt

# Upper bound of the search: a fleet this many times the analytic one that still fails SLA means the limit
# is not the fleet (stations, docks), and adding robots is pointless.
SEARCH_LIMIT_FACTOR = 3
PERCENT = 100.0


@dataclass(frozen=True, slots=True)
class SweepPoint:
    count: int
    sla_achieved_pct: float
    sla_min_pct: float
    utilization: float
    throughput_per_hour: float
    queue_max: int
    runs: int
    passed: bool


@dataclass(frozen=True, slots=True)
class SweepResult:
    process_key: str
    points: list[SweepPoint]
    recommended_count: int | None
    analytic_count: int
    target_pct: float
    explanation: str
    best: SimResult | None


class Sweep:
    """Minimal fleet with mean SLA over `replications` runs ≥ target (D-007), searched around an estimate.

    Runs share random streams per replication (common random numbers): fleets are compared on the same days.
    """

    def __init__(
        self,
        inp: SimInput,
        process_key: str,
        replications: int,
        prepared: Prepared,
        progress: Callable[[float, str], None] | None = None,
    ) -> None:
        process = next((p for p in inp.processes if p.key == process_key), None)
        if process is None:
            raise SimulationError(f"Процесса {process_key} нет в сценарии")
        self.inp = inp
        self.process = process
        self.replications = max(1, replications)
        self.prepared = prepared
        self.progress = progress
        self.points: dict[int, SweepPoint] = {}
        self.results: dict[int, SimResult] = {}
        self.target = process.target_share * PERCENT

    def evaluate(self, count: int) -> SweepPoint:
        if count in self.points:
            return self.points[count]
        runs: list[SimResult] = []
        for replication in range(self.replications):
            config = replace(
                self.inp.config,
                mode=self.inp.config.mode if self.inp.config.mode != SimMode.NORMAL else SimMode.PEAK,
                fleet={**self.inp.config.fleet, self.process.key: count},
                seed=self.inp.config.seed + replication,
                record_events=False,
            )
            runs.append(simulate(replace(self.inp, config=config), self.prepared))
        slas = [r.summary.sla["achieved_pct"] for r in runs]
        mean_sla = sum(slas) / len(slas)
        point = SweepPoint(
            count=count,
            sla_achieved_pct=round(mean_sla, 2),
            sla_min_pct=round(min(slas), 2),
            utilization=round(sum(r.summary.utilization["fleet"] for r in runs) / len(runs), 4),
            throughput_per_hour=round(sum(r.summary.throughput_per_hour for r in runs) / len(runs), 2),
            queue_max=max(r.summary.queue["max"] for r in runs),
            runs=len(runs),
            passed=mean_sla >= self.target,
        )
        self.points[count] = point
        self.results[count] = runs[0]
        if self.progress is not None:
            self.progress(len(self.points), f"N = {count}: SLA {mean_sla:.1f} %")
        return point

    def run(self, low: int | None = None, high: int | None = None) -> SweepResult:
        analytic = max(1, self.process.analytic_robots or self.process.robots)
        if low is not None and high is not None:
            for count in range(max(1, low), max(low, high) + 1):
                self.evaluate(count)
            passing = sorted(c for c, p in self.points.items() if p.passed)
            return self._result(passing[0] if passing else None, analytic)
        self.evaluate(analytic)
        found = self._search(self._estimate(analytic) or analytic, analytic * SEARCH_LIMIT_FACTOR)
        if found is None:
            return self._result(None, analytic)
        if found > 1:
            self.evaluate(found - 1)
        self.evaluate(found + 1)
        return self._result(found, analytic)

    def _estimate(self, analytic: int) -> int | None:
        """Start near the answer: peak demand over the per-robot rate the first run actually achieved."""
        comparison = self.results[analytic].summary.vs_analytic
        if comparison is None or comparison.sim_throughput_per_hour <= 0:
            return None
        process, config = self.process, self.inp.config
        per_day = (
            process.lines_per_day
            if process.model == ProcessModel.GOODS_TO_PERSON
            else process.inbound_per_day + process.outbound_per_day + process.internal_per_day
        )
        peak = per_day / process.hours_per_day * process.peak_factor * config.volume_multiplier
        # The comparison applies the utilization target like the cycle model; the search wants raw capacity.
        per_robot = comparison.sim_throughput_per_hour / analytic / self.inp.settings.utilization_target
        return max(1, math.ceil(peak / per_robot))

    def _search(self, start: int, limit: int) -> int | None:
        """Galloping search from `start` for the pass/fail boundary, then bisection inside the bracket."""
        step = 1
        if self.evaluate(start).passed:
            hi, lo = start, start - step
            while lo >= 1 and self.evaluate(lo).passed:
                hi, step = lo, step * 2
                lo = hi - step
            lo = max(lo, 0)
        else:
            lo, hi = start, start + step
            while not self.evaluate(hi).passed:
                if hi >= limit:
                    return None
                lo, step = hi, step * 2
                hi = min(limit, lo + step)
        while hi - lo > 1:
            middle = (lo + hi) // 2
            if self.evaluate(middle).passed:
                hi = middle
            else:
                lo = middle
        return hi

    def _result(self, recommended: int | None, analytic: int) -> SweepResult:
        points = [self.points[c] for c in sorted(self.points)]
        return SweepResult(
            self.process.key,
            points,
            recommended,
            analytic,
            self.target,
            _explain(points, recommended, analytic, self.target, self.replications),
            self.results.get(recommended) if recommended is not None else None,
        )


def _explain(
    points: list[SweepPoint], recommended: int | None, analytic: int, target: float, runs: int
) -> str:
    by_count = {p.count: p for p in points}
    if recommended is None:
        worst = max(points, key=lambda p: p.count)
        return (
            f"Даже {worst.count} роботов дают SLA {fmt(worst.sla_achieved_pct)} % при цели {fmt(target)} %: "
            "ограничение не в числе роботов — смотрите узкое место прогона"
        )
    best = by_count[recommended]
    parts = [
        f"{recommended} — минимальное N с SLA ≥ {fmt(target)} % "
        f"(среднее {runs} прогонов пикового режима {fmt(best.sla_achieved_pct)} %)"
    ]
    below = by_count.get(recommended - 1)
    if below is not None:
        parts.append(f"{below.count} даёт {fmt(below.sla_achieved_pct)} %")
    if analytic != recommended and analytic in by_count:
        parts.append(
            f"по циклу {analytic}: загрузка {fmt(round(by_count[analytic].utilization * PERCENT))} %"
            if analytic > recommended
            else f"по циклу {analytic} — SLA {fmt(by_count[analytic].sla_achieved_pct)} %"
        )
    return "; ".join(parts)

from app.core.errors import InvalidInputError
from app.engine.simulation import SimInput
from app.engine.simulation.sweep import SEARCH_LIMIT_FACTOR

MAX_ROBOTS = 100
MAX_TASKS = 100_000
MAX_HOURS = 24
MAX_SWEEP_POINTS = 20


def validate_guest_simulation(inp: SimInput) -> None:
    hours = inp.config.duration_h or (inp.settings.peak_duration_h if inp.config.mode == "peak" else 24)
    robots = sum(inp.config.fleet.get(p.key, p.robots) for p in inp.processes)
    tasks = sum(
        (p.inbound_per_day + p.outbound_per_day + p.internal_per_day + p.lines_per_day)
        * inp.config.volume_multiplier
        * max(1, hours / max(1, p.hours_per_day))
        * max(1, p.peak_factor)
        for p in inp.processes
    )
    if hours > MAX_HOURS or robots > MAX_ROBOTS or tasks > MAX_TASKS:
        raise InvalidInputError(
            "Лимит демо: имитация до 24 часов, 100 роботов и 100 000 операций. Уменьшите нагрузку или парк."
        )
    if len(inp.plan.nodes) > 3000 or len(inp.plan.edges) > 6000:
        raise InvalidInputError("Лимит демо: планировка до 3000 узлов и 6000 проездов")


def validate_guest_sweep(inp: SimInput, low: int | None, high: int | None) -> None:
    validate_guest_simulation(inp)
    if any(max(p.analytic_robots, p.robots) * SEARCH_LIMIT_FACTOR > MAX_ROBOTS for p in inp.processes):
        raise InvalidInputError("Для перебора в демо уменьшите нагрузку: поиск ограничен 100 роботами")
    if high is not None and (high > MAX_ROBOTS or high - (low or 1) >= MAX_SWEEP_POINTS):
        raise InvalidInputError("Лимит демо: до 20 вариантов парка за один перебор, до 100 роботов")
    if low is not None and low > MAX_ROBOTS:
        raise InvalidInputError("Лимит демо: до 100 роботов")

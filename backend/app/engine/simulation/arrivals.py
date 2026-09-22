import random
from collections.abc import Callable, Generator
from typing import Any

import simpy

from app.engine.demand import profile_rate
from app.engine.layout import Node
from app.engine.simulation.models import SimConfig, SimMode, SimProcess, SimSettings

SECONDS_PER_HOUR = 3600.0
Emit = Callable[[str, str, str], None]


def hourly_rate(
    per_day: float, process: SimProcess, settings: SimSettings, config: SimConfig, t_s: float
) -> float:
    """Units per hour at time t: the day profile of `engine.demand` (the same one `/processes` shows)."""
    hours = process.hours_per_day
    if per_day <= 0 or hours <= 0:
        return 0.0
    average = per_day / hours
    if config.mode == SimMode.PEAK:
        return average * process.peak_factor * config.volume_multiplier
    rate = profile_rate(t_s / SECONDS_PER_HOUR, hours, process.peak_factor, settings.peak_window_h)
    return average * rate * config.volume_multiplier


class Picker:
    """Weighted random choice of rack faces or pods: a slot's chance is proportional to its capacity."""

    def __init__(self, rng: random.Random, nodes: list[Node]) -> None:
        self.rng = rng
        self.ids = [node.id for node in nodes]
        self.weights = [float(node.capacity or 1) for node in nodes]

    def __bool__(self) -> bool:
        return bool(self.ids)

    def pick(self, exclude: str | None = None) -> str:
        while True:
            choice = self.rng.choices(self.ids, self.weights)[0]
            if choice != exclude or len(self.ids) == 1:
                return choice


class Arrivals:
    """Task sources of one process. Pallets arrive by truck and appear at the door in the unloading rhythm."""

    def __init__(
        self,
        env: simpy.Environment,
        rng: random.Random,
        process: SimProcess,
        settings: SimSettings,
        config: SimConfig,
        end_s: float,
    ) -> None:
        self.env = env
        self.rng = rng
        self.process = process
        self.settings = settings
        self.config = config
        self.end_s = end_s

    def rate(self, per_day: float) -> float:
        return hourly_rate(per_day, self.process, self.settings, self.config, self.env.now)

    def _gap(self, per_hour: float) -> float | None:
        """Seconds to the next arrival, or None when the rate is zero until the next hour."""
        if per_hour <= 0:
            return None
        return self.rng.expovariate(per_hour / SECONDS_PER_HOUR)

    def _next_hour(self) -> float:
        return (self.env.now // SECONDS_PER_HOUR + 1) * SECONDS_PER_HOUR - self.env.now

    def poisson(self, per_day: float, on_arrival: Callable[[], None]) -> Generator[simpy.Event, Any]:
        while self.env.now < self.end_s:
            gap = self._gap(self.rate(per_day))
            if gap is None:
                yield self.env.timeout(self._next_hour())
                continue
            yield self.env.timeout(gap)
            if self.env.now < self.end_s:
                on_arrival()

    def trucks(
        self, per_day: float, berths: dict[str, simpy.Resource], unload: Callable[[str], None]
    ) -> Generator[simpy.Event, Any]:
        """Dock appointment scheduling: one truck of `sim_truck_pallets` per slot, arriving at a random moment
        inside its slot. The hourly volume matches the demand; the timing and door choice are random."""
        while self.env.now < self.end_s:
            rate = self.rate(per_day)
            if rate <= 0:
                yield self.env.timeout(self._next_hour())
                continue
            slot = self.settings.truck_pallets / rate * SECONDS_PER_HOUR
            offset = self.rng.uniform(0, slot)
            yield self.env.timeout(offset)
            if self.env.now >= self.end_s:
                return
            door = min(berths, key=lambda d: (len(berths[d].queue) + berths[d].count, self.rng.random()))
            self.env.process(self._truck(door, berths[door], unload))
            yield self.env.timeout(slot - offset)

    def _truck(
        self, door: str, berth: simpy.Resource, unload: Callable[[str], None]
    ) -> Generator[simpy.Event, Any]:
        with berth.request() as request:
            yield request
            interval = SECONDS_PER_HOUR / self.settings.door_pallets_per_hour
            for _ in range(int(self.settings.truck_pallets)):
                yield self.env.timeout(interval)
                unload(door)

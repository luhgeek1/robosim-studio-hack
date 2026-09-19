"""Robot quantity: required_throughput / effective_robot_throughput (PROJECT_CONTEXT §9)."""

from __future__ import annotations

import math

from ..models import Robot
from .catalog import spec_value
from .site import Site

CONGESTION = 0.04  # capacity lost per additional robot sharing the same aisles
DOWNTIME = 0.95  # unplanned stops, WMS waits


def availability(robot: Robot) -> float:
    battery = float(spec_value(robot, "battery_hours", 8))
    charge = float(spec_value(robot, "charge_min", 60)) / 60
    return battery / (battery + charge) * DOWNTIME


def distance_factor(site: Site) -> float:
    return max(0.5, min(1.0, 70 / site.avg_route_m))


def effective_throughput(robot: Robot, site: Site) -> float:
    """Pallets per hour one robot really delivers on this site."""
    nominal = float(spec_value(robot, "throughput_pallets_h", 0))
    return round(nominal * availability(robot) * distance_factor(site), 1)


def fleet_capacity(eff_single: float, n: int) -> float:
    return round(n * eff_single * (1 - CONGESTION * (n - 1)), 1)


def required_count(eff_single: float, site: Site, reserve: float = 0.0) -> int:
    if eff_single <= 0:
        return 0
    need = site.peak_rate * (1 + reserve)
    n = 1
    while fleet_capacity(eff_single, n) < need and n < 12:
        n += 1
    return n


def sizing_report(robot: Robot, site: Site) -> dict:
    eff = effective_throughput(robot, site)
    n = required_count(eff, site)
    return {
        "nominal_throughput": spec_value(robot, "throughput_pallets_h", 0),
        "availability": round(availability(robot), 2),
        "distance_factor": round(distance_factor(site), 2),
        "effective_throughput": eff,
        "required_throughput_peak": round(site.peak_rate, 1),
        "required_throughput_avg": round(site.avg_rate, 1),
        "required_count": n,
        "fleet_capacity": fleet_capacity(eff, n),
        "formula": "количество = пиковый поток ÷ эффективная производительность робота, с учётом зарядки, простоев и взаимных помех в проходах",
    }

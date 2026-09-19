"""Site model: everything the engines need, derived from canonical parameters."""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from ..schemas import ParameterValue

# 24-hour demand shape of a two-shift warehouse (sum 2000, peak/avg ≈ 1.48).
BASE_SHAPE = [48, 42, 36, 30, 34, 52, 74, 88, 96, 102, 104, 98, 92, 108, 118, 123, 121, 116, 104, 96, 90, 84, 76, 62]
MANUAL_PALLETS_PER_OPERATOR_H = 10.2  # forklift moves per operator-hour, incl. paperwork


@dataclass
class Site:
    object_type: str
    zone_area_m2: float
    aisle_width_m: float
    main_aisle_width_m: float
    pallet_weight_kg: float
    nonstandard_share: float
    daily_total: float
    shifts: int
    shift_hours: float
    working_hours: float
    peak_factor: float
    operators: int
    operator_salary: float
    payroll_coeff: float
    time_loss: float
    budget_mln: float
    target_sla: float
    horizon_years: int
    maintenance_rate: float
    wage_growth: float
    energy_price: float
    floor_flatness_mm: float
    has_wms: bool
    wms_api_known: bool
    working_days: int
    sla_window_min: float
    sla_penalty_rub: float
    transport_share: float
    profile: list[float] = field(default_factory=list)

    @property
    def avg_rate(self) -> float:
        return self.daily_total / self.working_hours

    @property
    def peak_rate(self) -> float:
        return self.avg_rate * self.peak_factor

    @property
    def operators_per_shift(self) -> float:
        return self.operators / max(1, self.shifts)

    @property
    def manual_capacity(self) -> float:
        return self.operators_per_shift * MANUAL_PALLETS_PER_OPERATOR_H * (1 - self.time_loss)

    @property
    def fte_cost_mln(self) -> float:
        return self.operator_salary * self.payroll_coeff * 12 / 1e6

    @property
    def current_labor_mln(self) -> float:
        return self.operators * self.fte_cost_mln

    @property
    def current_equipment_mln(self) -> float:
        return round(self.operators * 0.096, 2)  # forklift fleet: lease, service, energy

    @property
    def current_opex_mln(self) -> float:
        return round(self.current_labor_mln + self.current_equipment_mln + self.sla_cost_mln(self.current_sla), 2)

    current_sla: float = 100.0  # set by the orchestrator from the manual-process simulation

    def sla_cost_mln(self, sla_percent: float) -> float:
        """Penalties, re-deliveries and expediting caused by late pallets."""
        late = max(0.0, 1 - sla_percent / 100) * (self.daily_total / 2) * self.working_days
        return round(late * self.sla_penalty_rub / 1e6, 2)

    @property
    def avg_route_m(self) -> float:
        return 0.75 * math.sqrt(self.zone_area_m2)



def _v(params: dict[str, ParameterValue], key: str, default):
    p = params.get(key)
    return p.value if p is not None and p.value is not None else default


def build_profile(daily_total: float, peak_factor: float) -> list[float]:
    base_avg = sum(BASE_SHAPE) / 24
    base_peak_ratio = max(BASE_SHAPE) / base_avg
    # stretch/compress the shape around its mean so that max/avg == peak_factor (per 24h mean)
    k = (peak_factor * 24 / 22 - 1) / (base_peak_ratio - 1)
    shaped = [max(0.0, 1 + (h / base_avg - 1) * k) for h in BASE_SHAPE]
    s = sum(shaped)
    return [round(daily_total * v / s, 1) for v in shaped]


def build_site(object_type: str, params: dict[str, ParameterValue]) -> Site:
    daily_total = float(_v(params, "daily_pallets_in", 0)) + float(_v(params, "daily_pallets_out", 0))
    shifts = int(_v(params, "shifts_per_day", 2))
    shift_hours = float(_v(params, "shift_hours", 11))
    peak = float(_v(params, "peak_factor", 1.5))
    site = Site(
        object_type=object_type,
        zone_area_m2=float(_v(params, "robotized_area_m2", 10000)),
        aisle_width_m=float(_v(params, "aisle_width_m", 2.8)),
        main_aisle_width_m=float(_v(params, "main_aisle_width_m", 3.5)),
        pallet_weight_kg=float(_v(params, "avg_pallet_weight_kg", 800)),
        nonstandard_share=float(_v(params, "nonstandard_share", 5)),
        daily_total=daily_total,
        shifts=shifts,
        shift_hours=shift_hours,
        working_hours=min(24.0, shifts * shift_hours),
        peak_factor=peak,
        operators=int(_v(params, "forklift_operators", 25)),
        operator_salary=float(_v(params, "forklift_salary", 120000)),
        payroll_coeff=float(_v(params, "payroll_coeff", 1.302)),
        time_loss=float(_v(params, "time_loss_coeff", 25)) / 100,
        budget_mln=float(_v(params, "budget_mln", 80)),
        target_sla=float(_v(params, "target_sla_percent", 95)),
        horizon_years=int(_v(params, "horizon_years", 5)),
        maintenance_rate=float(_v(params, "maintenance_rate", 6)) / 100,
        wage_growth=float(_v(params, "wage_growth", 8)) / 100,
        energy_price=float(_v(params, "energy_price", 7.4)),
        floor_flatness_mm=float(_v(params, "floor_flatness_mm", 3)),
        has_wms=bool(_v(params, "has_wms", True)),
        wms_api_known=_v(params, "wms_api_version", None) is not None,
        working_days=int(_v(params, "working_days", 365)),
        sla_window_min=float(_v(params, "sla_window_min", 20)),
        sla_penalty_rub=float(_v(params, "sla_penalty_rub", 20)),
        transport_share=float(_v(params, "transport_share", 40)) / 100,
    )
    site.profile = build_profile(daily_total, peak)
    return site

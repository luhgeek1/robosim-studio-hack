"""Economics engine: CAPEX, OPEX, TCO, savings, ROI, payback and the three scenarios.

Assumptions are explicit constants here so they can be shown to the user.
"""

from __future__ import annotations

from ..models import Robot
from ..schemas import EconResult, Scenario, SimKpis
from .catalog import spec_value
from .site import MANUAL_PALLETS_PER_OPERATOR_H, Site

INTEGRATION_MLN = 1.2  # WMS integration + commissioning (per project)
CHARGER_MLN_PER_ROBOT = 0.17
SOFTWARE_MLN = 0.5  # fleet manager licence, one-off
MARKING_MLN = 0.9  # floor QR grid if required
RESERVE = 0.10  # dataset: +10 % reserve inside CAPEX
LICENCE_MLN_PER_ROBOT_YEAR = 0.10
BATTERY_RESERVE_MLN_PER_ROBOT_YEAR = 0.05
ROBOT_AVG_KW = 1.0
FORKLIFT_RETIRED_SAVING_MLN = 0.1  # per replaced FTE: fewer forklifts to lease and service
RAAS_MONTHLY_RATE = 0.045  # of robot price, includes service and software
RAAS_SETUP_MLN = 0.6
IMPLEMENTATION_MONTHS = 3
RAMP_MONTHS = 6
MONTHS = 60


def fleet_capex(robot: Robot, n: int, site: Site) -> dict[str, float]:
    price = (robot.price_rub or 0) / 1e6
    parts = {
        "robots": round(price * n, 2),
        "integration": INTEGRATION_MLN,
        "charging": round(CHARGER_MLN_PER_ROBOT * n, 2),
        "software": SOFTWARE_MLN,
    }
    if spec_value(robot, "needs_floor_marking", False):
        parts["marking"] = MARKING_MLN
    parts["reserve"] = round(sum(parts.values()) * RESERVE, 2)
    parts["total"] = round(sum(parts.values()), 1)
    return parts


def robot_opex(robot: Robot, n: int, capex_total: float, site: Site) -> dict[str, float]:
    energy = n * ROBOT_AVG_KW * site.working_hours * site.working_days * site.energy_price / 1e6
    parts = {
        "maintenance": round(capex_total * site.maintenance_rate, 2),
        "energy": round(energy, 2),
        "licences": round(LICENCE_MLN_PER_ROBOT_YEAR * n, 2),
        "batteries": round(BATTERY_RESERVE_MLN_PER_ROBOT_YEAR * n, 2),
    }
    parts["total"] = round(sum(parts.values()), 2)
    return parts


def replaced_fte(n: int, n_req: int, capacity: float, site: Site, overflow_pallets_day: float) -> tuple[float, float]:
    """Robots displace the transport part of operators' work: one operator per shift per
    robot (plus the absence coverage those operators needed), capped by the share of
    operator time that is actually transport. Robots beyond the required count add only
    half as much (they pick up ancillary moves). Overflow the fleet cannot handle still
    needs people."""
    cap = site.operators * site.transport_share
    extra = max(0, n - n_req)
    base = site.shifts * (min(n, n_req) + 0.5 * extra) * (1 + site.time_loss)
    coverage = min(1.0, capacity / site.avg_rate) if site.avg_rate else 1.0
    gross = min(cap, base * coverage)
    overflow_fte = overflow_pallets_day / (MANUAL_PALLETS_PER_OPERATOR_H * site.shift_hours * (1 - site.time_loss)) if overflow_pallets_day > 0 else 0.0
    return round(max(0.0, gross - overflow_fte), 1), round(overflow_fte, 1)


def cumulative_curve(capex: float, net_month_full: float, growth_year: float, lag: int, ramp: int) -> list[float]:
    g = (1 + growth_year) ** (1 / 12)
    out = [-capex]
    acc = -capex
    for m in range(1, MONTHS + 1):
        if m <= lag:
            rate = 0.0
        elif m <= lag + ramp:
            rate = net_month_full * (m - lag) / (ramp + 1)
        else:
            rate = net_month_full * g ** (m - lag - ramp)
        acc += rate
        out.append(round(acc, 2))
    return out


def payback_from_curve(curve: list[float]) -> float | None:
    for m in range(1, len(curve)):
        if curve[m] >= 0:
            prev, cur = curve[m - 1], curve[m]
            frac = (0 - prev) / (cur - prev) if cur != prev else 0
            return round((m - 1 + frac) / 12, 1)
    return None


def evaluate(robot: Robot, n: int, n_req: int, site: Site, sim_normal: SimKpis) -> EconResult:
    capex = fleet_capex(robot, n, site)
    opex_r = robot_opex(robot, n, capex["total"], site)
    overflow_day = sim_normal.escalated  # pallets/day robots could not serve in time
    fte, overflow_fte = replaced_fte(n, n_req, sim_normal.throughput, site, overflow_day)
    labor_saving = fte * site.fte_cost_mln
    equipment_saving = fte * FORKLIFT_RETIRED_SAVING_MLN
    sla_delta = site.sla_cost_mln(site.current_sla) - site.sla_cost_mln(sim_normal.sla)  # positive when robots reduce late pallets
    savings_year = round(labor_saving + equipment_saving + sla_delta - opex_r["total"], 2)
    opex_after = round(site.current_opex_mln - savings_year, 2)
    curve = cumulative_curve(capex["total"], savings_year / 12, site.wage_growth, IMPLEMENTATION_MONTHS, RAMP_MONTHS)
    net5 = round(curve[-1], 1)
    roi = round(100 * net5 / capex["total"]) if capex["total"] else None
    return EconResult(
        capex_mln=capex["total"], capex_breakdown=capex, opex_mln=opex_after,
        opex_breakdown={"labor": round(site.current_labor_mln - labor_saving, 2), "equipment": round(site.current_equipment_mln - equipment_saving, 2), "sla_losses": site.sla_cost_mln(sim_normal.sla), **{f"robots_{k}": v for k, v in opex_r.items() if k != "total"}},
        current_opex_mln=site.current_opex_mln, savings_year_mln=savings_year, net_savings_5y_mln=net5, roi_5y=roi,
        payback_years=payback_from_curve(curve), replaced_fte=fte, manual_overflow_pallets=round(overflow_day, 0), curve=curve,
    )


def _tco(opex_year: float, growth: float, capex: float = 0.0, years: int = 5) -> float:
    return round(capex + sum(opex_year * (1 + growth) ** y for y in range(years)), 1)


def scenarios(robot: Robot, n: int, site: Site, econ: EconResult, sim_normal: SimKpis, current_sla: float) -> list[Scenario]:
    price = (robot.price_rub or 0) / 1e6
    fee_year = RAAS_MONTHLY_RATE * price * n * 12
    opex_r = robot_opex(robot, n, econ.capex_mln, site)
    labor_part = site.current_opex_mln - econ.opex_mln + opex_r["total"]  # labor + equipment + SLA savings
    raas_opex = round(site.current_opex_mln - labor_part + fee_year + opex_r["energy"], 2)
    raas_saving_year = round(site.current_opex_mln - raas_opex, 2)
    raas_curve = cumulative_curve(RAAS_SETUP_MLN, raas_saving_year / 12, site.wage_growth, 2, 3)
    raas_net5 = round(raas_curve[-1], 1)
    current_tco = _tco(site.current_opex_mln, site.wage_growth)
    purchase_tco = round(current_tco - econ.net_savings_5y_mln, 1)
    raas_tco = round(current_tco - raas_net5, 1)
    purchase_better = econ.net_savings_5y_mln >= raas_net5 and econ.capex_mln <= site.budget_mln
    fmt = lambda v: f"{v:.1f}".replace(".", ",")
    return [
        Scenario(id="current", name="Как сейчас", caption="Ручной процесс, без изменений", capex=0.0, opex=site.current_opex_mln, tco5y=current_tco,
                 savings5y=0.0, roi5y=None, payback=None, payback_label="—", throughput=round(site.manual_capacity, 0), sla=round(current_sla), robots=0,
                 recommended=False, note=f"Зарплаты растут на {round(site.wage_growth * 100)} % в год, в пик SLA не выполняется", curve=[0.0] * (MONTHS + 1)),
        Scenario(id="purchase", name="Покупка", caption=f"{n} × {robot.short_name} в собственность", capex=econ.capex_mln, opex=econ.opex_mln, tco5y=purchase_tco,
                 savings5y=econ.net_savings_5y_mln, roi5y=econ.roi_5y, payback=econ.payback_years,
                 payback_label=f"{fmt(econ.payback_years)} года" if econ.payback_years else "не окупается за 5 лет",
                 throughput=sim_normal.throughput, sla=sim_normal.sla, robots=n, recommended=purchase_better,
                 note="Максимальная выгода за 5 лет" + (", укладывается в бюджет" if econ.capex_mln <= site.budget_mln else ", но выше бюджета"), curve=econ.curve),
        Scenario(id="raas", name="RaaS", caption=f"{n} × {robot.short_name} в аренду", capex=RAAS_SETUP_MLN, opex=raas_opex, tco5y=raas_tco,
                 savings5y=raas_net5, roi5y=None, payback=payback_from_curve(raas_curve), payback_label="с 3-го месяца" if raas_saving_year > 0 else "не окупается",
                 throughput=sim_normal.throughput, sla=sim_normal.sla, robots=n, recommended=not purchase_better,
                 note="Без капитальных затрат, подходит для пилота на 12 месяцев", curve=raas_curve),
    ]

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field

from app.engine.finance import MONTHS_PER_YEAR, annuity_payment
from app.engine.trace import Book, fmt

PERCENT = 100
SECONDS_PER_HOUR = 3600
MINUTES_PER_HOUR = 60
ROUND_TRIP = 2
ROBOTS_PER_OPERATOR_NORM_UNIT = 10
MLN = 1_000_000


@dataclass(frozen=True, slots=True)
class CalibrationCase:
    key: str
    title: str
    source: str
    note: str
    inputs: Mapping[str, float]
    expected: Mapping[str, float]
    tolerance_pct: float
    solution_types: Sequence[str] = ()
    financing: Sequence[str] = ()


@dataclass(frozen=True, slots=True)
class CalibrationCheck:
    key: str
    name: str
    ours: float
    reference: float
    unit: str

    @property
    def deviation_pct(self) -> float:
        return (self.ours - self.reference) / self.reference * PERCENT


@dataclass(frozen=True, slots=True)
class Calibration:
    case_key: str
    reference: str
    note: str
    tolerance_pct: float
    checks: list[CalibrationCheck] = field(default_factory=list)

    @property
    def deviation_pct(self) -> float | None:
        return self.checks[0].deviation_pct if self.checks else None

    @property
    def within_tolerance(self) -> bool:
        return all(abs(check.deviation_pct) <= self.tolerance_pct for check in self.checks)


def _warehouse_costs(case: CalibrationCase, norms: Book) -> tuple[float, dict[str, float]]:
    """Cost of one robot line over the case horizon with our norms and the case's own inputs."""
    i, n = case.inputs, norms.value
    hardware = i["robot_price_rub"] + i["chargers"] * n("charging_station_rub")
    parts = {
        "hardware": hardware,
        "delivery": hardware * n("delivery_share_of_hardware"),
        "commissioning": hardware * n("commissioning_share_of_hardware"),
        "software": i["robots"] * n("rms_license_rub_per_robot"),
    }
    parts["contingency"] = sum(parts.values()) * n("capex_contingency_share")
    capex = sum(parts.values())
    operators = (
        i["robots"]
        / ROBOTS_PER_OPERATOR_NORM_UNIT
        * n("robot_operator_ftes_per_10_robots")
        * n("robot_operator_salary_rub_month")
        * MONTHS_PER_YEAR
        * (1 + n("payroll_tax_share"))
    )
    opex = {
        "service": hardware * n("service_share_of_hardware_per_year"),
        "spare_parts": i["robot_price_rub"] * n("spare_parts_share_of_hardware_per_year"),
        "subscription": i["robots"] * n("software_subscription_rub_per_robot_year"),
        "energy": i["robots"]
        * n("robot_avg_power_kw")
        * i["hours_per_day"]
        * i["days_per_year"]
        / n("charger_efficiency")
        * n("electricity_tariff_rub_kwh"),
        "battery": i["robot_price_rub"]
        * n("battery_cost_share_of_hardware")
        / n("battery_replacement_interval_years"),
        "operators": operators,
    }
    years = i["years"]
    extra = {
        "ПНР": parts["commissioning"],
        "резерв CAPEX": parts["contingency"],
        "ПО (лицензия и подписка)": parts["software"] + opex["subscription"] * years,
        "персонал эксплуатации": operators * years,
    }
    return capex + sum(opex.values()) * years, extra


def _throughput(case: CalibrationCase, norms: Book) -> float:
    i, n = case.inputs, norms.value
    travel = ROUND_TRIP * i["route_length_m"] / (i["speed_mps"] * n("effective_speed_factor"))
    cycle = travel + n("load_handling_time_s") + n("unload_handling_time_s")
    availability = i["runtime_min"] / (i["runtime_min"] + i["charging_min"])
    per_hour = SECONDS_PER_HOUR / cycle * availability * n("amr_utilization_target")
    return per_hour * i["hours_per_day"] * i["days_per_year"]


def calibrate_warehouse(case: CalibrationCase, norms: Book) -> Calibration:
    """ФЦ БАС «1 робот = 3 человека»: 4,4 млн ₽ против 9,4 млн за 3 года — recomputed with our norm set."""
    robot_cost, extra = _warehouse_costs(case, norms)
    i, e = case.inputs, case.expected
    people = i["people_replaced"] * i["person_cost_rub_year"] * i["years"]
    pallets = _throughput(case, norms)
    checks = [
        CalibrationCheck(
            "robot_cost",
            f"Стоимость роботизированной линии за {i['years']:g} года",
            robot_cost,
            e["robot_cost_rub"],
            "₽",
        ),
        CalibrationCheck(
            "people_cost",
            f"Стоимость 3 сотрудников за {i['years']:g} года",
            people,
            e["people_cost_rub"],
            "₽",
        ),
        CalibrationCheck(
            "pallets_per_year", "Паллет в год на одного робота", pallets, e["pallets_per_year"], "палл/год"
        ),
    ]
    gap = ", ".join(f"{name} {fmt(round(value / MLN, 2))} млн ₽" for name, value in extra.items())
    ratio = fmt(round(e["pallets_per_year"] / pallets, 1))
    hourly = fmt(round(e["pallets_per_year"] / i["days_per_year"] / i["hours_per_day"], 1))
    note = (
        "Структура расчёта та же (CAPEX первого года + владение по годам против ФОТ), расходятся нормативы. "
        f"Наша линия дороже на {fmt(round(checks[0].deviation_pct))} %: в модельном кейсе ФЦ БАС нет статей "
        f"{gap}. Производительность робота у нас в {ratio} раза ниже: ФЦ БАС закладывает {hourly} палл/ч "
        "круглосуточно (идеальный цикл без зарядки), мы — эффективную скорость, загрузку парка и зарядку "
        "по их же паспорту H1500 (240 мин работы на 80 мин зарядки). "
        "Итоговое число роботов проверит имитация."
    )
    return Calibration(case.key, case.title, note, case.tolerance_pct, checks)


def calibrate_annuity(case: CalibrationCase) -> Calibration:
    i = case.inputs
    months = int(i["term_months"])
    annual = annuity_payment(i["principal_rub"], i["rate"], months, MONTHS_PER_YEAR) * MONTHS_PER_YEAR
    check = CalibrationCheck(
        "annual_payment", "Платежи по кредиту за год", annual, case.expected["annual_payment_rub"], "₽"
    )
    return Calibration(case.key, case.title, case.note, case.tolerance_pct, [check])


def applicable(
    cases: Sequence[CalibrationCase], solution_types: set[str], financing: str | None, norms: Book
) -> list[Calibration]:
    result: list[Calibration] = []
    for case in cases:
        if case.solution_types and solution_types & set(case.solution_types):
            result.append(calibrate_warehouse(case, norms))
        elif case.financing and financing in case.financing:
            result.append(calibrate_annuity(case))
    return result

from app.domain.scenario.models import ScenarioKind
from app.engine.economics.lines import MONTHS_PER_YEAR, LineBuilder, q
from app.engine.economics.models import Breakdown, FleetItem, Line
from app.engine.trace import InputKind, Quantity, Section, TraceStep

# The operator norm is published per 10 robots («FTE на 10 роботов»), so 10 is its unit, not a coefficient.
ROBOTS_PER_OPERATOR_NORM_UNIT = 10


class OpexLines(LineBuilder):
    def _energy(self) -> TraceStep:
        power, tariff = self.norms.get("robot_avg_power_kw"), self.norms.get("electricity_tariff_rub_kwh")
        efficiency, days = self.norms.get("charger_efficiency"), self.inp.working_days
        parts: list[Quantity] = []
        for item in self.inp.items:
            inputs = [item.robots_working, power, item.hours_per_day, days, efficiency, tariff]
            parts.append(
                q(
                    self.tr.record(
                        f"energy.{item.key}",
                        f"Электроэнергия: {item.process_name}",
                        item.robots_working.value
                        * power.value
                        * item.hours_per_day.value
                        * days.value
                        / efficiency.value
                        * tariff.value,
                        "₽/год",
                        f"{item.robots_working.key} × {power.key} × {item.hours_per_day.key} × {days.key}"
                        f" / {efficiency.key} × {tariff.key}",
                        inputs,
                        Section.OPEX,
                    )
                )
            )
        return self._sum("opex_energy", "Электроэнергия", parts, "₽/год", Section.OPEX)

    def _operators(self, robots: TraceStep) -> TraceStep:
        minimum = self.norms.get("robot_operator_min_ftes_per_site")
        per_ten = self.norms.get("robot_operator_ftes_per_10_robots")
        fte = self.tr.record(
            "operators_fte",
            "Персонал эксплуатации роботов",
            max(minimum.value, robots.value / ROBOTS_PER_OPERATOR_NORM_UNIT * per_ten.value),
            "FTE",
            f"max({minimum.key}, robots_total / 10 × {per_ten.key})",
            [minimum, q(robots), per_ten],
            Section.OPEX,
        )
        salary, payroll = self.norms.get("robot_operator_salary_rub_month"), self.inp.payroll
        return self.tr.record(
            "opex_operators",
            "Персонал эксплуатации (ФОТ с начислениями)",
            fte.value * salary.value * MONTHS_PER_YEAR * payroll.value,
            "₽/год",
            f"operators_fte × {salary.key} × 12 × {payroll.key}",
            [q(fte), salary, payroll],
            Section.OPEX,
        )

    def _raas_fee(self, item: FleetItem) -> TraceStep:
        terms = self.inp.financing.raas
        key, name = f"raas_fee.{item.key}", f"Плата RaaS: {item.product_name}"
        if terms.per_operation_fee_rub is not None and item.annual_operations is not None:
            fee = Quantity(
                "per_operation_fee_rub",
                "Плата за операцию по договору",
                terms.per_operation_fee_rub,
                "₽",
                InputKind.PARAM,
            )
            return self.tr.record(
                key,
                name,
                fee.value * item.annual_operations.value,
                "₽/год",
                f"{fee.key} × {item.annual_operations.key}",
                [fee, item.annual_operations],
                Section.OPEX,
            )
        if terms.monthly_fee_rub_per_robot is not None:
            monthly = Quantity(
                "monthly_fee_rub_per_robot",
                "Плата за робота в месяц по договору",
                terms.monthly_fee_rub_per_robot,
                "₽/мес",
                InputKind.PARAM,
            )
            formula = f"{item.robots.key} × {monthly.key} × 12"
        elif item.rent_month is not None:
            monthly = item.rent_month
            formula = f"{item.robots.key} × {monthly.key} × 12"
        else:
            share, floor = (
                self.norms.get("raas_fee_share_of_hardware_month"),
                self.norms.get("raas_fee_rub_per_robot_month"),
            )
            monthly = self.tr.record(
                f"raas_monthly.{item.key}",
                "Плата за робота в месяц",
                max(item.price.value * share.value, floor.value),
                "₽/мес",
                f"max({item.price.key} × {share.key}, {floor.key})",
                [item.price, share, floor],
                Section.OPEX,
            ).as_quantity()
            formula = f"{item.robots.key} × raas_monthly.{item.key} × 12"
        return self.tr.record(
            key,
            name,
            item.robots.value * monthly.value * MONTHS_PER_YEAR,
            "₽/год",
            formula,
            [item.robots, monthly],
            Section.OPEX,
        )

    def opex(
        self, equipment: TraceStep, hardware: TraceStep, robots: TraceStep
    ) -> tuple[Breakdown, dict[str, float]]:
        raas = self.inp.financing.raas
        owned = self.kind != ScenarioKind.RAAS
        lines: list[Line] = []
        parts: dict[str, float] = {"operators": 0.0, "battery": 0.0, "fee": 0.0, "ownership": 0.0}
        service = self._share(
            "opex_service",
            "Сервисное обслуживание",
            hardware,
            "service_share_of_hardware_per_year",
            Section.OPEX,
        )
        spare = self._share(
            "opex_spare_parts",
            "Расходники и запчасти",
            equipment,
            "spare_parts_share_of_hardware_per_year",
            Section.OPEX,
        )
        subscription = self.norms.get("software_subscription_rub_per_robot_year")
        software = self.tr.record(
            "opex_software",
            "Подписка на ПО и мониторинг",
            robots.value * subscription.value,
            "₽/год",
            f"robots_total × {subscription.key}",
            [q(robots), subscription],
            Section.OPEX,
        )
        parts["ownership"] = service.value + spare.value + software.value
        if owned or not raas.includes_service:
            lines += [Line(service), Line(spare)]
        if owned or not raas.includes_software:
            lines.append(Line(software))
        if owned:
            share, interval = (
                self.norms.get("battery_cost_share_of_hardware"),
                self.norms.get("battery_replacement_interval_years"),
            )
            battery = self.tr.record(
                "opex_battery",
                "Замена АКБ (в среднем за год)",
                equipment.value * share.value / interval.value,
                "₽/год",
                f"equipment_rub × {share.key} / {interval.key}",
                [q(equipment), share, interval],
                Section.OPEX,
            )
            lines.append(Line(battery, note="В денежном потоке — в годы замены"))
            parts["battery"] = battery.value
        else:
            fees = [q(self._raas_fee(item)) for item in self.inp.items]
            fee = self._sum("opex_raas_fee", "Абонентская плата RaaS", fees, "₽/год", Section.OPEX)
            lines.append(
                Line(
                    fee,
                    note="Включает роботов, зарядки"
                    + (", сервис" if raas.includes_service else "")
                    + (", ПО" if raas.includes_software else ""),
                )
            )
            parts["fee"] = fee.value
        lines.append(Line(self._energy()))
        operators = self._operators(robots)
        lines.append(Line(operators))
        parts["operators"] = operators.value
        lines += self._site_lines("opex", Section.OPEX)
        total = self._sum(
            "opex_total", "OPEX роботизации", [q(line.step) for line in lines], "₽/год", Section.OPEX
        )
        return Breakdown(total.value, lines), parts

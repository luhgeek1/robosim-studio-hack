from dataclasses import dataclass, field

from app.domain.scenario.models import ScenarioKind
from app.engine.economics.lines import MONTHS_PER_YEAR, q
from app.engine.economics.models import Breakdown, EffectKind, FleetItem, Line
from app.engine.economics.opex import OpexLines
from app.engine.trace import InputKind, Quantity, Section, TraceStep


@dataclass(slots=True)
class AnnualCosts:
    capex: Breakdown
    opex: Breakdown
    baseline: Breakdown
    savings: list[Line]
    equipment: float
    hardware: float
    robots_total: int
    operators_year: float
    battery_year: float
    fee_year: float
    ownership_opex_year: float
    warnings: list[str] = field(default_factory=list)

    @property
    def savings_year(self) -> float:
        return sum(line.step.value for line in self.savings)

    @property
    def fte_released(self) -> float:
        return sum(line.fte or 0.0 for line in self.savings)


class CostModel(OpexLines):
    """Annual CAPEX, OPEX, baseline and labor savings (ТЗ 3.5.2) — each line is a traced formula."""

    def hardware(self) -> tuple[list[Line], TraceStep, TraceStep, TraceStep]:
        """Robots, chargers and G2P stations: priced for purchase, used as a base for RaaS and lease."""
        lines: list[Line] = []
        for item in self.inp.items:
            step = self.tr.record(
                f"capex_equipment.{item.key}",
                f"Роботы: {item.product_name} × {item.robots.value:.0f}",
                item.price.value * item.robots.value,
                "₽",
                f"{item.price.key} × {item.robots.key}",
                [item.price, item.robots],
                Section.CAPEX,
            )
            lines.append(Line(step, note=item.process_name))
        equipment = self._sum(
            "equipment_rub", "Стоимость роботов", [q(line.step) for line in lines], "₽", Section.CAPEX
        )
        extras = [q(equipment)]
        for key, count_key, norm_key, name in (
            ("capex_chargers", "chargers", "charging_station_rub", "Зарядные станции"),
            ("capex_stations", "stations", "g2p_station_rub", "Станции отбора «товар к человеку»"),
        ):
            counts = [getattr(item, count_key) for item in self.inp.items]
            total = sum(q.value for q in counts)
            if total <= 0:
                continue
            count = self._sum(f"{count_key}_total", f"{name}, шт", counts, "шт", Section.SIZING)
            price = self.norms.get(norm_key)
            step = self.tr.record(
                key,
                name,
                count.value * price.value,
                "₽",
                f"{count.key} × {price.key}",
                [q(count), price],
                Section.CAPEX,
            )
            lines.append(Line(step))
            extras.append(q(step))
        hardware = self._sum(
            "hardware_rub", "Оборудование: роботы, зарядки, станции", extras, "₽", Section.CAPEX
        )
        robots = self._sum(
            "robots_total",
            "Роботов в сценарии",
            [item.robots for item in self.inp.items],
            "шт",
            Section.SIZING,
        )
        return lines, equipment, hardware, robots

    def capex(self, hardware_lines: list[Line], hardware: TraceStep, robots: TraceStep) -> Breakdown:
        lines: list[Line] = []
        if self.kind == ScenarioKind.RAAS:
            setup_fee = self.inp.financing.raas.setup_fee_rub
            if setup_fee is not None:
                fee = Quantity(
                    "raas_setup_fee_rub", "Подключение RaaS по договору", setup_fee, "₽", InputKind.PARAM
                )
                step = self.tr.record(
                    "capex_raas_setup", "Подключение к RaaS", fee.value, "₽", fee.key, [fee], Section.CAPEX
                )
            else:
                step = self._share(
                    "capex_raas_setup", "Подключение к RaaS", hardware, "raas_setup_fee_share", Section.CAPEX
                )
            lines.append(Line(step, note="Роботы, зарядки, сервис и ПО — в абонентской плате"))
        else:
            lines += hardware_lines
            lines.append(
                Line(
                    self._share(
                        "capex_delivery",
                        "Доставка оборудования",
                        hardware,
                        "delivery_share_of_hardware",
                        Section.CAPEX,
                    )
                )
            )
            license_norm = self.norms.get("rms_license_rub_per_robot")
            lines.append(
                Line(
                    self.tr.record(
                        "capex_software",
                        "ПО управления парком (лицензии)",
                        robots.value * license_norm.value,
                        "₽",
                        f"robots_total × {license_norm.key}",
                        [q(robots), license_norm],
                        Section.CAPEX,
                    )
                )
            )
            lines.append(
                Line(
                    self._share(
                        "capex_commissioning",
                        "Пусконаладка (ПНР)",
                        hardware,
                        "commissioning_share_of_hardware",
                        Section.CAPEX,
                    )
                )
            )
        lines += self._site_lines("capex", Section.CAPEX)
        subtotal = self._sum(
            "capex_subtotal", "CAPEX до резерва", [q(line.step) for line in lines], "₽", Section.CAPEX
        )
        lines.append(
            Line(
                self._share(
                    "capex_contingency",
                    "Резерв на непредвиденные расходы",
                    subtotal,
                    "capex_contingency_share",
                    Section.CAPEX,
                )
            )
        )
        total = self._sum("capex_total", "CAPEX", [q(subtotal), q(lines[-1].step)], "₽", Section.CAPEX)
        return Breakdown(total.value, lines)

    def baseline(self) -> Breakdown:
        lines: list[Line] = []
        payroll = self.inp.payroll
        for labor in self.inp.labor:
            step = self.tr.record(
                f"baseline.{labor.key}",
                f"ФОТ с начислениями: {labor.name}",
                labor.headcount.value * labor.salary.value * MONTHS_PER_YEAR * payroll.value,
                "₽/год",
                f"{labor.headcount.key} × {labor.salary.key} × 12 × {payroll.key}",
                [labor.headcount, labor.salary, payroll],
                Section.BASELINE,
            )
            lines.append(Line(step, fte=labor.headcount.value))
        total = self._sum(
            "baseline_total",
            "Затраты «как сейчас»",
            [q(line.step) for line in lines],
            "₽/год",
            Section.BASELINE,
        )
        return Breakdown(total.value, lines)

    def savings(self) -> list[Line]:
        lines: list[Line] = []
        for item in self.inp.items:
            if item.release is None:
                self.warnings.append(
                    f"{item.process_name}: не задана доля высвобождения персонала — экономия ФОТ не считается"
                )
                continue
            share = self._released_share(item)
            step = self.tr.record(
                f"labor_savings.{item.key}",
                f"Высвобождение ФОТ: {item.process_name}",
                item.labor_cost.value * share.value,
                "₽/год",
                f"{item.labor_cost.key} × {share.key}",
                [item.labor_cost, share],
                Section.EFFECT,
            )
            lines.append(Line(step, EffectKind.COST_REDUCTION, fte=item.labor_fte * share.value))
        return lines

    def _released_share(self, item: FleetItem) -> Quantity:
        """Share of payroll released: release × coverage, capped by the work the robots actually take over."""
        assert item.release is not None
        wanted = item.release.value * item.coverage.value
        cap = item.release_cap_fte
        if cap is None or item.labor_fte <= 0:
            return self.tr.record(
                f"{item.key}.released_share",
                "Доля ФОТ процесса, которая высвобождается",
                wanted,
                "доля",
                f"{item.release.key} × {item.coverage.key}",
                [item.release, item.coverage],
                Section.EFFECT,
            ).as_quantity()
        fte = Quantity(f"{item.key}.labor_fte", "Персонал процесса", item.labor_fte, "FTE", InputKind.METRIC)
        share = min(wanted, cap.value / item.labor_fte)
        if share < wanted:
            self.warnings.append(
                f"{item.process_name}: высвобождение ограничено объёмом работ — {cap.value:.1f} FTE "
                f"вместо {item.labor_fte * wanted:.1f} по численности из датасета"
            )
        return self.tr.record(
            f"{item.key}.released_share",
            "Доля ФОТ процесса, которая высвобождается",
            share,
            "доля",
            f"min({item.release.key} × {item.coverage.key}, {cap.key} / {fte.key})",
            [item.release, item.coverage, cap, fte],
            Section.EFFECT,
        ).as_quantity()

    def evaluate(self) -> AnnualCosts:
        baseline = self.baseline()
        if self.kind == ScenarioKind.BASELINE:
            # «Как сейчас» has no robots: zero totals are still steps, so every later formula has its inputs.
            capex = Breakdown(self._sum("capex_total", "CAPEX", [], "₽", Section.CAPEX).value, [])
            opex = Breakdown(self._sum("opex_total", "OPEX роботизации", [], "₽/год", Section.OPEX).value, [])
            return AnnualCosts(capex, opex, baseline, [], 0.0, 0.0, 0, 0.0, 0.0, 0.0, 0.0, self.warnings)
        hardware_lines, equipment, hardware, robots = self.hardware()
        capex = self.capex(hardware_lines, hardware, robots)
        opex, parts = self.opex(equipment, hardware, robots)
        return AnnualCosts(
            capex=capex,
            opex=opex,
            baseline=baseline,
            savings=self.savings(),
            equipment=equipment.value,
            hardware=hardware.value,
            robots_total=int(robots.value),
            operators_year=parts["operators"],
            battery_year=parts["battery"],
            fee_year=parts["fee"],
            ownership_opex_year=parts["ownership"],
            warnings=self.warnings,
        )

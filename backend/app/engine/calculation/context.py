from app.domain.reference import ProcessDef
from app.engine.calculation.models import CalculationError, CalculationInput
from app.engine.economics import LaborLine, SiteCost
from app.engine.expressions import ExpressionError, MissingValueError, parse
from app.engine.trace import Book, InputKind, Quantity, Section, Tracer, TraceStep, display_formula

PAYROLL_COEFF_PARAM = "payroll_tax_coeff"
WORKING_DAYS_PARAM = "working_days_per_year"
MONTHS_PER_YEAR = 12


class Books:
    def __init__(self, inp: CalculationInput) -> None:
        self.params = Book.of(
            InputKind.PARAM,
            [
                (key, meta.name, inp.params.get(key), meta.unit)
                for key, meta in inp.param_meta.items()
                if inp.params.get(key) is not None
            ],
        )
        self.norms = inp.norms
        self.layout = inp.layout
        self.values: dict[str, float | None] = {k: q.value for k, q in inp.norms.items.items()}
        self.values.update({k: q.value for k, q in inp.layout.items.items()})
        self.values.update({k: v for k, v in inp.params.items() if v is not None})

    def quantity(self, name: str) -> Quantity:
        return self.params.optional(name) or self.layout.optional(name) or self.norms.get(name)

    def expression(self, source: str) -> tuple[float, list[Quantity]]:
        expression = parse(source)
        value = expression.evaluate(self.values)
        return value, [
            self.quantity(name) for name in sorted(expression.names) if self.values.get(name) is not None
        ]


class Context:
    def __init__(self, inp: CalculationInput, render: bool) -> None:
        self.inp = inp
        self.tr = Tracer(render=render)
        self.books = Books(inp)
        self.processes = {p.key: p for p in inp.processes}
        self.warnings: list[str] = []

    def record_expression(
        self, key: str, name: str, source: str, unit: str | None, section: Section
    ) -> TraceStep:
        try:
            value, inputs = self.books.expression(source)
        except MissingValueError as exc:
            names = ", ".join(self.label(n) for n in exc.names)
            raise CalculationError(f"{name}: не заданы {names}") from exc
        except ExpressionError as exc:
            raise CalculationError(f"{name}: {exc}") from exc
        return self.tr.record(key, name, value, unit, display_formula(source), inputs, section)

    def label(self, key: str) -> str:
        meta = self.inp.param_meta.get(key)
        return f"«{meta.name}»" if meta else key

    def payroll(self) -> Quantity:
        param = self.books.params.optional(PAYROLL_COEFF_PARAM)
        if param is not None:
            return param
        share = self.books.norms.get("payroll_tax_share")
        return self.tr.record(
            "payroll_coefficient",
            "Коэффициент начислений на ФОТ",
            1 + share.value,
            "коэфф.",
            f"1 + {share.key}",
            [share],
            Section.BASELINE,
        ).as_quantity()

    def labor(self) -> list[LaborLine]:
        lines: list[LaborLine] = []
        for group in self.inp.labor_groups:
            headcount = self.books.params.optional(group.headcount_param)
            salary = self.books.params.optional(group.salary_param) if group.salary_param else None
            if headcount is None or salary is None:
                self.warnings.append(
                    f"Нет численности или зарплаты группы «{group.name}» — она не входит в базу"
                )
                continue
            lines.append(LaborLine(group.key, group.name, headcount, salary))
        return lines

    def working_days(self) -> Quantity:
        days = self.books.params.optional(WORKING_DAYS_PARAM)
        if days is None:
            raise CalculationError(f"Не задан параметр {self.label(WORKING_DAYS_PARAM)}")
        return days

    def site_costs(self) -> list[SiteCost]:
        types = {item.solution_type for item in self.inp.items}
        result: list[SiteCost] = []
        for cost in self.inp.site_costs:
            if cost.solution_types and not types & set(cost.solution_types):
                continue
            try:
                value, inputs = self.books.expression(cost.formula)
            except MissingValueError as exc:
                names = ", ".join(self.label(n) for n in exc.names)
                self.warnings.append(f"Статья «{cost.name}» не посчитана: не заданы {names}")
                continue
            if value == 0:
                # A conditional line that does not apply: the WMS exists, there is no access control, etc.
                continue
            result.append(
                SiteCost(
                    cost.key,
                    cost.kind,
                    cost.name,
                    cost.formula,
                    value,
                    tuple(inputs),
                    cost.in_raas,
                    cost.note,
                )
            )
        return result

    def process_labor(self, process: ProcessDef, payroll: Quantity) -> tuple[Quantity, float]:
        groups = {group.key: group for group in self.inp.labor_groups}
        parts: list[Quantity] = []
        staff: list[tuple[Quantity, Quantity]] = []
        fte = 0.0
        for key, share in process.labor_allocation.items():
            group = groups[key]
            headcount = self.books.params.optional(group.headcount_param)
            salary = self.books.params.optional(group.salary_param) if group.salary_param else None
            if headcount is None or salary is None:
                continue
            allocation = Quantity(
                f"{process.key}.share.{key}",
                f"Доля «{group.name}» в процессе (справочник)",
                share,
                "доля",
                InputKind.PARAM,
            )
            step = self.tr.record(
                f"{process.key}.labor.{key}",
                f"ФОТ процесса: {group.name}",
                headcount.value * share * salary.value * MONTHS_PER_YEAR * payroll.value,
                "₽/год",
                f"{headcount.key} × {allocation.key} × {salary.key} × 12 × {payroll.key}",
                [headcount, allocation, salary, payroll],
                Section.BASELINE,
            )
            parts.append(step.as_quantity())
            staff.append((headcount, allocation))
            fte += headcount.value * share
        self.tr.record(
            f"{process.key}.labor_fte",
            f"Персонал процесса «{process.name}»",
            fte,
            "FTE",
            " + ".join(f"{h.key} × {a.key}" for h, a in staff) or "0",
            [q for pair in staff for q in pair],
            Section.BASELINE,
        )
        total = self.tr.record(
            f"{process.key}.labor_cost",
            f"ФОТ процесса «{process.name}»",
            sum(q.value for q in parts),
            "₽/год",
            " + ".join(q.key for q in parts) or "0",
            parts,
            Section.BASELINE,
        )
        return total.as_quantity(), fte

    def demand(self, process: ProcessDef) -> dict[str, TraceStep]:
        if not process.demand:
            raise CalculationError(
                f"У процесса «{process.name}» нет модели спроса — роботизация не считается"
            )
        ns = process.key
        scaled = self.inp.volume_factor != 1.0
        per_day = self.record_expression(
            f"{ns}.demand_per_day_base" if scaled else f"{ns}.demand_per_day",
            f"Объём в сутки: {process.name}",
            process.demand["per_day"],
            None,
            Section.DEMAND,
        )
        if scaled:
            base = per_day.as_quantity()
            volume = Quantity(
                "volume_factor",
                "Изменение объёма операций (анализ чувствительности)",
                self.inp.volume_factor,
                "доля",
                InputKind.METRIC,
            )
            per_day = self.tr.record(
                f"{ns}.demand_per_day",
                f"Объём в сутки: {process.name} с изменением объёма",
                base.value * volume.value,
                None,
                f"{base.key} × {volume.key}",
                [base, volume],
                Section.DEMAND,
            )
        hours = self.record_expression(
            f"{ns}.hours_per_day",
            "Рабочих часов в сутки",
            process.demand["hours_per_day"],
            "ч",
            Section.DEMAND,
        )
        factor = self.record_expression(
            f"{ns}.peak_factor", "Пиковый коэффициент", process.demand["peak_factor"], None, Section.DEMAND
        )
        avg = self.tr.record(
            f"{ns}.demand_avg_per_hour",
            "Средний спрос в час",
            per_day.value / hours.value,
            "ед/ч",
            f"{per_day.key} / {hours.key}",
            [per_day.as_quantity(), hours.as_quantity()],
            Section.DEMAND,
        )
        peak = self.tr.record(
            f"{ns}.demand_peak_per_hour",
            "Спрос в пиковый час",
            avg.value * factor.value,
            "ед/ч",
            f"{avg.key} × {factor.key}",
            [avg.as_quantity(), factor.as_quantity()],
            Section.DEMAND,
        )
        return {"per_day": per_day, "hours": hours, "avg": avg, "peak": peak}

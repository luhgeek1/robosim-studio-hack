from app.domain.scenario.models import ScenarioKind
from app.engine.economics.models import EconomicsInput, Line
from app.engine.trace import Quantity, Section, Tracer, TraceStep, display_formula

MONTHS_PER_YEAR = 12


def q(step: TraceStep) -> Quantity:
    return step.as_quantity()


class LineBuilder:
    """Shared helpers: every cost line is recorded in the trace with its formula and inputs."""

    def __init__(self, inp: EconomicsInput, tracer: Tracer) -> None:
        self.inp = inp
        self.tr = tracer
        self.norms = inp.norms
        self.kind = inp.kind
        self.warnings: list[str] = []

    def _sum(self, key: str, name: str, parts: list[Quantity], unit: str, section: Section) -> TraceStep:
        formula = " + ".join(q.key for q in parts) if parts else "0"
        return self.tr.record(key, name, sum(q.value for q in parts), unit, formula, parts, section)

    def _site_lines(self, kind: str, section: Section) -> list[Line]:
        lines: list[Line] = []
        for cost in self.inp.site_costs:
            if cost.kind != kind or (self.kind == ScenarioKind.RAAS and not cost.in_raas):
                continue
            step = self.tr.record(
                cost.key,
                cost.name,
                cost.amount,
                "₽" if kind == "capex" else "₽/год",
                display_formula(cost.formula),
                cost.inputs,
                section,
            )
            lines.append(Line(step, note=cost.note))
        return lines

    def _share(self, key: str, name: str, base: TraceStep, norm_key: str, section: Section) -> TraceStep:
        norm = self.norms.get(norm_key)
        unit = "₽" if section == Section.CAPEX else "₽/год"
        return self.tr.record(
            key, name, base.value * norm.value, unit, f"{base.key} × {norm.key}", [q(base), norm], section
        )

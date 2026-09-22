from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field, replace
from enum import StrEnum


class InputKind(StrEnum):
    PARAM = "param"
    NORM = "norm"
    SPEC = "spec"
    METRIC = "metric"
    SIMULATION = "simulation"


class Section(StrEnum):
    DEMAND = "demand"
    SIZING = "sizing"
    CAPEX = "capex"
    OPEX = "opex"
    BASELINE = "baseline"
    EFFECT = "effect"
    CASHFLOW = "cashflow"
    METRICS = "metrics"


@dataclass(frozen=True, slots=True)
class Quantity:
    key: str
    name: str
    value: float
    unit: str | None
    kind: InputKind


class MissingInputError(KeyError):
    def __init__(self, kind: InputKind, key: str) -> None:
        self.kind = kind
        self.key = key
        super().__init__(f"{kind}:{key}")


@dataclass(frozen=True, slots=True)
class Book:
    """Named values of one kind (norms, specs, params) that a calculation may read."""

    kind: InputKind
    items: Mapping[str, Quantity]

    @classmethod
    def of(cls, kind: InputKind, values: Iterable[tuple[str, str, float | None, str | None]]) -> "Book":
        return cls(kind, {k: Quantity(k, n, v, u, kind) for k, n, v, u in values if v is not None})

    def get(self, key: str) -> Quantity:
        if key not in self.items:
            raise MissingInputError(self.kind, key)
        return self.items[key]

    def value(self, key: str) -> float:
        return self.get(key).value

    def optional(self, key: str) -> Quantity | None:
        return self.items.get(key)


@dataclass(frozen=True, slots=True)
class TraceStep:
    key: str
    name: str
    value: float
    unit: str | None
    formula: str
    rendered: str
    inputs: tuple[Quantity, ...]
    section: Section
    depends_on: tuple[str, ...] = ()

    @property
    def norm_keys(self) -> list[str]:
        return [q.key for q in self.inputs if q.kind == InputKind.NORM]

    def as_quantity(self) -> Quantity:
        return Quantity(self.key, self.name, self.value, self.unit, InputKind.METRIC)


def fmt(value: float) -> str:
    """Russian number format for rendered formulas: 1 234 567,89."""
    rounded = round(value, 2)
    text = (
        f"{rounded:,.2f}".rstrip("0").rstrip(".") if not float(rounded).is_integer() else f"{int(rounded):,}"
    )
    return text.replace(",", " ").replace(".", ",")


def display_formula(source: str) -> str:
    return source.replace(" * ", " × ").replace("*", " × ")


def namespaced(step: TraceStep, namespace: str) -> TraceStep:
    """Moves a sub-calculation step (sizing of one process) under `namespace.` so keys stay unique."""

    def rename(key: str) -> str:
        return f"{namespace}.{key}"

    return replace(
        step,
        key=rename(step.key),
        inputs=tuple(replace(q, key=rename(q.key)) if q.kind == InputKind.METRIC else q for q in step.inputs),
        depends_on=tuple(rename(key) for key in step.depends_on),
    )


@dataclass(slots=True)
class Tracer:
    steps: list[TraceStep] = field(default_factory=list)
    render: bool = True

    def record(
        self,
        key: str,
        name: str,
        value: float,
        unit: str | None,
        formula: str,
        inputs: Iterable[Quantity],
        section: Section,
    ) -> TraceStep:
        used = tuple(inputs)
        rendered = ""
        if self.render:
            rendered = formula
            for quantity in sorted(used, key=lambda q: len(q.key), reverse=True):
                rendered = rendered.replace(quantity.key, fmt(quantity.value))
            rendered = f"{rendered} = {fmt(value)}{f' {unit}' if unit else ''}"
        step = TraceStep(
            key=key,
            name=name,
            value=value,
            unit=unit,
            formula=formula,
            rendered=rendered,
            inputs=used,
            section=section,
            depends_on=tuple(q.key for q in used if q.kind == InputKind.METRIC),
        )
        self.steps.append(step)
        return step

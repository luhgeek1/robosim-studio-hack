"""Rule-based Smart Import: maps raw records onto the canonical parameter registry.

This is the deterministic baseline provider. An LLM provider (app/ml) can replace the
*mapping* step, but `finalize()` (units, ranges, defaults) always runs in plain code.
"""

from __future__ import annotations

import re
from typing import Any

from ..data.parameters import ParamDef, registry
from ..schemas import NormalizedDocument, ParameterValue, RawRecord

_NUM = re.compile(r"[-+]?\d[\d\s]*(?:[.,]\d+)?")
_UNIT_HINT = re.compile(r"(млрд|млн|тыс\.?|мин|мм|см|м²|м2|м|кг|т|%|₽|руб|ч|лет|год|шт)", re.I)

TRUE_WORDS = ("да", "yes", "true", "есть", "имеется", "1")
FALSE_WORDS = ("нет", "no", "false", "отсутствует", "0")


def parse_number(raw: Any) -> tuple[float | None, str | None]:
    """'3200 мм' -> (3200.0, 'мм'); '2,8' -> (2.8, None); 'до 15 млн ₽' -> (15.0, 'млн')."""
    if isinstance(raw, bool):
        return (1.0 if raw else 0.0), None
    if isinstance(raw, (int, float)):
        return float(raw), None
    s = str(raw).strip()
    if not s:
        return None, None
    m = _NUM.search(s.replace(" ", " "))
    if not m:
        return None, None
    num = float(m.group(0).replace(" ", "").replace(",", "."))
    tail = s[m.end():]
    u = _UNIT_HINT.search(tail)
    return num, (u.group(1).lower() if u else None)


def convert_unit(value: float, unit: str | None, target: str) -> tuple[float, bool]:
    """Bring value to the registry unit. Returns (value, converted?)."""
    if unit is None:
        return value, False
    u = unit.lower().replace(" ", "")
    t = target.lower()
    if t == "м":
        if u == "мм":
            return value / 1000, True
        if u == "см":
            return value / 100, True
    if t == "кг" and u == "т":
        return value * 1000, True
    if t.startswith("млн"):
        if u in ("тыс", "тыс."):
            return value / 1000, True
        if u in ("₽", "руб") and value > 100000:
            return value / 1e6, True
        if u == "млрд":
            return value * 1000, True
    if t.startswith("₽") and u in ("тыс", "тыс."):
        return value * 1000, True
    return value, False


def _match(field: str, defs: list[ParamDef]) -> tuple[ParamDef | None, float]:
    f = field.lower().strip()
    f_key = f.split(".")[-1]
    best: tuple[ParamDef | None, float, int] = (None, 0.0, 0)
    for d in defs:
        if f_key == d.key or f == d.key:
            return d, 0.99
        if f == d.label.lower():
            return d, 0.97
        for a in d.aliases:
            if a in f and len(a) > best[2]:
                best = (d, 0.9 if len(a) >= 6 else 0.8, len(a))
    return best[0], best[1]


def coerce(d: ParamDef, raw: Any, unit: str | None) -> tuple[Any, float, str]:
    """Return (value, confidence multiplier, note)."""
    if d.kind == "bool":
        s = str(raw).strip().lower()
        if any(s.startswith(w) for w in TRUE_WORDS):
            return True, 1.0, ""
        if any(s.startswith(w) for w in FALSE_WORDS):
            return False, 1.0, ""
        return bool(raw), 0.7, "распознано как логическое значение"
    if d.kind == "text":
        return (str(raw).strip() if raw is not None else None), 1.0, ""
    num, inline_unit = parse_number(raw)
    if num is None:
        return None, 0.0, "не удалось извлечь число"
    v, converted = convert_unit(num, inline_unit or unit, d.unit)
    if d.unit == "%" and v <= 1.0 and d.max and d.max > 1:
        v, converted = v * 100, True
    return v, (0.95 if converted else 1.0), ("единицы приведены к " + d.unit if converted else "")


class RuleBasedImportProvider:
    name = "rules"

    def normalize(self, records: list[RawRecord], object_type: str) -> NormalizedDocument:
        defs = registry(object_type)
        mapped: dict[str, ParameterValue] = {}
        unmapped: list[RawRecord] = []
        for r in records:
            d, conf = _match(r.field, defs)
            if d is None or (d.key in mapped and mapped[d.key].confidence >= conf):
                if d is None:
                    unmapped.append(r)
                continue
            value, mult, note = coerce(d, r.value, r.unit)
            if value is None:
                unmapped.append(r)
                continue
            mapped[d.key] = ParameterValue(
                key=d.key, label=d.label, group=d.group, value=value, unit=d.unit, source="confirmed",
                source_value=f"{r.field}: {r.value}{(' ' + r.unit) if r.unit else ''}", confidence=round(conf * mult, 2),
                note=note, kind=d.kind, min=d.min, max=d.max, required=d.required,
            )
        return finalize(mapped, unmapped, object_type)


def finalize(mapped: dict[str, ParameterValue], unmapped: list[RawRecord], object_type: str) -> NormalizedDocument:
    """Deterministic post-processing: defaults as assumptions, ranges, counts."""
    defs = registry(object_type)
    params: list[ParameterValue] = []
    warnings: list[str] = []
    for d in defs:
        p = mapped.get(d.key)
        if p is None:
            if d.default is None:
                p = ParameterValue(key=d.key, label=d.label, group=d.group, value=None, unit=d.unit, source="missing", confidence=0.0, kind=d.kind, min=d.min, max=d.max, required=d.required, note="нет в исходных данных")
            else:
                p = ParameterValue(key=d.key, label=d.label, group=d.group, value=d.default, unit=d.unit, source="assumption", confidence=0.6, kind=d.kind, min=d.min, max=d.max, required=d.required, note=d.note or "типовое значение для объектов этого класса")
        if p.kind == "number" and isinstance(p.value, (int, float)) and p.min is not None and p.max is not None:
            if p.value < p.min or p.value > p.max:
                p.out_of_range = True
                p.confidence = min(p.confidence, 0.5)
                warnings.append(f"{p.label}: значение {p.value} {p.unit} вне типового диапазона {p.min}–{p.max}")
        params.append(p)
    recognized = sum(1 for p in params if p.source == "confirmed")
    return NormalizedDocument(object_type=object_type, parameters=params, unmapped=unmapped, recognized=recognized, total=len(params), warnings=warnings)

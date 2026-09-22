_ALIASES = {
    "m": "м",
    "mm": "мм",
    "cm": "см",
    "km": "км",
    "kg": "кг",
    "t": "т",
    "h": "ч",
    "min": "мин",
    "s": "с",
    "m2": "м²",
    "м2": "м²",
    "кв.м": "м²",
    "kw": "кВт",
    "руб": "₽",
    "руб.": "₽",
    "rub": "₽",
}

# Exact unit arithmetic (not norms): factor to multiply a value in the first unit to get the second.
_FACTORS: dict[tuple[str, str], float] = {
    ("мм", "м"): 1e-3,
    ("см", "м"): 1e-2,
    ("км", "м"): 1e3,
    ("м", "мм"): 1e3,
    ("см", "мм"): 10.0,
    ("т", "кг"): 1e3,
    ("кг", "т"): 1e-3,
    ("мин", "ч"): 1 / 60,
    ("ч", "мин"): 60.0,
    ("с", "мин"): 1 / 60,
    ("мин", "с"): 60.0,
    ("доля", "%"): 100.0,
    ("%", "доля"): 1e-2,
    ("млн ₽", "₽"): 1e6,
    ("тыс. ₽", "₽"): 1e3,
}


class UnitMismatchError(ValueError):
    pass


def normalize_unit(unit: str | None) -> str | None:
    if unit is None:
        return None
    cleaned = unit.strip()
    return _ALIASES.get(cleaned.lower(), cleaned) or None


def convert(value: float, from_unit: str | None, to_unit: str | None) -> float:
    source, target = normalize_unit(from_unit), normalize_unit(to_unit)
    if source is None or target is None or source == target:
        return value
    factor = _FACTORS.get((source, target))
    if factor is None:
        raise UnitMismatchError(f"Нельзя перевести «{source}» в «{target}»")
    return value * factor

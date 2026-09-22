import re
from typing import Any

_NUMBER = re.compile(r"[-+−]?\d+(?:[.,]\d+)?")
_DIMENSIONS = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*[x×х*]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×х*]\s*(\d+(?:[.,]\d+)?))?", re.I
)
_YES = {"да", "есть", "yes", "true"}
_NO = {"нет", "no", "false", "отсутствует"}


def _to_float(text: str) -> float:
    return float(text.replace("−", "-").replace(",", "."))


def parse_ru_money(text: str | float | int | None) -> float | None:
    """``"2 700 000,00"`` → 2700000.0 (thin and non-breaking spaces as thousands separators)."""
    if text is None:
        return None
    if isinstance(text, int | float):
        return float(text)
    cleaned = re.sub(r"[\s  ]", "", text).replace(",", ".")
    return float(cleaned) if cleaned else None


def first_number(text: str) -> float | None:
    match = _NUMBER.search(text.replace(" ", " "))
    return _to_float(match.group()) if match else None


def parse_dimensions(text: str) -> tuple[float, float, float | None] | None:
    match = _DIMENSIONS.search(text)
    if not match:
        return None
    length, width, height = match.groups()
    return _to_float(length), _to_float(width), _to_float(height) if height else None


def parse_range(text: str) -> tuple[float | None, float | None]:
    """``"+5…+25"``, ``"-40…+50"``, ``"до +45"``, ``"от −25"`` → (min, max)."""
    numbers = [_to_float(n) for n in _NUMBER.findall(text.replace(" ", " "))]
    lowered = text.lower()
    if len(numbers) >= 2:
        return min(numbers[0], numbers[1]), max(numbers[0], numbers[1])
    if len(numbers) == 1:
        return (None, numbers[0]) if lowered.lstrip().startswith("до") else (numbers[0], None)
    return None, None


def parse_scalar(value: Any) -> Any:
    """Dataset cell → number, bool or trimmed string; ``"-"`` and empty → ``None``."""
    if value is None or isinstance(value, bool | int | float):
        return value
    text = str(value).strip()
    if text in {"", "-", "—", "–"}:
        return None
    word = text.split()[0].strip(".,;()").lower()
    if word in _YES:
        return True
    if word in _NO:
        return False
    try:
        return _to_float(text.replace(" ", ""))
    except ValueError:
        return text

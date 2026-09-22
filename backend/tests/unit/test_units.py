import pytest

from app.domain.common.units import UnitMismatchError, convert


def test_conversions() -> None:
    assert convert(2800, "мм", "м") == pytest.approx(2.8)
    assert convert(2.8, "m", "м") == 2.8
    assert convert(1.5, "т", "кг") == 1500
    assert convert(30, "%", "доля") == pytest.approx(0.3)
    assert convert(80, "млн ₽", "₽") == 80_000_000
    assert convert(5, None, "м") == 5


def test_incompatible_units_raise() -> None:
    with pytest.raises(UnitMismatchError):
        convert(1, "кг", "м")

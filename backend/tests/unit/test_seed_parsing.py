import pytest

from app.core.parsing import first_number, parse_dimensions, parse_range, parse_ru_money, parse_scalar
from app.seeds.catalog_sources import _remap


def test_money_with_spaces_and_comma() -> None:
    assert parse_ru_money("2 700 000,00") == 2_700_000.0
    assert parse_ru_money("950 000,00") == 950_000.0
    assert parse_ru_money(None) is None


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("1044x654x380", (1044.0, 654.0, 380.0)),
        ("1200×800×1600", (1200.0, 800.0, 1600.0)),
        ("800 x 600", (800.0, 600.0, None)),
    ],
)
def test_dimensions(text: str, expected: tuple[float, float, float | None]) -> None:
    assert parse_dimensions(text) == expected


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("+5…+25", (5.0, 25.0)),
        ("-40…+50", (-40.0, 50.0)),
        ("до +45", (None, 45.0)),
        ("от −25", (-25.0, None)),
    ],
)
def test_temperature_range(text: str, expected: tuple[float | None, float | None]) -> None:
    assert parse_range(text) == expected


def test_scalar_cells() -> None:
    assert parse_scalar("Да ") is True
    assert parse_scalar("-") is None
    assert parse_scalar("1,5") == 1.5
    assert parse_scalar("24/7/365") == "24/7/365"


def test_first_number_in_text() -> None:
    assert first_number("до 10 часов") == 10.0


def test_research_keys_are_remapped_by_unit() -> None:
    assert _remap("payload_kg", 5000, "kg (буксируемая масса)") == ("towing_capacity_kg", 5000.0)
    assert _remap("lift_height_mm", 12500, "mm (мачта сканирования, до)") == ("max_scan_height_m", 12.5)
    assert _remap("lift_height_mm", 1600, "mm") == ("lift_height_mm", 1600)
    assert _remap("runtime_h", "запас хода до 200 км", "km") == ("range_km", 200.0)

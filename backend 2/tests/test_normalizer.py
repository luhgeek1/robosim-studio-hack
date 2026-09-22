from app.schemas import RawRecord
from app.services.normalizer import RuleBasedImportProvider, parse_number


def test_parse_number_with_units():
    assert parse_number("3200 мм") == (3200.0, "мм")
    assert parse_number("2,8") == (2.8, None)
    assert parse_number("до 15 млн ₽") == (15.0, "млн")
    assert parse_number(None) == (None, None)


def test_aisle_width_converted_from_mm():
    doc = RuleBasedImportProvider().normalize([RawRecord(field="рабочий коридор", value="3200 мм")], "warehouse")
    p = {x.key: x for x in doc.parameters}["aisle_width_m"]
    assert p.value == 3.2 and p.source == "confirmed" and p.source_value.startswith("рабочий коридор")
    assert 0.8 <= p.confidence <= 0.95


def test_defaults_are_assumptions_and_missing_are_missing():
    doc = RuleBasedImportProvider().normalize([], "warehouse")
    by = {x.key: x for x in doc.parameters}
    assert by["area_m2"].source == "assumption"
    assert by["wms_api_version"].source == "missing"
    assert doc.recognized == 0


def test_out_of_range_is_flagged():
    doc = RuleBasedImportProvider().normalize([RawRecord(field="ширина рабочих проходов", value="40 м")], "warehouse")
    p = {x.key: x for x in doc.parameters}["aisle_width_m"]
    assert p.out_of_range and doc.warnings

import csv
import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

import yaml

from app.core.parsing import first_number, parse_dimensions, parse_range, parse_ru_money
from app.domain.common.provenance import ProvenanceStatus, SourceKind
from app.seeds.schemas import SpecKeySeed
from app.seeds.sources import SourceSpec, url_source

CATALOG_FILE = "case/dataset/catalog_export_v4.csv"
SPECS_FILE = "research/catalog_specs/warehouse_specs.yaml"

CATALOG_SOURCE = SourceSpec(
    key="catalog:catalog_export_v4",
    kind=SourceKind.ORGANIZER_CATALOG,
    title="catalog_export_v4.csv — каталог организатора",
    retrieved_at=date(2026, 9, 15),
    note="Цена изделия с НДС; без доставки, ПНР и интеграции (Доп. 6)",
)

_RESEARCH_STATUS = {
    "confirmed": ProvenanceStatus.CONFIRMED,
    "claim": ProvenanceStatus.VENDOR_CLAIM,
    "inferred": ProvenanceStatus.ASSUMPTION,
}
_STATUS_ALIASES = {"operation": "operation", "piloting": "piloting", "rnd": "rnd"}


@dataclass(slots=True)
class CatalogRow:
    row: int
    fields: dict[str, str]

    def get(self, name: str) -> str | None:
        value = (self.fields.get(name) or "").replace("\r\n", "\n").strip()
        return value or None


@dataclass(slots=True)
class SpecRecord:
    key: str
    value: Any
    value_num: float | None
    unit: str | None
    status: ProvenanceStatus
    source: SourceSpec | None
    raw_value: str | None
    note: str | None


@dataclass(slots=True)
class ResearchProduct:
    name: str
    vendor_url: str | None
    specs: list[SpecRecord] = field(default_factory=list)
    cases: list[dict[str, Any]] = field(default_factory=list)
    in_registry: bool = False


def read_catalog(data_root: Path) -> dict[str, list[CatalogRow]]:
    """Product id → its CSV rows (duplicates are separate offers, Q&A)."""
    grouped: dict[str, list[CatalogRow]] = {}
    with (data_root / CATALOG_FILE).open(encoding="utf-8-sig", newline="") as handle:
        for index, fields in enumerate(csv.DictReader(handle, delimiter=";"), start=2):
            row = CatalogRow(row=index, fields=fields)
            grouped.setdefault(row.get("id") or "", []).append(row)
    grouped.pop("", None)
    return grouped


def catalog_status(raw: str | None) -> str:
    return _STATUS_ALIASES.get((raw or "").strip().lower(), "rnd")


def catalog_price(row: CatalogRow) -> float:
    return parse_ru_money(row.get("Цена изделия")) or 0.0


def _source_for(raw: str | None, retrieved: Any, vendor_domain: str | None) -> SourceSpec | None:
    if not raw:
        return None
    retrieved_at = retrieved if isinstance(retrieved, date) else None
    if raw.startswith("http"):
        return url_source(raw, retrieved_at, vendor_domain=vendor_domain)
    kind = SourceKind.ORGANIZER_DATASET if "организатор" in raw.lower() else SourceKind.OPEN_SOURCE
    return SourceSpec(key=f"text:{raw[:200]}", kind=kind, title=raw[:500], retrieved_at=retrieved_at)


_MM_PER_M = 1000

# Research rows sometimes store a value under a neighbouring key; the unit text tells which one is meant.
_REMAPS: list[tuple[str, tuple[str, ...], str, float]] = [
    ("payload_kg", ("букс",), "towing_capacity_kg", 1.0),
    ("runtime_h", ("km", "км"), "range_km", 1.0),
    ("lift_height_mm", ("мачта",), "max_scan_height_m", 1 / _MM_PER_M),
    ("lift_height_mm", ("высота шахт", "высота системы"), "max_storage_height_m", 1 / _MM_PER_M),
]


def _remap(key: str, value: Any, unit: str) -> tuple[str, Any]:
    text = f"{unit} {value}".lower()
    for source_key, markers, target_key, factor in _REMAPS:
        if key == source_key and any(marker in text for marker in markers):
            number = value if isinstance(value, int | float) else first_number(str(value))
            return target_key, None if number is None else round(number * factor, 3)
    return key, value


def _spec_records(
    key: str, entry: dict[str, Any], keys: dict[str, SpecKeySeed], vendor: str | None
) -> list[SpecRecord]:
    status = _RESEARCH_STATUS.get(str(entry.get("status")))
    value = entry.get("value")
    if status is None or value is None:
        return []
    source = _source_for(entry.get("source"), entry.get("retrieved"), vendor)
    raw = f"{value} {entry.get('unit') or ''}".strip()
    key, value = _remap(key, value, str(entry.get("unit") or ""))
    if value is None:
        return []
    note = entry.get("note")

    def record(spec_key: str, spec_value: Any) -> SpecRecord:
        spec = keys[spec_key]
        number = (
            spec_value if isinstance(spec_value, int | float) and not isinstance(spec_value, bool) else None
        )
        if spec.value_type == "number" and number is None and isinstance(spec_value, str):
            number = first_number(spec_value)
        stored = number if spec.value_type == "number" else spec_value
        return SpecRecord(spec_key, stored, number, spec.unit, status, source, raw, note)

    records = [record(key, value)] if key in keys else []
    if key == "dimensions_mm" and isinstance(value, str) and (dims := parse_dimensions(value)):
        records += [
            record(k, v) for k, v in zip(("length_mm", "width_mm", "height_mm"), dims, strict=True) if v
        ]
    if key == "operating_temp_c" and isinstance(value, str):
        low, high = parse_range(value)
        records += [
            record(k, v)
            for k, v in (("operating_temp_min_c", low), ("operating_temp_max_c", high))
            if v is not None
        ]
    return [r for r in records if r.key in keys and r.value is not None]


_CLAIM_UNITS: list[tuple[str, str]] = [
    ("отборов/ч на станцию", "station_throughput_lines_h"),
    ("м²/ч", "coverage_m2_h"),
    ("паллет/ч", "vendor_throughput_per_hour"),
]
_REAL_CONDITIONS = "реальн"


def _claim_key(claim: dict[str, Any]) -> str | None:
    unit = str(claim.get("unit") or "")
    for marker, key in _CLAIM_UNITS:
        if unit == marker:
            real = _REAL_CONDITIONS in str(claim.get("conditions") or "").lower()
            return "coverage_real_m2_h" if key == "coverage_m2_h" and real else key
    return None


def _claim_number(text: str, unit: str) -> float | None:
    """The number written right before the unit wins: «0,5 м²/с (≈1800 м²/ч)» → 1800."""
    match = re.search(r"(\d[\d\s]*(?:[.,]\d+)?)\s*" + re.escape(unit), text)
    if match:
        return first_number(match.group(1).replace(" ", ""))
    return first_number(text)


def _claim_records(
    claims: list[dict[str, Any]], keys: dict[str, SpecKeySeed], vendor: str | None
) -> list[SpecRecord]:
    """Throughput claims → specs; a range keeps its lower bound (conservative), the text is the raw value."""
    records: list[SpecRecord] = []
    for claim in claims:
        key = _claim_key(claim)
        number = _claim_number(str(claim.get("value") or ""), str(claim.get("unit") or ""))
        status = _RESEARCH_STATUS.get(str(claim.get("status")))
        if key is None or key not in keys or number is None or status is None:
            continue
        if any(record.key == key for record in records):
            continue
        records.append(
            SpecRecord(
                key=key,
                value=number,
                value_num=number,
                unit=keys[key].unit,
                status=status,
                source=_source_for(claim.get("source"), None, vendor),
                raw_value=f"{claim.get('value')} {claim.get('unit')}",
                note=claim.get("conditions"),
            )
        )
    return records


def read_research_specs(data_root: Path, keys: dict[str, SpecKeySeed]) -> dict[str, ResearchProduct]:
    with (data_root / SPECS_FILE).open(encoding="utf-8") as handle:
        items: list[dict[str, Any]] = yaml.safe_load(handle)
    products: dict[str, ResearchProduct] = {}
    for item in items:
        vendor_url = item.get("vendor_url")
        vendor_domain = vendor_url.split("/")[2].removeprefix("www.") if vendor_url else None
        product = ResearchProduct(name=item["product"], vendor_url=vendor_url)
        for key, entry in (item.get("specs") or {}).items():
            product.specs += _spec_records(key, entry or {}, keys, vendor_domain)
        present = {record.key for record in product.specs}
        claims = _claim_records(item.get("throughput_claims") or [], keys, vendor_domain)
        product.specs += [record for record in claims if record.key not in present]
        for ref in item.get("references") or []:
            product.cases.append({**ref, "source_spec": _source_for(ref.get("source"), None, vendor_domain)})
        registry = item.get("registry_minpromtorg") or {}
        product.in_registry = bool(registry.get("value")) and registry.get("status") in {"confirmed", "claim"}
        products[product.name] = product
    return products

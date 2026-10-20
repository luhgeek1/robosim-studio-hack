from dataclasses import dataclass, field
from enum import StrEnum

from app.domain.common.provenance import Scalar


class ImportSourceKind(StrEnum):
    XLSX_TEMPLATE = "xlsx_template"
    XLSX_FREEFORM = "xlsx_freeform"
    CSV = "csv"
    JSON = "json"


@dataclass(frozen=True, slots=True)
class MappedValue:
    key: str
    value: Scalar
    unit: str | None
    raw_field: str | None
    raw_value: str | None
    confidence: float


@dataclass(frozen=True, slots=True)
class UnmappedField:
    raw_field: str
    raw_value: str
    suggestion_key: str | None = None


@dataclass(frozen=True, slots=True)
class ImportRow:
    key: str | None
    raw_field: str
    raw_value: str
    unit: str | None
    location: str
    confidence: float
    suggestion_key: str | None = None


@dataclass(frozen=True, slots=True)
class ParsedImport:
    source_kind: ImportSourceKind
    mapped: list[MappedValue] = field(default_factory=list)
    unmapped: list[UnmappedField] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    rows: list[ImportRow] = field(default_factory=list)
    object_type: str | None = None


class ImportFormatError(ValueError):
    pass

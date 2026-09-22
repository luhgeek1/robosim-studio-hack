from dataclasses import dataclass
from datetime import date
from enum import StrEnum
from uuid import UUID


class ProvenanceStatus(StrEnum):
    USER = "user"
    IMPORTED = "imported"
    LLM_SUGGESTED = "llm_suggested"
    DEFAULT = "default"
    ASSUMPTION = "assumption"
    DERIVED = "derived"
    CONFIRMED = "confirmed"
    VENDOR_CLAIM = "vendor_claim"
    MISSING = "missing"


class SourceKind(StrEnum):
    ORGANIZER_DATASET = "organizer_dataset"
    ORGANIZER_CATALOG = "organizer_catalog"
    FCBAS_SCENARIO = "fcbas_scenario"
    VENDOR_SITE = "vendor_site"
    OPEN_SOURCE = "open_source"
    REGULATION = "regulation"
    TEAM_ASSUMPTION = "team_assumption"
    USER_INPUT = "user_input"
    LLM_EXTRACTED = "llm_extracted"
    SIMULATION = "simulation"


@dataclass(frozen=True, slots=True)
class SourceInfo:
    id: UUID
    kind: SourceKind
    title: str
    url: str | None
    retrieved_at: date | None
    note: str | None


@dataclass(frozen=True, slots=True)
class Provenance:
    status: ProvenanceStatus
    source: SourceInfo | None = None
    confidence: float | None = None
    raw_value: str | None = None
    note: str | None = None


Scalar = float | int | str | bool | None


@dataclass(frozen=True, slots=True)
class PValue:
    value: Scalar
    unit: str | None
    provenance: Provenance

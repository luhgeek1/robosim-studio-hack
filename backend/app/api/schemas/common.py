from datetime import date, datetime
from uuid import UUID

from pydantic import Field

from app.api.schemas.base import ApiModel
from app.domain.common.provenance import Provenance as ProvenanceInfo
from app.domain.common.provenance import ProvenanceStatus, SourceInfo, SourceKind
from app.domain.common.provenance import PValue as PValueInfo

Scalar = float | int | str | bool | None


class Source(ApiModel):
    id: UUID
    kind: SourceKind
    title: str = Field(examples=["Датасеты_хакатон.xlsx, лист «Легенда»"])
    url: str | None = None
    retrieved_at: date | None = None
    note: str | None = None

    @classmethod
    def from_domain(cls, source: SourceInfo) -> "Source":
        return cls.model_validate(source)


class Provenance(ApiModel):
    status: ProvenanceStatus
    source: Source | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    raw_value: str | None = None
    note: str | None = None
    changed_by: str | None = None
    changed_at: datetime | None = None

    @classmethod
    def from_domain(cls, provenance: ProvenanceInfo) -> "Provenance":
        return cls(
            status=provenance.status,
            source=Source.from_domain(provenance.source) if provenance.source else None,
            confidence=provenance.confidence,
            raw_value=provenance.raw_value,
            note=provenance.note,
        )


class PValue(ApiModel):
    value: Scalar
    unit: str | None = None
    provenance: Provenance

    @classmethod
    def from_domain(cls, value: PValueInfo) -> "PValue":
        return cls(value=value.value, unit=value.unit, provenance=Provenance.from_domain(value.provenance))


class Money(ApiModel):
    amount_rub: float = Field(description="Сумма в рублях (не в млн)")
    vat_included: bool = True

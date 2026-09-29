from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.api.schemas.admin import SourceWrite
from app.api.schemas.base import ApiModel
from app.api.schemas.reference import ParameterDef
from app.domain.admin import DefaultChange, DefaultView, Freshness, SourceEdit, SourceEntry
from app.domain.common.provenance import ProvenanceStatus, SourceKind


class AdminParameterDefault(ParameterDef):
    object_type: str
    group_name: str
    applies_to_blank: bool = Field(
        description="false — данные демо-объекта организатора: пустой проект обязательное поле не заполняет"
    )
    projects_total: int
    projects_using_default: int

    @classmethod
    def from_view(cls, view: DefaultView) -> "AdminParameterDefault":
        base = ParameterDef.from_domain(view.definition)
        if base.default is not None and view.changed_by is not None:
            base.default.provenance.changed_by = view.changed_by
            base.default.provenance.changed_at = view.changed_at
        return cls(
            **base.model_dump(exclude={"default"}),
            default=base.default,
            object_type=view.object_type,
            group_name=view.group_name,
            applies_to_blank=view.applies_to_blank,
            projects_total=view.projects_total,
            projects_using_default=view.projects_using_default,
        )


class ParameterDefaultList(ApiModel):
    object_type: str
    items: list[AdminParameterDefault]


class ParameterDefaultWrite(ApiModel):
    value: bool | int | float | str
    unit: str | None = None
    status: Literal["default", "assumption"] | None = Field(
        default=None, description="Без значения — прежний статус (у параметра без умолчания — assumption)"
    )
    source: SourceWrite
    rationale: str = Field(min_length=1, max_length=2000)

    def to_domain(self) -> DefaultChange:
        return DefaultChange(
            value=self.value,
            unit=self.unit,
            status=ProvenanceStatus(self.status) if self.status else None,
            source=self.source.to_domain(),
            rationale=self.rationale.strip(),
        )


class ParameterDefaultResult(ApiModel):
    parameter: AdminParameterDefault
    projects_restamped: int = Field(description="Проектов с новой версией: их сохранённые расчёты устарели")


class SourceUsage(ApiModel):
    specs: int
    offers: int
    cases: int
    norms: int
    parameters: int
    total: int


class RegistrySource(ApiModel):
    id: UUID
    kind: SourceKind
    title: str
    url: str | None = None
    retrieved_at: date | None = None
    note: str | None = None
    freshness: Freshness
    usage: SourceUsage

    @classmethod
    def from_domain(cls, entry: SourceEntry) -> "RegistrySource":
        usage = entry.usage
        return cls(
            id=entry.id,
            kind=entry.kind,
            title=entry.title,
            url=entry.url,
            retrieved_at=entry.retrieved_at,
            note=entry.note,
            freshness=entry.freshness,
            usage=SourceUsage(
                specs=usage.specs,
                offers=usage.offers,
                cases=usage.cases,
                norms=usage.norms,
                parameters=usage.parameters,
                total=usage.total,
            ),
        )


class SourceList(ApiModel):
    items: list[RegistrySource]
    page: int
    page_size: int
    total: int
    stale_after_months: int = Field(description="Порог устаревания — норматив source_stale_after_months")
    stale_before: date = Field(description="Источник, полученный раньше этой даты, устарел")
    freshness_counts: dict[Freshness, int]


class SourceUpdate(ApiModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    url: str | None = Field(default=None, max_length=2000)
    retrieved_at: date | None = None
    note: str | None = Field(default=None, max_length=2000)

    def to_domain(self) -> SourceEdit:
        return SourceEdit(
            title=self.title.strip() if self.title else None,
            url=self.url.strip() if self.url and self.url.strip() else None,
            retrieved_at=self.retrieved_at,
            note=self.note.strip() if self.note and self.note.strip() else None,
            fields=frozenset(self.model_fields_set),
        )

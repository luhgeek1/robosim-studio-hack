from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.api.schemas.base import ApiModel
from app.api.schemas.common import Provenance, Scalar
from app.api.schemas.reference import ParameterDef
from app.domain.project.models import (
    AuditEntry,
    DataQualityItem as DataQualityItemInfo,
    DataQualitySummary as DataQualitySummaryInfo,
    EffectiveParam,
    InitMode,
    ParamHistoryEntry,
    ProjectInfo,
    ProjectStatus,
    ValidationReport as ValidationReportInfo,
)
from app.domain.reference import ObjectTypeKey


class DataQualitySummary(ApiModel):
    score: float = Field(ge=0, le=1)
    counts: dict[str, int]

    @classmethod
    def from_domain(cls, item: DataQualitySummaryInfo) -> "DataQualitySummary":
        return cls(score=item.score, counts=item.counts)


class HeadlineMetrics(ApiModel):
    payback_years: float | None = None
    capex_rub: float | None = None
    effect_rub_year: float | None = None
    verdict: str | None = None


class Project(ApiModel):
    id: UUID
    name: str = Field(examples=["РЦ Подмосковье, 20 000 м²"])
    object_type: ObjectTypeKey
    status: ProjectStatus
    version: int
    owner_id: UUID
    organization_id: UUID | None = None
    organization: str | None = None
    notes: str | None = None
    tags: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    data_quality: DataQualitySummary
    scenarios_count: int
    last_calculation_id: UUID | None = None
    recommended_scenario_id: UUID | None = None
    headline_metrics: HeadlineMetrics | None = None
    is_demo: bool = False

    @classmethod
    def from_domain(cls, item: ProjectInfo) -> "Project":
        return cls(
            id=item.id,
            name=item.name,
            object_type=ObjectTypeKey(item.object_type),
            status=item.status,
            version=item.version,
            owner_id=item.owner_id,
            organization_id=item.organization_id,
            organization=item.organization,
            notes=item.notes,
            tags=item.tags,
            created_at=item.created_at,
            updated_at=item.updated_at,
            data_quality=DataQualitySummary.from_domain(item.data_quality),
            scenarios_count=item.scenarios_count,
            last_calculation_id=item.last_calculation_id,
            recommended_scenario_id=item.recommended_scenario_id,
            headline_metrics=HeadlineMetrics(**item.headline_metrics) if item.headline_metrics else None,
            is_demo=item.is_demo,
        )


class ProjectList(ApiModel):
    items: list[Project]
    page: int
    page_size: int
    total: int


class ProjectInit(ApiModel):
    mode: InitMode = InitMode.BLANK
    demo_key: str | None = Field(default=None, examples=["warehouse_demo_01"])
    source_project_id: UUID | None = None


class ProjectCreate(ApiModel):
    name: str = Field(min_length=1, max_length=200)
    object_type: ObjectTypeKey
    init: ProjectInit | None = None
    organization_id: UUID | None = None
    notes: str | None = None
    tags: list[str] = Field(default_factory=list)


class ProjectUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    notes: str | None = None
    tags: list[str] | None = None
    status: Literal["draft", "ready", "archived"] | None = None
    organization_id: UUID | None = None


class ProjectCopy(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)


class ParamValidation(ApiModel):
    status: Literal["ok", "warning", "error", "missing"]
    code: str | None = None
    message: str | None = None
    how_to_fix: str | None = None


class ProjectParam(ApiModel):
    key: str
    name: str
    group: str
    value: Scalar
    unit: str | None = None
    provenance: Provenance
    validation: ParamValidation
    definition: ParameterDef | None = None
    history_count: int = 0
    sensitivity_rank: int | None = None

    @classmethod
    def from_domain(cls, item: EffectiveParam) -> "ProjectParam":
        check = item.validation
        return cls(
            key=item.key,
            name=item.definition.name,
            group=item.definition.group,
            value=item.value,
            unit=item.unit,
            provenance=Provenance.from_domain(item.provenance),
            validation=ParamValidation(
                status=check.status.value, code=check.code, message=check.message, how_to_fix=check.how_to_fix
            ),
            definition=ParameterDef.from_domain(item.definition),
            history_count=item.history_count,
        )


class ProjectParams(ApiModel):
    project_id: UUID
    project_version: int
    params: list[ProjectParam]
    data_quality: DataQualitySummary | None = None


class ParamUpsert(ApiModel):
    key: str
    value: Scalar
    unit: str | None = Field(
        default=None, description="Если отличается от базовой единицы — бэкенд конвертирует"
    )
    note: str | None = Field(default=None, description="Комментарий к правке, попадает в историю")


class ParamValueUpdate(ApiModel):
    key: str | None = None
    value: Scalar
    unit: str | None = None
    note: str | None = None


class ParamsBulkUpsert(ApiModel):
    params: list[ParamUpsert] = Field(min_length=1)


class ParamHistoryItem(ApiModel):
    changed_at: datetime
    changed_by: str
    old_value: Scalar
    new_value: Scalar
    status: str
    note: str | None = None

    @classmethod
    def from_domain(cls, item: ParamHistoryEntry) -> "ParamHistoryItem":
        return cls.model_validate(item)


class ParamHistoryList(ApiModel):
    items: list[ParamHistoryItem]


class ValidationIssue(ApiModel):
    key: str
    name: str | None = None
    severity: Literal["error", "warning", "info"]
    code: str
    message: str
    how_to_fix: str | None = None
    blocks: list[Literal["matching", "calculation", "simulation", "report"]] = Field(default_factory=list)


class ValidationReport(ApiModel):
    status: Literal["ok", "warnings", "errors"]
    issues: list[ValidationIssue]
    can_match: bool
    can_calculate: bool
    can_simulate: bool

    @classmethod
    def from_domain(cls, item: ValidationReportInfo) -> "ValidationReport":
        return cls(
            status=item.status,
            issues=[
                ValidationIssue(
                    key=i.key,
                    name=i.name,
                    severity=i.severity.value,
                    code=i.code,
                    message=i.message,
                    how_to_fix=i.how_to_fix,
                    blocks=[b.value for b in i.blocks],
                )
                for i in item.issues
            ],
            can_match=item.can_match,
            can_calculate=item.can_calculate,
            can_simulate=item.can_simulate,
        )


class DataQualityItem(ApiModel):
    key: str
    name: str
    status: str
    impact: Literal["high", "medium", "low", "unknown"]
    source_title: str | None = None

    @classmethod
    def from_domain(cls, item: DataQualityItemInfo) -> "DataQualityItem":
        return cls.model_validate(item)


class DataQualityReport(ApiModel):
    summary: DataQualitySummary
    items: list[DataQualityItem]


class AuditEvent(ApiModel):
    id: UUID
    at: datetime
    actor: str
    entity: str
    action: str
    before: dict[str, Any] | None = None
    after: dict[str, Any] | None = None
    note: str | None = None

    @classmethod
    def from_domain(cls, item: AuditEntry) -> "AuditEvent":
        return cls.model_validate(item)


class AuditList(ApiModel):
    items: list[AuditEvent]
    page: int
    page_size: int
    total: int


class ImportConflict(ApiModel):
    current_value: Scalar = None
    current_status: str | None = None


class ImportMappedItem(ApiModel):
    key: str
    name: str
    value: Scalar
    unit: str | None = None
    raw_field: str | None = None
    raw_value: str | None = None
    status: str
    confidence: float = Field(ge=0, le=1)
    conflict_with_current: ImportConflict | None = None


class ImportUnmapped(ApiModel):
    raw_field: str
    raw_value: str
    suggestion_key: str | None = None


class ImportResult(ApiModel):
    import_id: UUID
    source_kind: Literal["xlsx_template", "xlsx_freeform", "csv", "json", "text_llm", "pdf_llm"]
    provider: str = Field(description="rules — детерминированный разбор шаблона; gemini — ассистент")
    mapped: list[ImportMappedItem]
    unmapped: list[ImportUnmapped]
    warnings: list[str]
    applied: bool


class ImportApply(ApiModel):
    accept_keys: list[str] = Field(default_factory=list, description="Если пусто — применить все mapped")
    overwrite_user_values: bool = False


class SmartImportRequest(ApiModel):
    text: str = Field(max_length=20000)

from uuid import UUID

from pydantic import Field

from app.api.schemas.base import ApiModel
from app.domain.admin.catalog_import import CatalogImportReport, ImportAction, ImportItem


class ImportFieldChange(ApiModel):
    field: str
    label: str
    before: str | float | None = None
    after: str | float | None = None


class CatalogImportItem(ApiModel):
    product_id: UUID
    name: str
    action: ImportAction
    row: int
    solution_type: str | None = None
    reason: str | None = None
    changes: list[ImportFieldChange] = Field(default_factory=list)

    @classmethod
    def from_domain(cls, item: ImportItem) -> "CatalogImportItem":
        return cls(
            product_id=item.product_id,
            name=item.name,
            action=item.action,
            row=item.row,
            solution_type=item.solution_type,
            reason=item.reason,
            changes=[
                ImportFieldChange(field=c.field, label=c.label, before=c.before, after=c.after)
                for c in item.changes
            ],
        )


class ImportRowError(ApiModel):
    row: int
    message: str


class CatalogImportResult(ApiModel):
    dry_run: bool
    catalog_version: str
    created: int
    updated: int
    unchanged: int
    conflicts: int
    offers_created: int
    skipped: int
    not_in_file: int
    errors: list[ImportRowError]
    items: list[CatalogImportItem]

    @classmethod
    def from_domain(cls, report: CatalogImportReport) -> "CatalogImportResult":
        return cls(
            dry_run=report.dry_run,
            catalog_version=report.catalog_version,
            created=report.count(ImportAction.CREATED),
            updated=report.count(ImportAction.UPDATED),
            unchanged=report.count(ImportAction.UNCHANGED),
            conflicts=report.count(ImportAction.CONFLICT),
            offers_created=report.offers_created,
            skipped=report.skipped,
            not_in_file=report.not_in_file,
            errors=[ImportRowError(row=e.row, message=e.message) for e in report.errors],
            items=[
                CatalogImportItem.from_domain(item)
                for item in report.items
                if item.action != ImportAction.UNCHANGED
            ],
        )

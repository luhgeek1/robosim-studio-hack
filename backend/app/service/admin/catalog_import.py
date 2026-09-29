from collections.abc import Collection
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import func, select

from app.core.config import Settings
from app.core.errors import FileTooLargeError, InvalidInputError, UnsupportedFileTypeError
from app.db.models import AuditEvent, DataVersion, Manufacturer, Product, ProductOffer
from app.db.repositories.catalog_admin import CATALOG_VERSION_KEY, CatalogAdminRepository
from app.db.uow import UnitOfWork
from app.domain.admin.catalog_import import (
    CatalogImportReport,
    CatalogKeys,
    ImportAction,
    ImportItem,
    ImportRowError,
    field_changes,
    infer_solution_type,
)
from app.domain.catalog import Badge
from app.domain.reference import ObjectTypeKey
from app.seeds.catalog import CatalogSeeder, manufacturer_name, offer_values, product_values
from app.seeds.catalog_sources import CATALOG_REQUIRED_COLUMNS, CatalogRow, parse_catalog
from app.seeds.schemas import CatalogMappingSeed, ProductMappingSeed, load_catalog_mapping
from app.service.projects.imports import MAX_FILE_BYTES

CSV_SUFFIX = ".csv"
# Excel on Windows saves CSV in cp1251; the organizer's export is UTF-8 with a BOM.
_ENCODINGS = ("utf-8-sig", "cp1251")
_SEED_BADGES = frozenset({Badge.IN_REGISTRY_719.value, Badge.TESTED_FCBAS.value})
_NO_VERSION = "none"


@dataclass(slots=True)
class _Plan:
    rows: list[CatalogRow]
    item: ProductMappingSeed


def _decode(filename: str, content: bytes) -> str:
    if not filename.lower().endswith(CSV_SUFFIX):
        raise UnsupportedFileTypeError("Загрузите таблицу решений в формате CSV (разделитель «;»)")
    if len(content) > MAX_FILE_BYTES:
        raise FileTooLargeError(f"Файл больше {MAX_FILE_BYTES // (1024 * 1024)} МБ")
    for encoding in _ENCODINGS:
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise UnsupportedFileTypeError("Не удалось прочитать файл: сохраните его в кодировке UTF-8")


def _keys(rows: list[CatalogRow], synonyms: dict[str, str]) -> CatalogKeys:
    first = rows[0]
    subtype = first.get("Подтип")
    return first.get("Тип"), synonyms.get(subtype, subtype) if subtype else None, first.get("тип")


def _offers(offers: Collection[Any]) -> frozenset[tuple[Any, ...]]:
    return frozenset(
        (o["industry_key"], o["scenario"], float(o["price_rub"]), o["cases_text"]) for o in offers
    )


class CatalogImporter:
    """Catalog update from the organizer's table on admin request (ТЗ 3.3.2, 3.3.6).

    The seed loader does the work, so an uploaded file and the bundled one give the same cards. Products the
    seed manages are updated, unknown ids are added (their type by how the file classifies known products),
    and a card the admin edited or hid is never overwritten: it is reported as a conflict.
    """

    def __init__(self, uow: UnitOfWork, settings: Settings, actor_email: str) -> None:
        self._uow = uow
        self._settings = settings
        self._actor = actor_email
        self._mapping: CatalogMappingSeed = load_catalog_mapping()
        self._repo = CatalogAdminRepository(uow.session)

    async def run(
        self, filename: str, content: bytes, *, dry_run: bool, notes: str | None
    ) -> CatalogImportReport:
        text = _decode(filename, content)
        header = text.splitlines()[0] if text.strip() else ""
        missing = [name for name in CATALOG_REQUIRED_COLUMNS if name not in header.lstrip("﻿").split(";")]
        if missing:
            raise InvalidInputError(
                f"В файле нет колонок: {', '.join(missing)} — нужен формат catalog_export_v4.csv"
            )
        rows_by_id, without_id = parse_catalog(text.splitlines(keepends=True))
        valid, errors = self._validated(rows_by_id)
        current = await self._current(list(valid))
        known = [
            (_keys(rows, self._mapping.subtype_synonyms), current[pid]["solution_type"])
            for pid, rows in valid.items()
            if pid in current
        ]
        items: list[ImportItem] = []
        plans: dict[UUID, _Plan] = {}
        for pid, rows in valid.items():
            outcome = self._plan(pid, rows, current.get(pid), known)
            if isinstance(outcome, ImportRowError):
                errors.append(outcome)
                continue
            item, plan = outcome
            items.append(item)
            if plan is not None:
                plans[pid] = plan
        version = await self._version()
        if not dry_run and plans:
            version = await self._apply(plans, valid)
            self._audit(filename, notes, items, version)
        return CatalogImportReport(
            dry_run=dry_run,
            catalog_version=version,
            items=items,
            errors=sorted(errors, key=lambda error: error.row),
            skipped=len(without_id),
            not_in_file=await self._not_in_file(list(valid)),
        )

    def _validated(
        self, rows_by_id: dict[str, list[CatalogRow]]
    ) -> tuple[dict[UUID, list[CatalogRow]], list[ImportRowError]]:
        valid: dict[UUID, list[CatalogRow]] = {}
        errors: list[ImportRowError] = []
        for raw_id, rows in rows_by_id.items():
            try:
                pid = UUID(raw_id)
            except ValueError:
                errors.append(ImportRowError(rows[0].row, f"Не распознан id «{raw_id[:60]}»: нужен UUID"))
                continue
            unknown = next(
                (r for r in rows if (r.get("Отрасль") or "") not in self._mapping.industry_keys), None
            )
            if unknown is not None:
                errors.append(
                    ImportRowError(
                        unknown.row, f"Отрасль «{unknown.get('Отрасль') or ''}» не найдена в справочнике"
                    )
                )
                continue
            valid[pid] = rows
        return valid, errors

    def _plan(
        self,
        pid: UUID,
        rows: list[CatalogRow],
        current: dict[str, Any] | None,
        known: list[tuple[CatalogKeys, str]],
    ) -> tuple[ImportItem, _Plan | None] | ImportRowError:
        first = rows[0].row
        if current is not None and (current["hidden"] or not current["managed_by_seed"]):
            reason = "скрыт администратором" if current["hidden"] else "изменён администратором вручную"
            return ImportItem(pid, current["name"], ImportAction.CONFLICT, first, reason=reason), None
        item = self._mapping_item(pid, rows, current, known)
        if isinstance(item, ImportRowError):
            return item
        planned = {
            **product_values(rows, item, self._mapping.subtype_synonyms),
            "manufacturer": manufacturer_name(rows),
            "offers": _offers(offers := offer_values(pid, rows, self._mapping.industry_keys)),
        }
        new_offers = len({o["id"] for o in offers} - (current["offer_ids"] if current else set()))
        if current is None:
            created = ImportItem(
                pid,
                item.name,
                ImportAction.CREATED,
                first,
                solution_type=item.solution_type,
                new_offers=new_offers,
            )
            return created, _Plan(rows, item)
        changes = tuple(field_changes(current, planned))
        if not changes:
            return ImportItem(pid, item.name, ImportAction.UNCHANGED, first), None
        updated = ImportItem(
            pid, item.name, ImportAction.UPDATED, first, changes=changes, new_offers=new_offers
        )
        return updated, _Plan(rows, item)

    def _mapping_item(
        self,
        pid: UUID,
        rows: list[CatalogRow],
        current: dict[str, Any] | None,
        known: list[tuple[CatalogKeys, str]],
    ) -> ProductMappingSeed | ImportRowError:
        """The curated entry for the bundled products; otherwise the card's own type and processes."""
        mapped = next((m for m in self._mapping.products if m.id == str(pid)), None)
        if mapped is not None:
            return mapped
        name = rows[0].get("Название")
        if not name:
            return ImportRowError(rows[0].row, "Нет названия решения")
        if current is not None:
            return ProductMappingSeed(
                id=str(pid),
                name=name,
                solution_type=current["solution_type"],
                object_types=[ObjectTypeKey(t) for t in current["object_types"]],
                processes=current["processes"],
                badges=[Badge(b) for b in current["badges"] if b in _SEED_BADGES],
            )
        solution_type = infer_solution_type(_keys(rows, self._mapping.subtype_synonyms), known)
        if solution_type is None:
            return ImportRowError(
                rows[0].row,
                f"«{name}»: тип решения не определяется по колонкам «Тип» и «Подтип» — добавьте вручную",
            )
        # A new product joins the catalog without processes: matching offers it once the admin assigns them.
        return ProductMappingSeed(id=str(pid), name=name, solution_type=solution_type)

    async def _current(self, ids: list[UUID]) -> dict[UUID, dict[str, Any]]:
        if not ids:
            return {}
        statement = (
            select(Product, Manufacturer.name)
            .join(Manufacturer, Manufacturer.id == Product.manufacturer_id)
            .where(Product.id.in_(ids))
        )
        offers: dict[UUID, list[ProductOffer]] = {}
        for offer in await self._uow.session.scalars(
            select(ProductOffer).where(ProductOffer.product_id.in_(ids))
        ):
            offers.setdefault(offer.product_id, []).append(offer)
        result: dict[UUID, dict[str, Any]] = {}
        for product, manufacturer in (await self._uow.session.execute(statement)).tuples():
            own = offers.get(product.id, [])
            result[product.id] = {
                "name": product.name,
                "manufacturer": manufacturer,
                "solution_type": product.solution_type,
                "subtype": product.subtype,
                "catalog_category": product.catalog_category,
                "status": str(product.status),
                "trl": product.trl,
                "market_potential": product.market_potential,
                "description": product.description,
                "price_from_rub": float(product.price_from_rub),
                "offers": _offers([vars(o) for o in own]),
                "offer_ids": {o.id for o in own},
                "object_types": product.object_types,
                "processes": product.processes,
                "badges": product.badges,
                "hidden": product.hidden_at is not None,
                "managed_by_seed": product.managed_by_seed,
            }
        return result

    async def _apply(self, plans: dict[UUID, _Plan], valid: dict[UUID, list[CatalogRow]]) -> str:
        seeder = CatalogSeeder(self._uow, self._settings, self._mapping)
        capabilities = await seeder.capabilities()
        seeder.use_case_owners({str(pid): rows for pid, rows in valid.items()})
        for pid, plan in plans.items():
            await seeder.upsert_product(str(pid), plan.rows, plan.item, capabilities)
        await self._uow.flush()
        return await self._repo.bump_catalog_version(datetime.now(UTC).date())

    def _audit(self, filename: str, notes: str | None, items: list[ImportItem], version: str) -> None:
        counts = {action.value: sum(1 for i in items if i.action == action) for action in ImportAction}
        self._uow.session.add(
            AuditEvent(
                project_id=None,
                actor=self._actor,
                entity="catalog",
                action="import",
                after={"catalog_version": version, "file": filename, **counts},
                note=notes,
            )
        )

    async def _version(self) -> str:
        current = await self._uow.session.get(DataVersion, CATALOG_VERSION_KEY)
        return current.version if current else _NO_VERSION

    async def _not_in_file(self, ids: list[UUID]) -> int:
        statement = select(func.count()).where(
            Product.managed_by_seed.is_(True), Product.hidden_at.is_(None), Product.id.not_in(ids)
        )
        return await self._uow.session.scalar(statement) or 0

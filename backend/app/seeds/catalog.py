import hashlib
import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert

from app.core import parsing
from app.core.config import Settings
from app.db.models import (
    DataVersion,
    Manufacturer,
    Product,
    ProductCase,
    ProductOffer,
    ProductSpec,
    SolutionType,
)
from app.db.uow import UnitOfWork
from app.domain.catalog import Badge, SpecValue, completeness, derived_badges, rules
from app.domain.common.provenance import Provenance
from app.domain.reference import SpecGroup
from app.seeds import catalog_sources
from app.seeds.catalog_sources import (
    CATALOG_FILE,
    CATALOG_SOURCE,
    SPECS_FILE,
    CatalogRow,
    ResearchProduct,
    catalog_price,
    catalog_status,
    read_catalog,
    read_research_specs,
)
from app.seeds.reference import SeedDataError
from app.seeds.schemas import (
    DATA_DIR,
    CatalogMappingSeed,
    ProductMappingSeed,
    load_catalog_mapping,
    load_spec_keys,
)
from app.seeds.sources import SourceRegistry

_OFFER_NAMESPACE = uuid.UUID("5b3f0c1e-8a1d-4d8e-9f62-3c0a4b7e2d11")
UNKNOWN_MANUFACTURER = "Не указан"


_SEED_FILES = ("catalog_mapping.yaml", "spec_keys.yaml", "solution_types.yaml")
_LOADER_MODULES = (catalog_sources, parsing, rules, sys.modules[__name__])


def seed_inputs_hash(settings: Settings) -> str:
    digest = hashlib.sha256()
    for path in [settings.data_root / CATALOG_FILE, settings.data_root / SPECS_FILE]:
        digest.update(path.read_bytes())
    for name in _SEED_FILES:
        digest.update((DATA_DIR / name).read_bytes())
    # The loader itself is an input too: changing how research specs are read must reload the catalog.
    for module in _LOADER_MODULES:
        digest.update(Path(module.__file__ or "").read_bytes())
    return digest.hexdigest()


def _case_owners(rows_by_id: dict[str, list[CatalogRow]]) -> dict[str, set[str]]:
    owners: dict[str, set[str]] = {}
    for product_id, rows in rows_by_id.items():
        for row in rows:
            text = (row.get("Кейсы") or "").strip()
            if text:
                owners.setdefault(text, set()).add(product_id)
    return owners


def catalog_version_label(now: datetime, revision: int) -> str:
    return f"{now:%Y-%m-%d}.{revision}"


async def _manufacturer_id(uow: UnitOfWork, name: str, region: str | None, website: str | None) -> uuid.UUID:
    statement = insert(Manufacturer).values(name=name, country="RU", region=region, website=website)
    statement = statement.on_conflict_do_nothing(index_elements=[Manufacturer.name])
    await uow.session.execute(statement)
    manufacturer = await uow.session.scalar(select(Manufacturer).where(Manufacturer.name == name))
    assert manufacturer is not None
    if website and not manufacturer.website:
        manufacturer.website = website
    return manufacturer.id


def _subtype(row: CatalogRow, synonyms: dict[str, str]) -> str | None:
    raw = row.get("Подтип")
    return synonyms.get(raw, raw) if raw else None


def _number(raw: str | None) -> float | None:
    try:
        return float(raw.replace(",", ".")) if raw else None
    except ValueError:
        return None


def manufacturer_name(rows: list[CatalogRow]) -> str:
    return rows[0].get("компания") or UNKNOWN_MANUFACTURER


def product_values(
    rows: list[CatalogRow], item: ProductMappingSeed, synonyms: dict[str, str]
) -> dict[str, Any]:
    """Card fields of one product from its CSV rows and the mapping entry (name, type, processes)."""
    first = rows[0]
    return {
        "name": item.name,
        "solution_type": item.solution_type,
        "subtype": _subtype(first, synonyms),
        "catalog_category": first.get("Тип") or first.get("тип"),
        "status": catalog_status(first.get("статус")),
        "trl": int(trl) if (trl := _number(first.get("УГТ"))) else None,
        "market_potential": _number(first.get("Рын Потенциал")),
        "description": first.get("описание"),
        "object_types": [t.value for t in item.object_types],
        "processes": item.processes,
        "price_from_rub": min(catalog_price(row) for row in rows),
        "offers_count": len(rows),
    }


def offer_values(
    pid: uuid.UUID, rows: list[CatalogRow], industry_keys: dict[str, str]
) -> list[dict[str, Any]]:
    """One offer per CSV row; the id is stable for (product, industry, scenario), so scenarios keep it."""
    offers: list[dict[str, Any]] = []
    for row in rows:
        industry = industry_keys.get(row.get("Отрасль") or "")
        if industry is None:
            raise SeedDataError(f"row {row.row}: unknown industry {row.get('Отрасль')!r}")
        offers.append(
            {
                "id": uuid.uuid5(_OFFER_NAMESPACE, f"{pid}|{industry}|{row.get('Сценарий')}"),
                "product_id": pid,
                "industry_key": industry,
                "scenario": row.get("Сценарий") or "—",
                "price_rub": catalog_price(row),
                "vat_included": True,
                "cases_text": row.get("Кейсы"),
                "source_row": row.row,
            }
        )
    return offers


class CatalogSeeder:
    def __init__(self, uow: UnitOfWork, settings: Settings, mapping: CatalogMappingSeed) -> None:
        self._uow = uow
        self._settings = settings
        self._mapping = mapping
        self._sources = SourceRegistry(uow)
        self._spec_keys = {spec.key: spec for spec in load_spec_keys()}
        self._research = read_research_specs(settings.data_root, self._spec_keys)
        self._case_owners: dict[str, set[str]] = {}

    async def run(self) -> int:
        inputs_hash = seed_inputs_hash(self._settings)
        current = await self._uow.session.get(DataVersion, "catalog")
        if current is not None and current.content_hash == inputs_hash:
            return 0
        rows_by_id = read_catalog(self._settings.data_root)
        mapped = {item.id: item for item in self._mapping.products}
        missing = sorted(set(rows_by_id) - set(mapped))
        if missing:
            raise SeedDataError(f"catalog_mapping.yaml has no entry for ids: {missing[:5]}…")
        unknown_refs = sorted({m.specs_ref for m in mapped.values() if m.specs_ref} - set(self._research))
        if unknown_refs:
            raise SeedDataError(f"catalog_mapping.yaml: unknown specs_ref {unknown_refs}")
        capabilities = await self.capabilities()
        self.use_case_owners(rows_by_id)
        touched = 0
        for product_id, rows in rows_by_id.items():
            existing = await self._uow.session.get(Product, uuid.UUID(product_id))
            if existing is not None and not existing.managed_by_seed:
                continue
            await self.upsert_product(product_id, rows, mapped[product_id], capabilities)
            touched += 1
        await self._bump_version(current, inputs_hash)
        return touched

    async def capabilities(self) -> dict[str, list[str]]:
        rows = await self._uow.session.execute(select(SolutionType.key, SolutionType.capability_keys))
        return dict(rows.tuples().all())

    def use_case_owners(self, rows_by_id: dict[str, list[CatalogRow]]) -> None:
        """Which products share a «Кейсы» text: only a text of one product alone counts as its own case."""
        self._case_owners = _case_owners(rows_by_id)

    async def upsert_product(
        self,
        product_id: str,
        rows: list[CatalogRow],
        item: ProductMappingSeed,
        capabilities: dict[str, list[str]],
    ) -> None:
        pid = uuid.UUID(product_id)
        manufacturer_id = await _manufacturer_id(
            self._uow, manufacturer_name(rows), rows[0].get("Регион"), item.website
        )
        research = self._research.get(item.specs_ref) if item.specs_ref else None
        values: dict[str, Any] = {
            "id": pid,
            **product_values(rows, item, self._mapping.subtype_synonyms),
            "manufacturer_id": manufacturer_id,
            "updated_at": datetime.now(UTC),
        }
        statement = insert(Product).values(**values, managed_by_seed=True, badges=[], completeness=0.0)
        await self._uow.session.execute(
            statement.on_conflict_do_update(index_elements=[Product.id], set_=values)
        )
        await self._replace_offers(pid, rows)
        specs = await self._replace_specs(pid, research)
        await self._replace_cases(pid, research)
        await self._score(pid, item, research, specs, capabilities.get(item.solution_type, []), rows)

    async def _replace_offers(self, pid: uuid.UUID, rows: list[CatalogRow]) -> None:
        source_id = await self._sources.id_for(CATALOG_SOURCE)
        keep: list[uuid.UUID] = []
        for offer in offer_values(pid, rows, self._mapping.industry_keys):
            offer_id = offer.pop("id")
            keep.append(offer_id)
            values = {**offer, "source_id": source_id}
            statement = insert(ProductOffer).values(id=offer_id, **values)
            await self._uow.session.execute(
                statement.on_conflict_do_update(index_elements=[ProductOffer.id], set_=values)
            )
        await self._uow.session.execute(
            delete(ProductOffer).where(ProductOffer.product_id == pid, ProductOffer.id.not_in(keep))
        )

    async def _replace_specs(self, pid: uuid.UUID, research: ResearchProduct | None) -> list[SpecValue]:
        await self._uow.session.execute(delete(ProductSpec).where(ProductSpec.product_id == pid))
        specs: list[SpecValue] = []
        seen: set[tuple[str, uuid.UUID | None]] = set()
        for record in research.specs if research else []:
            source_id = await self._sources.id_for(record.source) if record.source else None
            if (record.key, source_id) in seen:
                continue
            seen.add((record.key, source_id))
            self._uow.session.add(
                ProductSpec(
                    product_id=pid,
                    key=record.key,
                    value=record.value,
                    value_num=record.value_num,
                    unit=record.unit,
                    status=record.status,
                    source_id=source_id,
                    is_primary=True,
                    raw_value=record.raw_value,
                    note=record.note,
                )
            )
            spec = self._spec_keys[record.key]
            specs.append(
                SpecValue(
                    key=record.key,
                    name=spec.name,
                    group=SpecGroup(spec.group),
                    value=record.value,
                    unit=record.unit,
                    provenance=Provenance(status=record.status),
                    is_key_constraint=spec.is_key_constraint,
                )
            )
        return specs

    async def _replace_cases(self, pid: uuid.UUID, research: ResearchProduct | None) -> None:
        await self._uow.session.execute(delete(ProductCase).where(ProductCase.product_id == pid))
        for case in research.cases if research else []:
            source = case.get("source_spec")
            self._uow.session.add(
                ProductCase(
                    product_id=pid,
                    customer=str(case.get("customer") or "Заказчик не раскрыт"),
                    count=case.get("count") if isinstance(case.get("count"), int) else None,
                    description=case.get("note"),
                    source_id=await self._sources.id_for(source) if source else None,
                )
            )

    async def _score(
        self,
        pid: uuid.UUID,
        item: ProductMappingSeed,
        research: ResearchProduct | None,
        specs: list[SpecValue],
        capability_keys: list[str],
        rows: list[CatalogRow],
    ) -> None:
        product = await self._uow.session.get(Product, pid)
        assert product is not None
        by_key = {spec.key: spec for spec in specs}
        assigned = [Badge(badge) for badge in item.badges]
        if research and research.in_registry:
            assigned.append(Badge.IN_REGISTRY_719)
        # The organizer's «Кейсы» column is filled for every product, often with one category text (41 rows
        # say «БАС применяется для мониторинговых задач»): only a text of this product alone is its own case.
        own_case = any(len(self._case_owners.get((row.get("Кейсы") or "").strip(), ())) == 1 for row in rows)
        has_cases = bool(research and research.cases) or own_case
        product.badges = [
            b.value
            for b in derived_badges(
                assigned, country="RU", has_cases=has_cases, capability_keys=capability_keys, specs=by_key
            )
        ]
        product.completeness = completeness(
            capability_keys,
            by_key,
            has_description=bool(product.description),
            has_price=product.price_from_rub > 0,
        )

    async def _bump_version(self, current: DataVersion | None, inputs_hash: str) -> None:
        now = datetime.now(UTC)
        if current is None:
            version = catalog_version_label(now, 1)
            self._uow.session.add(DataVersion(key="catalog", version=version, content_hash=inputs_hash))
            return
        day, _, revision = current.version.partition(".")
        next_revision = int(revision) + 1 if day == f"{now:%Y-%m-%d}" else 1
        current.version = catalog_version_label(now, next_revision)
        current.content_hash = inputs_hash


async def seed_catalog(uow: UnitOfWork, settings: Settings) -> int:
    return await CatalogSeeder(uow, settings, load_catalog_mapping()).run()

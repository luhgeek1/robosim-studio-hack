from collections.abc import Sequence
from datetime import date
from uuid import UUID, uuid4

from sqlalchemy import delete, exists, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    DataVersion,
    Industry,
    Manufacturer,
    ProcessDef,
    Product,
    ProductCase,
    ProductOffer,
    ProductSpec,
    SolutionType,
    Source,
    SpecKey,
)
from app.domain.admin import SourceInput, next_catalog_version

CATALOG_VERSION_KEY = "catalog"
# Sources an admin typed in get this key prefix: it tells admin-given spec values from seeded ones.
ADMIN_SOURCE_PREFIX = "admin:"


class CatalogAdminRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def solution_type(self, key: str) -> SolutionType | None:
        return await self._session.get(SolutionType, key)

    async def industry_keys(self) -> dict[str, str]:
        """Industry lookup by key and by name (the catalog table uses names, the API may send either)."""
        rows = (await self._session.execute(select(Industry.key, Industry.name))).tuples().all()
        return {**{name: key for key, name in rows}, **{key: key for key, _ in rows}}

    async def process_keys(self, object_types: Sequence[str]) -> set[str]:
        statement = select(ProcessDef.key).where(ProcessDef.object_type.in_(object_types))
        return set((await self._session.scalars(statement)).all())

    async def spec_keys(self) -> dict[str, SpecKey]:
        return {row.key: row for row in await self._session.scalars(select(SpecKey))}

    async def manufacturer(self, name: str, country: str, region: str | None) -> Manufacturer:
        found = await self._session.scalar(select(Manufacturer).where(Manufacturer.name == name))
        if found is None:
            found = Manufacturer(name=name, country=country, region=region)
            self._session.add(found)
            await self._session.flush()
        return found

    async def add_source(self, source: SourceInput) -> Source:
        row = Source(
            key=f"{ADMIN_SOURCE_PREFIX}{uuid4()}",
            kind=source.kind,
            title=source.title,
            url=source.url,
            retrieved_at=source.retrieved_at,
            note=source.note,
        )
        self._session.add(row)
        await self._session.flush()
        return row

    async def offers(self, product_id: UUID) -> Sequence[ProductOffer]:
        statement = select(ProductOffer).where(ProductOffer.product_id == product_id)
        return (await self._session.scalars(statement)).all()

    async def delete_offers(self, offer_ids: Sequence[UUID]) -> None:
        if offer_ids:
            await self._session.execute(delete(ProductOffer).where(ProductOffer.id.in_(offer_ids)))

    async def has_cases(self, product_id: UUID) -> bool:
        statement = select(exists().where(ProductCase.product_id == product_id))
        return bool(await self._session.scalar(statement))

    async def replace_admin_specs(self, product_id: UUID, keys: Sequence[str]) -> None:
        """Drops earlier admin values of these keys and demotes the rest, so the new value is the primary."""
        admin_sources = select(Source.id).where(Source.key.startswith(ADMIN_SOURCE_PREFIX))
        of_keys = (ProductSpec.product_id == product_id) & ProductSpec.key.in_(keys)
        await self._session.execute(
            delete(ProductSpec).where(of_keys, ProductSpec.source_id.in_(admin_sources))
        )
        await self._session.execute(update(ProductSpec).where(of_keys).values(is_primary=False))

    def add(self, row: Product | ProductOffer | ProductSpec) -> None:
        self._session.add(row)

    async def bump_catalog_version(self, today: date) -> str:
        """Saved calculations compare this label with their own: a change makes them stale (D-011)."""
        current = await self._session.get(DataVersion, CATALOG_VERSION_KEY)
        if current is None:
            current = DataVersion(key=CATALOG_VERSION_KEY, version=next_catalog_version(None, today))
            self._session.add(current)
        else:
            current.version = next_catalog_version(current.version, today)
        await self._session.flush()
        return current.version

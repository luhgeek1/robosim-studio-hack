from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import UUID, uuid4

from app.core.errors import InvalidInputError, NotFoundError
from app.db.models import Manufacturer, Product, ProductOffer, ProductSpec, SolutionType
from app.db.repositories.catalog import CatalogRepository
from app.db.repositories.catalog_admin import CatalogAdminRepository
from app.db.uow import UnitOfWork
from app.domain.admin import OfferInput, ProductInput, SourceInput, SpecInput, spec_value_matches
from app.domain.catalog import Badge, ProductDetail, completeness, derived_badges, primary_specs
from app.domain.common.provenance import SourceKind
from app.service.catalog import CatalogService
from app.service.catalog.mappers import to_spec

# Rules derive these from the manufacturer's country and spec provenance; a stale echo from the form must
# not keep them alive.
_DERIVED_ONLY = frozenset({Badge.DOMESTIC, Badge.SPECS_CONFIRMED})
_TYPE_NAMES = {"number": "число", "string": "строка", "boolean": "да/нет"}
_ADMIN_INPUT = SourceInput(kind=SourceKind.USER_INPUT, title="Введено администратором каталога")


class CatalogAdminService:
    """Manual catalog edits (ТЗ 3.3.5): every write rescores the card and bumps the catalog version."""

    def __init__(self, uow: UnitOfWork, actor_email: str) -> None:
        self._uow = uow
        self._actor = actor_email
        self._repo = CatalogAdminRepository(uow.session)
        self._catalog = CatalogRepository(uow.session)
        self._default_source: UUID | None = None

    async def create(self, data: ProductInput) -> ProductDetail:
        product = Product(id=uuid4(), badges=[], completeness=0.0, price_from_rub=0.0, offers_count=0)
        await self._apply(product, data)
        self._repo.add(product)
        await self._uow.flush()
        await self._sync_offers(product.id, data.offers)
        return await self._finish(product, data.badges)

    async def update(self, product_id: UUID, data: ProductInput) -> ProductDetail:
        product = await self._visible(product_id)
        await self._apply(product, data)
        await self._sync_offers(product.id, data.offers)
        return await self._finish(product, data.badges)

    async def hide(self, product_id: UUID) -> None:
        product = await self._visible(product_id)
        product.hidden_at = datetime.now(UTC)
        product.managed_by_seed = False
        await self._repo.bump_catalog_version(product.hidden_at.date())

    async def upsert_specs(self, product_id: UUID, specs: Sequence[SpecInput]) -> ProductDetail:
        product = await self._visible(product_id)
        keys = await self._repo.spec_keys()
        _check_specs(specs, {key: row.value_type for key, row in keys.items()})
        await self._repo.replace_admin_specs(product.id, [spec.key for spec in specs])
        for spec in specs:
            source = await self._repo.add_source(spec.source)
            is_number = keys[spec.key].value_type == "number"
            self._repo.add(
                ProductSpec(
                    product_id=product.id,
                    key=spec.key,
                    value=spec.value,
                    value_num=float(spec.value) if is_number else None,
                    unit=spec.unit or keys[spec.key].unit,
                    status=spec.status,
                    source_id=source.id,
                    is_primary=True,
                    note=spec.note,
                )
            )
        await self._uow.flush()
        return await self._finish(product, [Badge(badge) for badge in product.badges])

    async def _visible(self, product_id: UUID) -> Product:
        product = await self._catalog.get(product_id)
        if product is None or product.hidden_at is not None:
            raise NotFoundError("Продукт не найден или скрыт")
        return product

    async def _apply(self, product: Product, data: ProductInput) -> None:
        if await self._repo.solution_type(data.solution_type) is None:
            raise InvalidInputError(f"Тип решения «{data.solution_type}» не найден в справочнике")
        unknown = sorted(set(data.processes) - await self._repo.process_keys(data.object_types))
        if unknown:
            raise InvalidInputError(f"Процессы {', '.join(unknown)} не относятся к выбранным типам объектов")
        manufacturer = await self._repo.manufacturer(
            data.manufacturer_name.strip(), data.manufacturer_country, data.manufacturer_region
        )
        product.name = data.name.strip()
        product.manufacturer_id = manufacturer.id
        product.solution_type = data.solution_type
        product.subtype = data.subtype
        product.status = data.status
        product.trl = data.trl
        product.market_potential = data.market_potential
        product.description = data.description
        product.image_url = data.image_url
        product.object_types = list(dict.fromkeys(data.object_types))
        product.processes = list(dict.fromkeys(data.processes))

    async def _sync_offers(self, product_id: UUID, offers: Sequence[OfferInput]) -> None:
        """Offers keep their id when industry and scenario match, so scenarios keep pointing at them."""
        industries = await self._repo.industry_keys()
        existing = {(o.industry_key, o.scenario): o for o in await self._repo.offers(product_id)}
        for offer in offers:
            industry = industries.get(offer.industry.strip())
            if industry is None:
                raise InvalidInputError(f"Отрасль «{offer.industry}» не найдена в справочнике")
            row = existing.pop((industry, offer.scenario), None)
            if row is None:
                row = ProductOffer(product_id=product_id, industry_key=industry, scenario=offer.scenario)
                row.source_id = await self._source_id(offer.source)
                self._repo.add(row)
            elif offer.source is not None:
                row.source_id = await self._source_id(offer.source)
            row.price_rub = offer.price_rub
            row.vat_included = offer.vat_included
            row.cases_text = offer.cases_text
        await self._repo.delete_offers([row.id for row in existing.values()])
        await self._uow.flush()

    async def _source_id(self, source: SourceInput | None) -> UUID:
        if source is not None:
            return (await self._repo.add_source(source)).id
        if self._default_source is None:
            note = f"Автор правки: {self._actor}"
            default = SourceInput(kind=_ADMIN_INPUT.kind, title=_ADMIN_INPUT.title, note=note)
            self._default_source = (await self._repo.add_source(default)).id
        return self._default_source

    async def _finish(self, product: Product, assigned: Sequence[Badge]) -> ProductDetail:
        solution_type = await self._repo.solution_type(product.solution_type)
        manufacturer = await self._uow.session.get(Manufacturer, product.manufacturer_id)
        assert solution_type is not None
        assert manufacturer is not None
        offers = await self._repo.offers(product.id)
        product.price_from_rub = min((offer.price_rub for offer in offers), default=0.0)
        product.offers_count = len(offers)
        await self._rescore(product, solution_type, manufacturer.country, assigned)
        product.managed_by_seed = False
        product.updated_at = datetime.now(UTC)
        await self._repo.bump_catalog_version(product.updated_at.date())
        return await CatalogService(self._uow).detail(product.id)

    async def _rescore(
        self, product: Product, solution_type: SolutionType, country: str, assigned: Sequence[Badge]
    ) -> None:
        keys = await self._repo.spec_keys()
        rows = await self._catalog.specs([product.id])
        specs = primary_specs(to_spec(row, keys[row.key], {}) for row in rows)
        capability_keys = solution_type.capability_keys
        badges = derived_badges(
            [badge for badge in assigned if badge not in _DERIVED_ONLY],
            country=country,
            has_cases=await self._repo.has_cases(product.id),
            capability_keys=capability_keys,
            specs=specs,
        )
        product.badges = [badge.value for badge in badges]
        product.completeness = completeness(
            capability_keys,
            specs,
            has_description=bool(product.description),
            has_price=product.price_from_rub > 0,
        )


def _check_specs(specs: Sequence[SpecInput], value_types: dict[str, str]) -> None:
    seen: set[str] = set()
    for spec in specs:
        if spec.key not in value_types:
            raise InvalidInputError(f"Характеристика «{spec.key}» не найдена в словаре ТТХ")
        if spec.key in seen:
            raise InvalidInputError(f"Характеристика «{spec.key}» указана дважды")
        seen.add(spec.key)
        if not spec_value_matches(value_types[spec.key], spec.value):
            raise InvalidInputError(
                f"Значение «{spec.key}» должно быть типа {_TYPE_NAMES[value_types[spec.key]]}"
            )

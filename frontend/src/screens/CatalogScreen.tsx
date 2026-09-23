import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { useCatalogFacets, useProducts } from '@/api/catalog'
import type { CatalogQuery } from '@/api/keys'
import type { Facet, Product } from '@/api/types'
import { CompareBar } from '@/components/catalog/CompareBar'
import { BadgePills, CompareToggle, CompletenessBar, PriceFrom, StatusPill, TrlPill } from '@/components/catalog/parts'
import type { CatalogLinkState } from '@/components/catalog/names'
import { Empty, ErrorState, Skeleton } from '@/components/States'
import { Button, Segmented, Select, inputCls } from '@/components/ui'
import { formatNumber, pluralRu } from '@/lib/format'

const PAGE_SIZE = 24
const SEARCH_DEBOUNCE_MS = 350

const SORT_OPTIONS = [
  { value: 'relevance', label: 'По релевантности' },
  { value: 'name', label: 'По названию' },
  { value: 'price_asc', label: 'Сначала дешевле' },
  { value: 'price_desc', label: 'Сначала дороже' },
  { value: 'completeness', label: 'По полноте карточки' },
  { value: 'trl', label: 'По готовности (УГТ)' },
]

type FilterKey = 'q' | 'object_type' | 'solution_type' | 'status' | 'badge' | 'sort' | 'page'

const FILTER_KEYS: FilterKey[] = ['q', 'object_type', 'solution_type', 'status', 'badge']

const facetOptions = (facets: Facet[] | undefined, allLabel: string) => [
  { value: '', label: allLabel },
  ...(facets ?? []).map((f) => ({ value: f.key, label: `${f.name} · ${f.count}` })),
]

export function CatalogScreen() {
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const get = (key: FilterKey) => params.get(key) ?? ''
  const list = (key: FilterKey) => (get(key) ? [get(key)] : undefined)

  const query: CatalogQuery = {
    q: get('q') || undefined,
    object_type: get('object_type') || undefined,
    solution_type: list('solution_type'),
    status: list('status'),
    badge: list('badge'),
    sort: get('sort') || 'relevance',
    page: Math.max(1, Number(get('page')) || 1),
    page_size: PAGE_SIZE,
  }
  const products = useProducts(query)
  const facets = useCatalogFacets(query.object_type)

  const update = (patch: Partial<Record<FilterKey, string | null>>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        if (!('page' in patch)) next.delete('page')
        return next
      },
      { replace: true },
    )
  const filtered = FILTER_KEYS.some((key) => get(key))
  const reset = () => update(Object.fromEntries(FILTER_KEYS.map((key) => [key, null])))

  const data = products.data
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1
  const goToPage = (page: number) => {
    update({ page: page > 1 ? String(page) : null })
    window.scrollTo({ top: 0 })
  }

  const objectTypes = facets.data?.object_types ?? []

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 pt-9 pb-28">
      <div className="mb-7 max-w-[780px]">
        <div className="meta mb-2">Каталог решений</div>
        <h1 className="h1">
          {data
            ? `${formatNumber(data.total)} ${pluralRu(data.total, ['решение', 'решения', 'решений'])} для роботизации`
            : 'Каталог роботизированных решений'}
        </h1>
        <p className="mt-3 text-[15.5px] leading-relaxed text-ink-2">
          Каталог организатора и открытые источники: у каждой характеристики — источник и дата, цены с НДС, предложения
          по отраслям. Отметьте до 5 решений, чтобы сравнить их характеристики рядом.
        </p>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchBox value={query.q ?? ''} onCommit={(q) => update({ q: q || null })} />
        <Select
          ariaLabel="Сортировка"
          value={query.sort ?? 'relevance'}
          onChange={(value) => update({ sort: value === 'relevance' ? null : value })}
          options={SORT_OPTIONS}
          className="!w-[220px]"
        />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Segmented
          size="sm"
          layoutId="catalog-object-type"
          value={query.object_type ?? ''}
          onChange={(value) => update({ object_type: value || null, solution_type: null })}
          options={[
            { value: '', label: 'Любой объект' },
            ...objectTypes.map((f) => ({
              value: f.key,
              label: (
                <>
                  {f.name} <span className="num text-ink-4">{f.count}</span>
                </>
              ),
            })),
          ]}
        />
        <Select
          ariaLabel="Тип решения"
          value={get('solution_type')}
          onChange={(value) => update({ solution_type: value || null })}
          options={facetOptions(facets.data?.solution_types, 'Все типы решений')}
          className="!h-8 !w-[200px] !text-[13px]"
        />
        <Select
          ariaLabel="Стадия"
          value={get('status')}
          onChange={(value) => update({ status: value || null })}
          options={facetOptions(facets.data?.statuses, 'Любая стадия')}
          className="!h-8 !w-[150px] !text-[13px]"
        />
        <Select
          ariaLabel="Отметка"
          value={get('badge')}
          onChange={(value) => update({ badge: value || null })}
          options={facetOptions(facets.data?.badges, 'Любые отметки')}
          className="!h-8 !w-[180px] !text-[13px]"
        />
        {filtered && (
          <Button size="sm" variant="ghost" onClick={reset}>
            Сбросить
          </Button>
        )}
      </div>

      {products.isError && <ErrorState error={products.error} onRetry={() => products.refetch()} />}
      {products.isPending && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[250px] !rounded-[14px]" />
          ))}
        </div>
      )}
      {data && data.items.length === 0 && (
        <Empty
          title="Ничего не нашлось"
          action={
            filtered && (
              <Button variant="secondary" onClick={reset}>
                Сбросить фильтры
              </Button>
            )
          }
        >
          Уберите часть фильтров или измените запрос — например, «AMR» или «уборка».
        </Empty>
      )}
      {data && data.items.length > 0 && (
        <>
          <div
            className={`grid grid-cols-1 gap-4 transition-opacity md:grid-cols-2 lg:grid-cols-3 ${products.isPlaceholderData ? 'opacity-60' : ''}`}
          >
            {data.items.map((product) => (
              <ProductCard key={product.id} product={product} state={{ catalogSearch: location.search }} />
            ))}
          </div>
          <Pagination
            page={data.page}
            totalPages={totalPages}
            total={data.total}
            pageSize={data.page_size}
            shown={data.items.length}
            onPage={goToPage}
          />
        </>
      )}
      <CompareBar />
    </div>
  )
}

function SearchBox({ value, onCommit }: { value: string; onCommit: (q: string) => void }) {
  const [text, setText] = useState(value)
  const [synced, setSynced] = useState(value)
  // The URL can change without typing (back button, «Сбросить») — follow it unless it already matches the input.
  if (value !== synced) {
    setSynced(value)
    if (value !== text.trim()) setText(value)
  }
  const commit = useRef(onCommit)
  useEffect(() => {
    commit.current = onCommit
  })
  useEffect(() => {
    const trimmed = text.trim()
    if (trimmed === value) return
    const timer = setTimeout(() => commit.current(trimmed), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text, value])

  return (
    <div className="relative min-w-[280px] flex-1">
      <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-4" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Название, производитель или задача — например, «AMR», «Ronavi», «уборка»"
        className={`${inputCls} pl-9`}
        aria-label="Поиск по каталогу"
      />
    </div>
  )
}

function ProductCard({ product, state }: { product: Product; state: CatalogLinkState }) {
  return (
    <div className="card relative flex flex-col gap-3 p-4 transition-shadow hover:shadow-card">
      <div className="min-w-0">
        <div className="meta mb-1 truncate" title={product.solution_type_name ?? product.solution_type}>
          {product.solution_type_name ?? product.solution_type}
        </div>
        <Link
          to={`/catalog/${product.id}`}
          state={state}
          className="line-clamp-2 text-[15px] leading-snug font-semibold after:absolute after:inset-0"
          title={product.name}
        >
          {product.name}
        </Link>
        <div className="mt-0.5 truncate text-[12.5px] text-ink-3" title={product.manufacturer.name}>
          {product.manufacturer.name}
        </div>
      </div>
      <div className="relative z-10 flex flex-wrap items-center gap-1.5">
        <StatusPill status={product.status} />
        <TrlPill trl={product.trl} />
      </div>
      <div className="relative z-10">
        <BadgePills badges={product.badges} limit={3} />
      </div>
      <div className="mt-auto space-y-3">
        <div className="flex items-end justify-between gap-2">
          <PriceFrom price={product.price_from} />
          {product.offers_count !== undefined && (
            <span className="text-[12px] text-ink-3">
              <span className="num">{product.offers_count}</span>{' '}
              {pluralRu(product.offers_count, ['предложение', 'предложения', 'предложений'])}
            </span>
          )}
        </div>
        <div className="relative z-10">
          <CompletenessBar value={product.completeness} />
        </div>
        <CompareToggle product={product} className="relative z-10 w-full" />
      </div>
    </div>
  )
}

function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  shown,
  onPage,
}: {
  page: number
  totalPages: number
  total: number
  pageSize: number
  shown: number
  onPage: (page: number) => void
}) {
  const from = (page - 1) * pageSize + 1
  return (
    <div className="mt-6 flex items-center justify-between gap-3 text-[13px] text-ink-3">
      <span className="num">
        {from}–{from + shown - 1} из {formatNumber(total)}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            icon={<ChevronLeft size={14} />}
          >
            Назад
          </Button>
          <span className="num px-1">
            {page} из {totalPages}
          </span>
          <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
            Вперёд <ChevronRight size={14} />
          </Button>
        </div>
      )}
    </div>
  )
}

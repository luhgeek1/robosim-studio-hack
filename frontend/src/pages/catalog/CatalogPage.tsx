import { useEffect, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Search, SearchX, X } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { useCatalogFacets, useProducts } from '@/entities/catalog'
import { CompareSelectionBar, CompareToggle } from '@/features/catalog-compare-selection'
import type { CatalogQuery } from '@/shared/api/keys'
import type { Facet, Product } from '@/shared/api/types'
import { formatNumber, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Input } from '@/shared/ui/input'
import { PageHeader } from '@/shared/ui/page'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Skeleton } from '@/shared/ui/skeleton'
import { EmptyState, ErrorBlock, Spinner } from '@/shared/ui/states'
import { CompletenessMeter, PriceFrom, ProductBadges, ProductStatusBadge, TrlBadge } from './parts'

const PAGE_SIZE = 24
const ALL = '__all'
const SEARCH_DEBOUNCE_MS = 350

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'relevance', label: 'По релевантности' },
  { value: 'name', label: 'По названию' },
  { value: 'price_asc', label: 'Сначала дешевле' },
  { value: 'price_desc', label: 'Сначала дороже' },
  { value: 'completeness', label: 'По полноте карточки' },
  { value: 'trl', label: 'По готовности (УГТ)' },
]

const LIST_KEYS = ['solution_type', 'status', 'badge'] as const
type ListKey = (typeof LIST_KEYS)[number]
type ScalarKey = 'q' | 'object_type' | 'industry' | 'sort' | 'page'

const readList = (params: URLSearchParams, key: ListKey) => params.get(key)?.split(',').filter(Boolean) ?? []

export function CatalogPage() {
  const location = useLocation()
  const [params, setParams] = useSearchParams()

  const query: CatalogQuery = {
    q: params.get('q') ?? undefined,
    object_type: params.get('object_type') ?? undefined,
    industry: params.get('industry') ?? undefined,
    solution_type: readList(params, 'solution_type'),
    status: readList(params, 'status'),
    badge: readList(params, 'badge'),
    sort: params.get('sort') ?? 'relevance',
    page: Math.max(1, Number(params.get('page')) || 1),
    page_size: PAGE_SIZE,
  }

  const products = useProducts(query)
  const facets = useCatalogFacets(query.object_type)

  const update = (patch: Partial<Record<ScalarKey | ListKey, string | string[] | null>>) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(patch)) {
          const text = Array.isArray(value) ? value.join(',') : value
          if (text) next.set(key, text)
          else next.delete(key)
        }
        if (!('page' in patch)) next.delete('page')
        return next
      },
      { replace: true },
    )
  }

  const toggleIn = (key: ListKey, value: string) => {
    const current = readList(params, key)
    update({ [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] })
  }

  const activeFilters =
    Boolean(query.q || query.object_type || query.industry) || LIST_KEYS.some((key) => readList(params, key).length > 0)

  const data = products.data
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1
  const goToPage = (page: number) => {
    update({ page: page > 1 ? String(page) : null })
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] p-6 pb-28">
      <PageHeader
        title="Каталог роботизированных решений"
        description="Решения из каталога организатора и открытых источников: характеристики с источниками, цены, предложения по отраслям. Выберите до 5 решений для сравнения."
        actions={
          data && (
            <div className="text-right text-sm text-muted-foreground">
              Найдено
              <div className="num text-2xl font-semibold text-foreground">
                {formatNumber(data.total)}{' '}
                <span className="text-base font-normal text-muted-foreground">
                  {pluralRu(data.total, ['решение', 'решения', 'решений'])}
                </span>
              </div>
            </div>
          )
        }
      />

      <div className="grid grid-cols-[260px_minmax(0,1fr)] items-start gap-6">
        <aside className="sticky top-20 max-h-[calc(100vh-6rem)] space-y-5 overflow-y-auto rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Фильтры</h2>
            {activeFilters && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() =>
                  update({ q: null, object_type: null, industry: null, solution_type: null, status: null, badge: null })
                }
              >
                <X /> Сбросить
              </Button>
            )}
          </div>

          {facets.isError && <ErrorBlock error={facets.error} onRetry={() => facets.refetch()} />}
          {facets.isPending && <Skeleton className="h-64 w-full" />}
          {facets.data && (
            <>
              <FilterGroup title="Тип объекта">
                <RadioList
                  value={query.object_type ?? null}
                  allLabel="Любой объект"
                  options={facets.data.object_types ?? []}
                  onChange={(value) => update({ object_type: value })}
                />
              </FilterGroup>
              <FilterGroup title="Отрасль">
                <Select
                  value={query.industry ?? ALL}
                  onValueChange={(value) => update({ industry: value === ALL ? null : value })}
                >
                  <SelectTrigger className="w-full" aria-label="Отрасль">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Все отрасли</SelectItem>
                    {(facets.data.industries ?? []).map((facet) => (
                      <SelectItem key={facet.key} value={facet.key}>
                        {facet.name} <span className="num text-muted-foreground">{facet.count}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterGroup>
              <FilterGroup title="Тип решения">
                <CheckList
                  options={facets.data.solution_types ?? []}
                  selected={query.solution_type ?? []}
                  onToggle={(value) => toggleIn('solution_type', value)}
                  scroll
                />
              </FilterGroup>
              <FilterGroup title="Стадия">
                <CheckList
                  options={facets.data.statuses ?? []}
                  selected={query.status ?? []}
                  onToggle={(value) => toggleIn('status', value)}
                />
              </FilterGroup>
              <FilterGroup title="Отметки">
                <CheckList
                  options={facets.data.badges ?? []}
                  selected={query.badge ?? []}
                  onToggle={(value) => toggleIn('badge', value)}
                />
              </FilterGroup>
            </>
          )}
        </aside>

        <div className="min-w-0 space-y-4">
          <div className="flex items-center gap-3">
            <SearchBox value={query.q ?? ''} onCommit={(q) => update({ q: q || null })} />
            <Select
              value={query.sort}
              onValueChange={(value) => update({ sort: value === 'relevance' ? null : value })}
            >
              <SelectTrigger className="w-56" aria-label="Сортировка">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {products.isFetching && !products.isPending && <Spinner className="text-muted-foreground" />}
          </div>

          {products.isError && <ErrorBlock error={products.error} onRetry={() => products.refetch()} />}
          {products.isPending && (
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 9 }, (_, i) => (
                <Skeleton key={i} className="h-60 rounded-xl" />
              ))}
            </div>
          )}
          {data && data.items.length === 0 && (
            <EmptyState
              icon={<SearchX className="size-6" />}
              title="Ничего не найдено"
              description="Попробуйте убрать часть фильтров или изменить запрос."
              action={
                activeFilters && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      update({
                        q: null,
                        object_type: null,
                        industry: null,
                        solution_type: null,
                        status: null,
                        badge: null,
                      })
                    }
                  >
                    Сбросить фильтры
                  </Button>
                )
              }
            />
          )}
          {data && data.items.length > 0 && (
            <>
              <div
                className={cn('grid grid-cols-3 gap-3 transition-opacity', products.isPlaceholderData && 'opacity-60')}
              >
                {data.items.map((product) => (
                  <ProductCard key={product.id} product={product} catalogSearch={location.search} />
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
        </div>
      </div>
      <CompareSelectionBar />
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

  useEffect(() => {
    const trimmed = text.trim()
    if (trimmed === value) return
    const timer = setTimeout(() => onCommit(trimmed), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text, value, onCommit])

  return (
    <div className="relative flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Поиск по названию, производителю, описанию — например, «AMR» или «Ronavi»"
        className="h-9 pl-8"
        aria-label="Поиск по каталогу"
      />
    </div>
  )
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</div>
      {children}
    </div>
  )
}

function RadioList({
  value,
  options,
  allLabel,
  onChange,
}: {
  value: string | null
  options: Facet[]
  allLabel: string
  onChange: (value: string | null) => void
}) {
  const items: { key: string | null; name: string; count?: number }[] = [{ key: null, name: allLabel }, ...options]
  return (
    <div className="space-y-0.5" role="radiogroup">
      {items.map((item) => {
        const active = value === item.key
        return (
          <button
            key={item.key ?? ALL}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(item.key)}
            className={cn(
              'flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm hover:bg-muted',
              active && 'bg-secondary font-medium',
            )}
          >
            <span>{item.name}</span>
            {item.count !== undefined && <span className="num text-xs text-muted-foreground">{item.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

function CheckList({
  options,
  selected,
  onToggle,
  scroll,
}: {
  options: Facet[]
  selected: string[]
  onToggle: (value: string) => void
  scroll?: boolean
}) {
  if (!options.length) return <div className="text-xs text-muted-foreground">Нет значений</div>
  return (
    <div className={cn('space-y-1.5', scroll && 'max-h-56 overflow-y-auto pr-1')}>
      {options.map((facet) => {
        const id = `facet-${facet.key}`
        return (
          <label key={facet.key} htmlFor={id} className="flex cursor-pointer items-start gap-2 text-sm">
            <Checkbox
              id={id}
              className="mt-0.5"
              checked={selected.includes(facet.key)}
              onCheckedChange={() => onToggle(facet.key)}
            />
            <span className="min-w-0 flex-1 leading-snug">{facet.name}</span>
            <span className="num text-xs text-muted-foreground">{facet.count}</span>
          </label>
        )
      })}
    </div>
  )
}

function ProductCard({ product, catalogSearch }: { product: Product; catalogSearch: string }) {
  return (
    <div className="relative flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40">
      <div className="space-y-1">
        <Link
          to={`/catalog/${product.id}`}
          state={{ catalogSearch }}
          className="line-clamp-2 font-medium leading-snug after:absolute after:inset-0"
          title={product.name}
        >
          {product.name}
        </Link>
        <div className="truncate text-xs text-muted-foreground" title={product.manufacturer.name}>
          {product.manufacturer.name}
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="line-clamp-1 text-xs" title={product.solution_type_name ?? product.solution_type}>
          {product.solution_type_name ?? product.solution_type}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <ProductStatusBadge status={product.status} />
          <TrlBadge trl={product.trl} />
        </div>
        <ProductBadges badges={product.badges} />
      </div>
      <div className="mt-auto space-y-3">
        <div className="flex items-end justify-between gap-2">
          <PriceFrom price={product.price_from} />
          {product.offers_count !== undefined && (
            <span className="text-xs text-muted-foreground">
              <span className="num">{product.offers_count}</span>{' '}
              {pluralRu(product.offers_count, ['предложение', 'предложения', 'предложений'])}
            </span>
          )}
        </div>
        <CompletenessMeter value={product.completeness} />
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
    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span className="num">
        {from}–{from + shown - 1} из {formatNumber(total)}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeft /> Назад
          </Button>
          <span className="num">
            Страница {page} из {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
            Вперёд <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState, type ReactNode } from 'react'
import { Check, ChevronLeft, ChevronRight, Search, SearchX, X } from 'lucide-react'
import { useLocation, useSearchParams } from 'react-router'
import { useCatalogFacets, useProducts } from '@/entities/catalog'
import { CompareSelectionBar, CompareToggle, useCompareSelection } from '@/features/catalog-compare-selection'
import type { CatalogQuery } from '@/shared/api/keys'
import type { Product } from '@/shared/api/types'
import { formatNumber, formatPct, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Skeleton } from '@/shared/ui/skeleton'
import { EmptyState, ErrorBlock, Spinner } from '@/shared/ui/states'
import { CardChip, CardFigures, RobotCard } from '@/widgets/robot-card'
import { ProductStatusMark, VerifiedMarks } from './parts'

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

  const resetAll = () =>
    update({ q: null, object_type: null, industry: null, solution_type: null, status: null, badge: null })

  return (
    <div className="mx-auto w-full max-w-360 px-6 pt-12 pb-28">
      <div className="mb-8 flex items-baseline gap-3">
        <h1 className="display text-[44px] leading-[1.05] tracking-[-0.035em]">Каталог решений</h1>
        {data && <span className="display num text-[28px] text-ink-4">{formatNumber(data.total)}</span>}
      </div>

      <div className="grid grid-cols-[232px_minmax(0,1fr)] items-start gap-10">
        <aside className="scroll-thin sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1 pb-4">
          <div className="mb-4 flex h-7 items-center justify-between">
            <span className="text-[13px] font-medium text-ink-2">Фильтры</span>
            {activeFilters && (
              <button
                type="button"
                onClick={resetAll}
                className="flex items-center gap-1 text-[12.5px] font-medium text-ink-3 transition-colors hover:text-ink"
              >
                <X size={13} /> Сбросить
              </button>
            )}
          </div>

          {facets.isError && <ErrorBlock error={facets.error} onRetry={() => facets.refetch()} />}
          {facets.isPending && <Skeleton className="h-64 w-full rounded-xl" />}
          {facets.data && (
            <div className="divide-y divide-line">
              <FilterGroup title="Тип объекта">
                <OptionList
                  options={[{ key: ALL, name: 'Любой объект' }, ...(facets.data.object_types ?? [])]}
                  isActive={(key) => (query.object_type ?? ALL) === key}
                  onToggle={(key) => update({ object_type: key === ALL ? null : key })}
                  kind="radio"
                />
              </FilterGroup>
              <FilterGroup title="Отрасль">
                <Select
                  value={query.industry ?? ALL}
                  onValueChange={(value) => update({ industry: value === ALL ? null : value })}
                >
                  <SelectTrigger className="h-9 w-full rounded-lg bg-card" aria-label="Отрасль">
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
                <OptionList
                  options={facets.data.solution_types ?? []}
                  isActive={(key) => (query.solution_type ?? []).includes(key)}
                  onToggle={(key) => toggleIn('solution_type', key)}
                  scroll
                />
              </FilterGroup>
              <FilterGroup title="Стадия">
                <OptionList
                  options={facets.data.statuses ?? []}
                  isActive={(key) => (query.status ?? []).includes(key)}
                  onToggle={(key) => toggleIn('status', key)}
                />
              </FilterGroup>
              <FilterGroup title="Отметки">
                <OptionList
                  options={facets.data.badges ?? []}
                  isActive={(key) => (query.badge ?? []).includes(key)}
                  onToggle={(key) => toggleIn('badge', key)}
                />
              </FilterGroup>
            </div>
          )}
        </aside>

        <div className="min-w-0">
          <div className="mb-5 flex items-center gap-3">
            <SearchBox value={query.q ?? ''} onCommit={(q) => update({ q: q || null })} />
            <Select
              value={query.sort}
              onValueChange={(value) => update({ sort: value === 'relevance' ? null : value })}
            >
              <SelectTrigger
                className="h-11! w-56 rounded-xl bg-card text-[13.5px] shadow-[0_1px_2px_rgba(20,20,24,0.04)]"
                aria-label="Сортировка"
              >
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
          </div>

          {products.isError && <ErrorBlock error={products.error} onRetry={() => products.refetch()} />}
          {products.isPending && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 9 }, (_, i) => (
                <Skeleton key={i} className="aspect-[5/6] rounded-[14px]" />
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
                  <Button variant="outline" onClick={resetAll}>
                    Сбросить фильтры
                  </Button>
                )
              }
            />
          )}
          {data && data.items.length > 0 && (
            <>
              <div
                className={cn(
                  'grid grid-cols-1 gap-4 transition-opacity md:grid-cols-2 xl:grid-cols-3',
                  products.isPlaceholderData && 'opacity-60',
                )}
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
                fetching={products.isFetching}
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
    <label className="relative flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-3" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Название, производитель или описание — например, «AMR» или «Ronavi»"
        className="h-11 w-full rounded-xl bg-card pr-4 pl-11 text-[14.5px] shadow-[0_1px_2px_rgba(20,20,24,0.04)] ring-1 ring-line transition-shadow outline-none placeholder:text-ink-4 focus:ring-2 focus:ring-ink/80"
        aria-label="Поиск по каталогу"
      />
    </label>
  )
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="py-4 first:pt-0">
      <div className="mb-2 text-[12.5px] text-ink-3">{title}</div>
      {children}
    </div>
  )
}

/* Один вид для всех фильтров: строка с отметкой слева и числом справа. Радио — кружок, множественный выбор — квадрат. */
function OptionList({
  options,
  isActive,
  onToggle,
  kind = 'check',
  scroll,
}: {
  options: { key: string; name: string; count?: number }[]
  isActive: (key: string) => boolean
  onToggle: (key: string) => void
  kind?: 'check' | 'radio'
  scroll?: boolean
}) {
  if (!options.length) return <div className="meta">Нет значений</div>
  return (
    <div
      className={cn('-mx-2 space-y-px', scroll && 'scroll-thin max-h-64 overflow-y-auto pr-1')}
      role={kind === 'radio' ? 'radiogroup' : 'group'}
    >
      {options.map((option) => {
        const active = isActive(option.key)
        return (
          <button
            key={option.key}
            type="button"
            role={kind === 'radio' ? 'radio' : 'checkbox'}
            aria-checked={active}
            onClick={() => onToggle(option.key)}
            className={cn(
              'flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13.5px] leading-snug transition-colors',
              active ? 'bg-black/5 font-medium text-ink' : 'text-ink-2 hover:bg-black/4 hover:text-ink',
            )}
          >
            <span
              className={cn(
                'mt-0.5 grid size-3.5 shrink-0 place-items-center transition-colors',
                kind === 'radio' ? 'rounded-full' : 'rounded-[4px]',
                active ? 'bg-ink text-white' : 'bg-card ring-1 ring-line-2',
              )}
            >
              {active &&
                (kind === 'radio' ? (
                  <span className="size-1.5 rounded-full bg-white" />
                ) : (
                  <Check className="size-2.5" strokeWidth={3.5} />
                ))}
            </span>
            <span className="min-w-0 flex-1">{option.name}</span>
            {option.count !== undefined && (
              <span className="num pt-px text-[12px] font-normal text-ink-4">{option.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function ProductCard({ product, catalogSearch }: { product: Product; catalogSearch: string }) {
  const selection = useCompareSelection()
  const offers = product.offers_count ?? 0
  const type = product.solution_type_name ?? product.solution_type
  return (
    <RobotCard
      productId={product.id}
      solutionType={product.solution_type}
      name={product.name}
      to={`/catalog/${product.id}`}
      linkState={{ catalogSearch }}
      subtitle={product.manufacturer.name}
      price={product.price_from}
      chips={
        <CardChip>
          <ProductStatusMark status={product.status} />
        </CardChip>
      }
      corner={<CompareToggle product={product} className="h-7 rounded-full" />}
      cornerPinned={selection.has(product.id)}
      details={
        <>
          <p className="-mt-1.5 mb-2.5 truncate text-[12.5px] text-ink-3" title={type}>
            {type}
          </p>
          <CardFigures
            items={[
              { value: product.trl ?? '—', label: 'УГТ из 9' },
              { value: formatPct(product.completeness, { share: true, digits: 0 }), label: 'полнота данных' },
              { value: formatNumber(offers), label: pluralRu(offers, ['предложение', 'предложения', 'предложений']) },
            ]}
          />
          <VerifiedMarks badges={product.badges} className="mt-2.5" />
        </>
      }
    />
  )
}

function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  shown,
  fetching,
  onPage,
}: {
  page: number
  totalPages: number
  total: number
  pageSize: number
  shown: number
  fetching: boolean
  onPage: (page: number) => void
}) {
  const from = (page - 1) * pageSize + 1
  return (
    <div className="mt-6 flex items-center justify-between gap-3 text-[13px] text-ink-3">
      <span className="num flex items-center gap-2">
        {from}–{from + shown - 1} из {formatNumber(total)}
        {fetching && <Spinner className="size-3.5" />}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            aria-label="Назад"
          >
            <ChevronLeft />
          </Button>
          <span className="num px-2 text-ink-2">
            {page} <span className="text-ink-4">/</span> {totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
            aria-label="Вперёд"
          >
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  )
}

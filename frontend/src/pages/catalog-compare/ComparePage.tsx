import { motion } from 'framer-motion'
import { useState, type ReactNode } from 'react'
import { ArrowLeft, Check, GitCompareArrows, KeyRound, Plus, Trophy, X } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { BADGE_LABEL, SPEC_GROUP_LABEL, SPEC_GROUP_ORDER, useCompare } from '@/entities/catalog'
import { CANDIDATE_STATUS_LABEL } from '@/entities/matching'
import { useProjects } from '@/entities/project'
import { SourceMark } from '@/entities/provenance'
import { useSession } from '@/entities/session'
import { compareSelection, COMPARE_LIMIT } from '@/features/catalog-compare-selection'
import { ProductStatusMark, type CatalogLinkState } from '@/pages/catalog/parts'
import type { CandidateStatus, CompareResult, Product } from '@/shared/api/types'
import { formatNumber, formatValue, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Label } from '@/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { EmptyState, ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { Switch } from '@/shared/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { CardChip, CardFigures, RobotCard } from '@/widgets/robot-card'

type Row = CompareResult['rows'][number]

const NO_PROJECT = '__none'

const BETTER_HINT: Record<NonNullable<Row['better']>, string> = {
  higher: 'лучше — больше',
  lower: 'лучше — меньше',
  none: '',
}

const COMPAT_DOT: Record<CandidateStatus, string> = {
  fit: 'bg-ok',
  check: 'bg-warn',
  excluded: 'bg-crit',
  manual: 'bg-ink-4',
}
const COMPAT_TEXT: Record<CandidateStatus, string> = {
  fit: 'text-ok',
  check: 'text-warn',
  excluded: 'text-crit',
  manual: 'text-ink-2',
}

export function ComparePage() {
  const [params, setParams] = useSearchParams()
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean).slice(0, COMPARE_LIMIT)
  const projectId = params.get('project') ?? undefined
  const compare = useCompare(ids, projectId)

  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )

  const removeProduct = (id: string) => {
    compareSelection.remove(id)
    setParam('ids', ids.filter((i) => i !== id).join(','))
  }

  const header = (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
      <h1 className="display text-[34px] leading-[1.05] tracking-[-0.035em] sm:text-[44px]">Сравнение решений</h1>
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" className="text-ink-3">
          <Link to="/catalog">
            <ArrowLeft /> К каталогу
          </Link>
        </Button>
        {ids.length >= 2 && ids.length < COMPARE_LIMIT && (
          <Button asChild variant="outline" className="bg-card">
            <Link to="/catalog">
              <Plus /> Добавить решение
            </Link>
          </Button>
        )}
      </div>
    </div>
  )

  if (ids.length < 2) {
    return (
      <div className="mx-auto w-full max-w-300 px-4 pt-7 sm:px-6 sm:pt-12 pb-16">
        {header}
        <EmptyState
          icon={<GitCompareArrows className="size-6" />}
          title="Выберите хотя бы два решения"
          description={`Отметьте «Сравнить» у 2–${COMPARE_LIMIT} решений в каталоге.`}
          action={
            <Button asChild>
              <Link to="/catalog">Открыть каталог</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-300 px-4 pt-7 sm:px-6 sm:pt-12 pb-16">
      {header}
      {compare.isPending && <LoadingBlock rows={6} />}
      {compare.isError && <ErrorBlock error={compare.error} onRetry={() => compare.refetch()} />}
      {compare.data && (
        <CompareTable
          result={compare.data}
          projectId={projectId}
          fetching={compare.isFetching}
          onRemove={removeProduct}
          picker={<ProjectPicker value={projectId} onChange={(value) => setParam('project', value)} />}
        />
      )}
    </div>
  )
}

function ProjectPicker({ value, onChange }: { value?: string; onChange: (value: string | null) => void }) {
  const { status } = useSession()
  if (status !== 'authenticated') return null
  return <AuthenticatedProjectPicker value={value} onChange={onChange} />
}

function AuthenticatedProjectPicker({ value, onChange }: { value?: string; onChange: (value: string | null) => void }) {
  const projects = useProjects()
  const items = projects.data?.items ?? []
  if (!projects.isPending && items.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 max-sm:w-full">
      <Label htmlFor="compare-project" className="text-[13px] font-normal text-ink-3">
        Совместимость с объектом
      </Label>
      <Select value={value ?? NO_PROJECT} onValueChange={(next) => onChange(next === NO_PROJECT ? null : next)}>
        <SelectTrigger id="compare-project" className="h-9 w-72 rounded-lg bg-card max-sm:w-full">
          <SelectValue placeholder="Проект" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_PROJECT}>Без проекта</SelectItem>
          {items.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function hasValue(row: Row, id: string) {
  const spec = row.values[id]
  return spec !== undefined && spec.value !== null && spec.value !== ''
}

function differs(row: Row, products: Product[]) {
  const seen = new Set(products.map((p) => JSON.stringify(row.values[p.id]?.value ?? null)))
  return seen.size > 1
}

// Цвет решения один на всей странице: полоска на карточке и столбики во всех графиках.
const PRODUCT_COLORS = ['#3d3d44', '#d18a1f', '#447e4c', '#4f6fae', '#9a5b86']

const shortName = (name: string) => name.split(' (')[0]

const isNumericRow = (row: Row, products: Product[]) =>
  products.some((p) => typeof row.values[p.id]?.value === 'number')

function CompareTable({
  result,
  projectId,
  fetching,
  onRemove,
  picker,
}: {
  result: CompareResult
  projectId?: string
  fetching: boolean
  onRemove: (id: string) => void
  picker: ReactNode
}) {
  const [onlyDiff, setOnlyDiff] = useState(false)
  const products = result.products
  const colors = new Map(products.map((p, i) => [p.id, PRODUCT_COLORS[i % PRODUCT_COLORS.length]]))
  const filledRows = result.rows.filter((row) => products.some((p) => hasValue(row, p.id)))
  const hiddenEmpty = result.rows.length - filledRows.length
  const rows = onlyDiff ? filledRows.filter((row) => differs(row, products)) : filledRows
  // Внутри группы сначала графики, потом текстовые характеристики — сетка не рвётся длинными строками.
  const groups = SPEC_GROUP_ORDER.map((group) => {
    const inGroup = rows.filter((r) => r.group === group)
    return {
      group,
      rows: [...inGroup.filter((r) => isNumericRow(r, products)), ...inGroup.filter((r) => !isNumericRow(r, products))],
    }
  }).filter((g) => g.rows.length > 0)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        {picker}
        {fetching && <Spinner className="size-3.5 text-ink-3" />}
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
          <Switch checked={onlyDiff} onCheckedChange={setOnlyDiff} />
          Только различия
        </label>
      </div>

      {/* На узком экране карточки не сжимаются в столбики, а листаются вбок лентой; с md — сетка как раньше. */}
      <div
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 md:mx-0 md:grid md:gap-4 md:overflow-visible md:px-0 md:pb-0"
        style={{ gridTemplateColumns: `repeat(${products.length}, minmax(0, 1fr))` }}
      >
        {products.map((product) => (
          <div key={product.id} className="w-[78%] max-w-80 shrink-0 snap-start md:w-auto md:max-w-none md:min-w-0">
            <ProductSummary
              product={product}
              color={colors.get(product.id)!}
              compatibility={projectId ? (result.compatibility?.[product.id] ?? null) : undefined}
              onRemove={() => onRemove(product.id)}
            />
          </div>
        ))}
      </div>

      <div className="mt-8 mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-ink-3 sm:mt-10">
        <span className="inline-flex items-center gap-1.5">
          <Trophy className="size-3.5 text-ok" /> лучшее значение
        </span>
        <span className="inline-flex items-center gap-1.5">
          <KeyRound className="size-3.5 text-warn" /> ключевое для подбора
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-ok" /> подтверждено
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-warn" /> заявка производителя — источник в подсказке у точки
        </span>
      </div>

      {groups.map(({ group, rows: groupRows }) => (
        <section key={group} className="mb-8">
          <h2 className="mb-3 text-[15px] font-semibold tracking-[-0.01em]">
            {SPEC_GROUP_LABEL[group]} <span className="num font-normal text-ink-4">{groupRows.length}</span>
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {groupRows.map((row) =>
              isNumericRow(row, products) ? (
                <SpecChart key={row.spec_key} row={row} products={products} colors={colors} />
              ) : (
                <SpecText key={row.spec_key} row={row} products={products} colors={colors} />
              ),
            )}
          </div>
        </section>
      ))}
      {groups.length === 0 && (
        <div className="card p-8 text-center text-ink-3">
          {onlyDiff ? 'Все заполненные характеристики совпадают' : 'У выбранных решений нет характеристик'}
        </div>
      )}
      {hiddenEmpty > 0 && (
        <p className="meta">
          Скрыто характеристик без данных у всех решений: <span className="num text-ink-2">{hiddenEmpty}</span>
        </p>
      )}
    </div>
  )
}

function ProductSummary({
  product,
  color,
  compatibility,
  onRemove,
}: {
  product: Product
  color: string
  compatibility?: CandidateStatus | null
  onRemove: () => void
}) {
  const location = useLocation()
  const offers = product.offers_count ?? 0
  const type = product.solution_type_name ?? product.solution_type
  return (
    <RobotCard
      productId={product.id}
      solutionType={product.solution_type}
      name={product.name}
      to={`/catalog/${product.id}`}
      linkState={
        { back: { to: `${location.pathname}${location.search}`, label: 'К сравнению' } } satisfies CatalogLinkState
      }
      subtitle={product.manufacturer.name}
      price={product.price_from}
      // Высота постоянная: при 2 решениях в колонке пропорция 5:6 из каталога даёт карточку выше экрана.
      className="aspect-auto h-85"
      // Цвет продукта — тот же, что у его столбиков на графиках ниже.
      accent={color}
      chips={
        <>
          <CardChip>
            <ProductStatusMark status={product.status} />
          </CardChip>
          {compatibility && (
            <CardChip>
              <span className={cn('size-1.5 rounded-full', COMPAT_DOT[compatibility])} />
              <span className={COMPAT_TEXT[compatibility]}>{CANDIDATE_STATUS_LABEL[compatibility]}</span>
            </CardChip>
          )}
        </>
      }
      corner={
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Убрать «${product.name}» из сравнения`}
          title="Убрать из сравнения"
          className="grid size-7 place-items-center rounded-full bg-white/90 text-ink-3 transition-colors hover:bg-white hover:text-ink pointer-coarse:size-9"
        >
          <X className="size-3.5" />
        </button>
      }
      details={
        <>
          <p className="-mt-1.5 mb-2.5 truncate text-[12.5px] text-ink-3" title={type}>
            {type}
          </p>
          <CardFigures
            items={[
              { value: product.trl ?? '—', label: 'УГТ из 9' },
              { value: formatNumber(offers), label: pluralRu(offers, ['предложение', 'предложения', 'предложений']) },
              ...(compatibility !== undefined
                ? [
                    {
                      value: compatibility ? CANDIDATE_STATUS_LABEL[compatibility].toLowerCase() : 'нет данных',
                      label: 'с объектом',
                    },
                  ]
                : []),
            ]}
          />
          {product.badges.length > 0 && (
            <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-ink-2">
              {product.badges.map((badge) => (
                <li key={badge} className="inline-flex items-center gap-1">
                  <Check className="size-3.5 shrink-0 text-ok" strokeWidth={2.5} />
                  {BADGE_LABEL[badge]}
                </li>
              ))}
            </ul>
          )}
        </>
      }
    />
  )
}

function SpecHead({ row }: { row: Row }) {
  const isKey = Object.values(row.values).some((spec) => spec?.is_key_constraint)
  const hint = row.better ? BETTER_HINT[row.better] : ''
  return (
    <div className="mb-3.5 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1.5 text-[13.5px] leading-snug font-medium">
        <span className="min-w-0">{row.name}</span>
        {isKey && (
          <Tooltip>
            <TooltipTrigger asChild>
              <KeyRound className="size-3.5 shrink-0 text-warn" aria-label="Ключевое ограничение для подбора" />
            </TooltipTrigger>
            <TooltipContent>Ключевое ограничение для подбора</TooltipContent>
          </Tooltip>
        )}
      </div>
      {(row.unit || hint) && (
        <span className="shrink-0 pt-px text-[12px] text-ink-4">{[row.unit, hint].filter(Boolean).join(' · ')}</span>
      )}
    </div>
  )
}

function ProductLabel({ product, color }: { product: Product; color: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-2" title={product.name}>
      <span className="size-2 shrink-0 rounded-[2px]" style={{ background: color }} />
      <span className="truncate">{shortName(product.name)}</span>
    </span>
  )
}

/* Числовая характеристика — горизонтальные столбики по решениям от общего нуля, у лучшего кубок. */
function SpecChart({ row, products, colors }: { row: Row; products: Product[]; colors: Map<string, string> }) {
  const numbers = products.map((p) => row.values[p.id]?.value).filter((v): v is number => typeof v === 'number')
  // Шкала от общего нуля: отрицательные значения (температура) уходят влево от нулевой отметки.
  const lo = Math.min(...numbers, 0)
  const hi = Math.max(...numbers, 0)
  const span = hi - lo || 1
  const zero = (-lo / span) * 100
  return (
    <div className="card px-5 pt-4 pb-4.5">
      <SpecHead row={row} />
      <div className="space-y-2.5">
        {products.map((product) => {
          const spec = row.values[product.id]
          const value = spec?.value
          const best = row.best_product_id === product.id
          return (
            <div
              key={product.id}
              className="grid grid-cols-[minmax(0,6rem)_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)]"
            >
              <ProductLabel product={product} color={colors.get(product.id)!} />
              <div className="flex min-w-0 items-center gap-2.5">
                {typeof value === 'number' ? (
                  <>
                    <div className="relative h-3 min-w-0 flex-1 overflow-hidden rounded-[3px] bg-black/4.5">
                      {lo < 0 && <span className="absolute inset-y-0 w-px bg-ink-4" style={{ left: `${zero}%` }} />}
                      <motion.div
                        className="absolute inset-y-0 rounded-[3px]"
                        style={{
                          background: colors.get(product.id),
                          left: `${value < 0 ? zero - (-value / span) * 100 : zero}%`,
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max((Math.abs(value) / span) * 100, value !== 0 ? 2 : 0)}%` }}
                        transition={{ type: 'spring', stiffness: 140, damping: 24 }}
                      />
                    </div>
                    <span
                      className={cn(
                        'num flex shrink-0 items-center gap-1 text-[13px]',
                        best ? 'font-semibold text-ok' : 'text-ink',
                      )}
                    >
                      {best && <Trophy className="size-3.5" aria-label="Лучшее значение" />}
                      {formatValue(value, spec?.unit ?? row.unit)}
                      {spec && <SourceMark provenance={spec.provenance} compact />}
                    </span>
                  </>
                ) : spec && hasValue(row, product.id) ? (
                  <span className="flex min-w-0 items-center gap-1.5 text-[13px]">
                    <span className="truncate">{formatValue(value ?? null, spec.unit ?? row.unit)}</span>
                    <SourceMark provenance={spec.provenance} compact />
                  </span>
                ) : (
                  <>
                    <div className="h-3 flex-1 rounded-[3px] border border-dashed border-line-2" />
                    <span className="shrink-0 text-[12.5px] text-ink-4">нет данных</span>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* Текстовая характеристика — значение каждого решения строкой в той же карточке. */
function SpecText({ row, products, colors }: { row: Row; products: Product[]; colors: Map<string, string> }) {
  return (
    <div className="card px-5 pt-4 pb-4.5">
      <SpecHead row={row} />
      <ul className="space-y-2.5">
        {products.map((product) => {
          const spec = row.values[product.id]
          return (
            <li
              key={product.id}
              className="grid grid-cols-[minmax(0,6rem)_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)]"
            >
              <span className="pt-px">
                <ProductLabel product={product} color={colors.get(product.id)!} />
              </span>
              {spec && hasValue(row, product.id) ? (
                <span className="flex min-w-0 items-start gap-1.5 text-[13px] leading-snug">
                  <span className="min-w-0 break-words">{formatValue(spec.value, spec.unit ?? row.unit)}</span>
                  <SourceMark provenance={spec.provenance} compact />
                </span>
              ) : (
                <span className="text-[12.5px] text-ink-4">нет данных</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

import { Fragment, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, GitCompareArrows, KeyRound, Plus, Trophy, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { BADGE_LABEL, SPEC_GROUP_LABEL, SPEC_GROUP_ORDER, useCompare } from '@/entities/catalog'
import { CANDIDATE_STATUS_LABEL } from '@/entities/matching'
import { useProjects } from '@/entities/project'
import { PROVENANCE_HINT, PROVENANCE_LABEL, PROVENANCE_TONE, SOURCE_KIND_LABEL } from '@/entities/provenance'
import { useSession } from '@/entities/session'
import { compareSelection, COMPARE_LIMIT } from '@/features/catalog-compare-selection'
import { ProductStatusMark } from '@/pages/catalog/parts'
import type { CandidateStatus, CompareResult, Product, Provenance } from '@/shared/api/types'
import { formatDate, formatNumber, formatRub, formatValue, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Label } from '@/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { EmptyState, ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { Switch } from '@/shared/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'

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
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <h1 className="display text-[44px] leading-[1.05] tracking-[-0.035em]">Сравнение решений</h1>
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
      <div className="mx-auto w-full max-w-360 px-6 pt-12 pb-16">
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
    <div className="mx-auto w-full max-w-360 px-6 pt-12 pb-16">
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
    <div className="flex items-center gap-2.5">
      <Label htmlFor="compare-project" className="text-[13px] font-normal text-ink-3">
        Совместимость с объектом
      </Label>
      <Select value={value ?? NO_PROJECT} onValueChange={(next) => onChange(next === NO_PROJECT ? null : next)}>
        <SelectTrigger id="compare-project" className="h-9 w-72 rounded-lg bg-card">
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
  const compatibility = result.compatibility
  const filledRows = result.rows.filter((row) => products.some((p) => hasValue(row, p.id)))
  const hiddenEmpty = result.rows.length - filledRows.length
  const rows = onlyDiff ? filledRows.filter((row) => differs(row, products)) : filledRows
  const groups = SPEC_GROUP_ORDER.map((group) => ({ group, rows: rows.filter((r) => r.group === group) })).filter(
    (g) => g.rows.length > 0,
  )
  const cols = products.length + 1

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        {picker}
        {fetching && <Spinner className="size-3.5 text-ink-3" />}
        <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <Trophy className="size-3.5 text-ok" /> лучшее значение в строке
          </span>
          <span className="inline-flex items-center gap-1.5">
            <KeyRound className="size-3.5 text-warn" /> ключевое для подбора
          </span>
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
            <Switch checked={onlyDiff} onCheckedChange={setOnlyDiff} />
            Только различия
          </label>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[900px] table-fixed border-collapse text-[13.5px]">
            <colgroup>
              <col className="w-64" />
              {products.map((p) => (
                <col key={p.id} />
              ))}
            </colgroup>
            <thead>
              <tr className="align-top">
                <th className="sticky left-0 z-10 bg-card px-5 pt-4.5 pb-4 text-left align-bottom text-[12.5px] font-normal text-ink-3">
                  <span className="num text-ink">{products.length}</span>{' '}
                  {pluralRu(products.length, ['решение', 'решения', 'решений'])}
                </th>
                {products.map((product) => (
                  <th key={product.id} className="group/head px-5 pt-4.5 pb-4 text-left font-normal">
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className="meta min-w-0 truncate"
                        title={product.solution_type_name ?? product.solution_type}
                      >
                        {product.solution_type_name ?? product.solution_type}
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemove(product.id)}
                        aria-label={`Убрать «${product.name}» из сравнения`}
                        title="Убрать из сравнения"
                        className="-mt-1 -mr-1.5 grid size-6 shrink-0 place-items-center rounded-md text-ink-4 transition-colors hover:bg-black/6 hover:text-ink"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                    <Link
                      to={`/catalog/${product.id}`}
                      className="mt-0.5 line-clamp-2 text-[15px] leading-snug font-semibold tracking-[-0.01em] hover:underline"
                    >
                      {product.name}
                    </Link>
                    <div className="mt-0.5 truncate text-[13px] text-ink-3" title={product.manufacturer.name}>
                      {product.manufacturer.name}
                    </div>
                    <div className="num mt-3 text-[17px] leading-tight font-semibold tracking-[-0.01em]">
                      от {formatRub(product.price_from.amount_rub)}
                    </div>
                    <div className="meta">{product.price_from.vat_included === false ? 'без НДС' : 'с НДС'}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <GroupHeader cols={cols}>Сводка</GroupHeader>
              <SummaryRow label="Стадия" products={products}>
                {(p) => <ProductStatusMark status={p.status} />}
              </SummaryRow>
              <SummaryRow label="Уровень готовности (УГТ)" products={products}>
                {(p) => <span className="num">{p.trl ?? '—'}</span>}
              </SummaryRow>
              <SummaryRow label="Предложений в каталоге" products={products}>
                {(p) => <span className="num">{formatNumber(p.offers_count ?? null)}</span>}
              </SummaryRow>
              <SummaryRow label="Отметки" products={products}>
                {(p) =>
                  p.badges.length ? (
                    <ul className="space-y-0.5 text-[12.5px] text-ink-2">
                      {p.badges.map((badge) => (
                        <li key={badge} className="flex items-center gap-1.5">
                          <Check className="size-3.5 shrink-0 text-ok" strokeWidth={2.5} />
                          {BADGE_LABEL[badge]}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-ink-4">—</span>
                  )
                }
              </SummaryRow>
              {projectId && (
                <SummaryRow label="Совместимость с объектом" products={products}>
                  {(p) => {
                    const status = compatibility?.[p.id]
                    if (!status) return <span className="text-ink-4">нет данных</span>
                    return (
                      <span className={cn('inline-flex items-center gap-1.5 font-medium', COMPAT_TEXT[status])}>
                        <span className={cn('size-1.5 rounded-full', COMPAT_DOT[status])} />
                        {CANDIDATE_STATUS_LABEL[status]}
                      </span>
                    )
                  }}
                </SummaryRow>
              )}

              {groups.map(({ group, rows: groupRows }) => (
                <Fragment key={group}>
                  <GroupHeader cols={cols}>{SPEC_GROUP_LABEL[group]}</GroupHeader>
                  {groupRows.map((row) => (
                    <SpecRow key={row.spec_key} row={row} products={products} />
                  ))}
                </Fragment>
              ))}
              {groups.length === 0 && (
                <tr>
                  <td colSpan={cols} className="hairline p-8 text-center text-ink-3">
                    {onlyDiff ? 'Все заполненные характеристики совпадают' : 'У выбранных решений нет характеристик'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {hiddenEmpty > 0 && (
          <div className="hairline bg-surface-2 px-5 py-3 text-[12.5px] text-ink-3">
            Скрыто характеристик без данных у всех решений: <span className="num text-ink-2">{hiddenEmpty}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function GroupHeader({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="hairline bg-surface-2 px-5 pt-4 pb-2 text-[13px] font-semibold text-ink">
        {children}
      </td>
    </tr>
  )
}

function SummaryRow({
  label,
  products,
  children,
}: {
  label: string
  products: Product[]
  children: (product: Product) => ReactNode
}) {
  return (
    <tr className="hairline align-top">
      <td className="sticky left-0 z-10 bg-card px-5 py-3 text-ink-2">{label}</td>
      {products.map((product) => (
        <td key={product.id} className="px-5 py-3">
          {children(product)}
        </td>
      ))}
    </tr>
  )
}

function SpecRow({ row, products }: { row: Row; products: Product[] }) {
  const isKey = Object.values(row.values).some((spec) => spec?.is_key_constraint)
  const hint = row.better ? BETTER_HINT[row.better] : ''
  return (
    <tr className="hairline align-top">
      <td className="sticky left-0 z-10 bg-card px-5 py-3">
        <div className="flex items-center gap-1.5 text-ink-2">
          <span>{row.name}</span>
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
          <div className="mt-0.5 text-[12px] text-ink-4">{[row.unit, hint].filter(Boolean).join(' · ')}</div>
        )}
      </td>
      {products.map((product) => {
        const spec = row.values[product.id]
        const best = row.best_product_id === product.id
        return (
          <td key={product.id} className="relative px-5 py-3">
            {best && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-1 rounded-[10px] border-[1.5px] border-ok/70"
              />
            )}
            {spec && hasValue(row, product.id) ? (
              <div className="space-y-1">
                <div
                  className={cn(
                    'num flex items-start gap-1.5 break-words',
                    best ? 'font-semibold text-ok' : 'text-ink',
                  )}
                >
                  {best && <Trophy className="mt-0.5 size-3.5 shrink-0" aria-label="Лучшее значение" />}
                  <span className="min-w-0">{formatValue(spec.value, spec.unit ?? row.unit)}</span>
                </div>
                <SourceMark provenance={spec.provenance} />
              </div>
            ) : (
              <span className="text-ink-4">нет данных</span>
            )}
          </td>
        )
      })}
    </tr>
  )
}

const SOURCE_DOT = { ok: 'bg-ok', info: 'bg-info', warn: 'bg-warn', crit: 'bg-crit', muted: 'bg-ink-4' } as const

/* Происхождение значения точкой и подписью вместо плашки: в таблице их десятки. Источник — в подсказке. */
function SourceMark({ provenance }: { provenance: Provenance }) {
  const tone = PROVENANCE_TONE[provenance.status]
  const source = provenance.source
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex cursor-help items-center gap-1.5 text-[12px] whitespace-nowrap',
            tone === 'crit' ? 'text-crit' : tone === 'warn' ? 'text-warn' : 'text-ink-3',
          )}
        >
          <span className={cn('size-1.5 shrink-0 rounded-full', SOURCE_DOT[tone])} />
          {PROVENANCE_LABEL[provenance.status]}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm space-y-1 text-left">
        <div className="font-medium">{PROVENANCE_HINT[provenance.status]}</div>
        {source && (
          <div>
            {SOURCE_KIND_LABEL[source.kind]}: {source.title}
            {source.retrieved_at && <span className="opacity-70"> · {formatDate(source.retrieved_at)}</span>}
          </div>
        )}
        {provenance.note && <div className="opacity-80">{provenance.note}</div>}
      </TooltipContent>
    </Tooltip>
  )
}

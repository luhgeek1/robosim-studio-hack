import { Fragment, useState, type ReactNode } from 'react'
import { ArrowLeft, GitCompareArrows, KeyRound, Plus, Trophy, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { SPEC_GROUP_LABEL, SPEC_GROUP_ORDER, useCompare } from '@/entities/catalog'
import { CANDIDATE_STATUS_LABEL } from '@/entities/matching'
import { useProjects } from '@/entities/project'
import { ProvenanceBadge } from '@/entities/provenance'
import { useSession } from '@/entities/session'
import { compareSelection, COMPARE_LIMIT } from '@/features/catalog-compare-selection'
import { PriceFrom, ProductBadges, ProductStatusBadge } from '@/pages/catalog/parts'
import type { CandidateStatus, CompareResult, Product } from '@/shared/api/types'
import { formatNumber, formatValue } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Label } from '@/shared/ui/label'
import { PageHeader } from '@/shared/ui/page'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { EmptyState, ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { Switch } from '@/shared/ui/switch'
import { ToneBadge, type Tone } from '@/shared/ui/tone'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'

type Row = CompareResult['rows'][number]

const NO_PROJECT = '__none'

const BETTER_HINT: Record<NonNullable<Row['better']>, string> = {
  higher: 'лучше — больше',
  lower: 'лучше — меньше',
  none: '',
}

const COMPAT_TONE: Record<CandidateStatus, Tone> = { fit: 'ok', check: 'warn', excluded: 'crit', manual: 'info' }

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
    <PageHeader
      title="Сравнение решений"
      description="Характеристики из карточек каталога с источниками; подсвечено лучшее значение в строке"
      actions={
        <Button asChild variant="outline">
          <Link to="/catalog">
            <ArrowLeft /> К каталогу
          </Link>
        </Button>
      }
    />
  )

  if (ids.length < 2) {
    return (
      <div className="mx-auto w-full max-w-6xl p-6">
        {header}
        <EmptyState
          icon={<GitCompareArrows className="size-6" />}
          title="Выберите хотя бы два решения"
          description={`Отметьте «В сравнение» у 2–${COMPARE_LIMIT} решений в каталоге и нажмите «Сравнить».`}
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
    <div className="mx-auto w-full max-w-[1400px] p-6">
      {header}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <ProjectPicker value={projectId} onChange={(value) => setParam('project', value)} />
        {compare.isFetching && !compare.isPending && <Spinner className="text-muted-foreground" />}
        {ids.length < COMPARE_LIMIT && (
          <Button asChild variant="ghost" size="sm" className="ml-auto">
            <Link to="/catalog">
              <Plus /> Добавить решение
            </Link>
          </Button>
        )}
      </div>
      {compare.isPending && <LoadingBlock rows={6} />}
      {compare.isError && <ErrorBlock error={compare.error} onRetry={() => compare.refetch()} />}
      {compare.data && <CompareTable result={compare.data} projectId={projectId} onRemove={removeProduct} />}
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
    <div className="flex items-center gap-2">
      <Label htmlFor="compare-project" className="text-muted-foreground">
        Проверить совместимость с объектом
      </Label>
      <Select value={value ?? NO_PROJECT} onValueChange={(next) => onChange(next === NO_PROJECT ? null : next)}>
        <SelectTrigger id="compare-project" className="w-72">
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
  onRemove,
}: {
  result: CompareResult
  projectId?: string
  onRemove: (id: string) => void
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <Switch checked={onlyDiff} onCheckedChange={setOnlyDiff} />
          Только различия
        </label>
        <span className="inline-flex items-center gap-1.5">
          <Trophy className="size-3.5 text-ok" /> лучшее значение в строке
        </span>
        <span className="inline-flex items-center gap-1.5">
          <KeyRound className="size-3.5 text-primary" /> ключевое ограничение для подбора
        </span>
        {hiddenEmpty > 0 && (
          <span>
            Скрыто характеристик без данных у всех решений: <span className="num">{hiddenEmpty}</span>
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-surface">
        <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-60" />
            {products.map((p) => (
              <col key={p.id} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b align-top">
              <th className="sticky left-0 z-10 bg-surface p-3 text-left text-xs font-medium text-muted-foreground">
                Решение
              </th>
              {products.map((product) => (
                <th key={product.id} className="border-l p-3 text-left font-normal">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/catalog/${product.id}`} className="line-clamp-2 font-medium hover:underline">
                      {product.name}
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => onRemove(product.id)}
                      aria-label={`Убрать «${product.name}» из сравнения`}
                      title="Убрать из сравнения"
                    >
                      <X />
                    </Button>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground" title={product.manufacturer.name}>
                    {product.manufacturer.name}
                  </div>
                  <PriceFrom price={product.price_from} className="mt-2" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <GroupHeader cols={cols}>Сводка</GroupHeader>
            <SummaryRow label="Тип решения" products={products}>
              {(p) => p.solution_type_name ?? p.solution_type}
            </SummaryRow>
            <SummaryRow label="Стадия" products={products}>
              {(p) => <ProductStatusBadge status={p.status} />}
            </SummaryRow>
            <SummaryRow label="Уровень готовности (УГТ)" products={products}>
              {(p) => <span className="num">{p.trl ?? '—'}</span>}
            </SummaryRow>
            <SummaryRow label="Предложений в каталоге" products={products}>
              {(p) => <span className="num">{formatNumber(p.offers_count ?? null)}</span>}
            </SummaryRow>
            <SummaryRow label="Отметки" products={products}>
              {(p) => (p.badges.length ? <ProductBadges badges={p.badges} /> : '—')}
            </SummaryRow>
            {projectId && (
              <SummaryRow label="Совместимость с объектом" products={products}>
                {(p) => {
                  const status = compatibility?.[p.id]
                  if (!status) return <span className="text-xs text-muted-foreground">нет данных от сервера</span>
                  return <ToneBadge tone={COMPAT_TONE[status]}>{CANDIDATE_STATUS_LABEL[status]}</ToneBadge>
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
                <td colSpan={cols} className="p-6 text-center text-muted-foreground">
                  {onlyDiff ? 'Все заполненные характеристики совпадают' : 'У выбранных решений нет характеристик'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function GroupHeader({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <tr className="border-b bg-raised/60">
      <td colSpan={cols} className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
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
    <tr className="border-b last:border-b-0">
      <td className="sticky left-0 z-10 bg-surface px-3 py-2 text-muted-foreground">{label}</td>
      {products.map((product) => (
        <td key={product.id} className="border-l px-3 py-2">
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
    <tr className="border-b align-top last:border-b-0">
      <td className="sticky left-0 z-10 bg-surface px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span>{row.name}</span>
          {isKey && (
            <Tooltip>
              <TooltipTrigger asChild>
                <KeyRound className="size-3.5 shrink-0 text-primary" aria-label="Ключевое ограничение для подбора" />
              </TooltipTrigger>
              <TooltipContent>Ключевое ограничение для подбора</TooltipContent>
            </Tooltip>
          )}
        </div>
        {(row.unit || hint) && (
          <div className="text-xs text-muted-foreground">{[row.unit, hint].filter(Boolean).join(', ')}</div>
        )}
      </td>
      {products.map((product) => {
        const spec = row.values[product.id]
        const best = row.best_product_id === product.id
        return (
          <td key={product.id} className={cn('border-l px-3 py-2', best && 'bg-ok-soft')}>
            {spec && hasValue(row, product.id) ? (
              <div className="space-y-1">
                <div className={cn('num flex items-start gap-1.5 break-words', best && 'font-semibold text-ok')}>
                  {best && <Trophy className="mt-0.5 size-3.5 shrink-0" aria-label="Лучшее значение" />}
                  <span className="min-w-0">{formatValue(spec.value, spec.unit ?? row.unit)}</span>
                </div>
                <ProvenanceBadge provenance={spec.provenance} />
              </div>
            ) : (
              <span className="text-muted-foreground">нет данных</span>
            )}
          </td>
        )
      })}
    </tr>
  )
}

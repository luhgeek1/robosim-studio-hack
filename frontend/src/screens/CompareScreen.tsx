import { Fragment, useState, type ReactNode } from 'react'
import { ArrowLeft, Plus, X } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useCompare } from '@/api/catalog'
import { CANDIDATE_STATUS_LABEL } from '@/api/matching'
import { useProjects } from '@/api/projects'
import { useSession } from '@/api/sessionContext'
import type { CandidateStatus, CompareResult, Product } from '@/api/types'
import { COMPARE_LIMIT, compareSelection } from '@/components/catalog/compareSelection'
import { BadgePills, CompletenessBar, KeyMark, PriceFrom, StatusPill } from '@/components/catalog/parts'
import { shortProductName } from '@/components/catalog/names'
import { SourceDot } from '@/components/Provenance'
import { Empty, ErrorState, Loading } from '@/components/States'
import { Button, Pill, Segmented, Select, type Tone } from '@/components/ui'
import { formatValue, pluralRu } from '@/lib/format'
import { SPEC_GROUP_LABEL, SPEC_GROUP_ORDER } from '@/lib/labels'

type Row = CompareResult['rows'][number]

const BETTER_HINT: Record<NonNullable<Row['better']>, string> = {
  higher: 'лучше больше',
  lower: 'лучше меньше',
  none: '',
}

const COMPAT_TONE: Record<CandidateStatus, Tone> = { fit: 'ok', check: 'warn', excluded: 'crit', manual: 'accent' }

const hasValue = (row: Row, id: string) => {
  const spec = row.values[id]
  return spec !== undefined && spec.value !== null && spec.value !== ''
}

const differs = (row: Row, products: Product[]) =>
  new Set(products.map((p) => JSON.stringify(row.values[p.id]?.value ?? null))).size > 1

export function CompareScreen() {
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
  const remove = (id: string) => {
    compareSelection.remove(id)
    setParam('ids', ids.filter((i) => i !== id).join(','))
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 pt-8 pb-16">
      <Link
        to="/catalog"
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink"
      >
        <ArrowLeft size={14} /> К каталогу
      </Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[780px]">
          <div className="meta mb-2">Сравнение решений</div>
          <h1 className="h1">{headline(compare.data)}</h1>
          <p className="mt-3 text-[15.5px] leading-relaxed text-ink-2">
            Характеристики из карточек каталога, у каждого значения — источник. Зелёным отмечено лучшее значение в
            строке, если понятно, что лучше.
          </p>
        </div>
        <ProjectPicker value={projectId} onChange={(value) => setParam('project', value)} />
      </div>

      {ids.length < 2 ? (
        <Empty
          title="Выберите хотя бы два решения"
          action={
            <Link to="/catalog">
              <Button variant="primary">Открыть каталог</Button>
            </Link>
          }
        >
          Отметьте «В сравнение» у 2–{COMPARE_LIMIT} решений в каталоге и нажмите «Сравнить».
        </Empty>
      ) : (
        <>
          {compare.isPending && <Loading label="Собираем таблицу…" />}
          {compare.isError && <ErrorState error={compare.error} onRetry={() => compare.refetch()} />}
          {compare.data && (
            <CompareTable
              result={compare.data}
              projectId={projectId}
              canAdd={ids.length < COMPARE_LIMIT}
              onRemove={remove}
            />
          )}
        </>
      )}
    </div>
  )
}

// The headline names the leader by the number of best values: a composition of API flags, not a new score.
function headline(result: CompareResult | undefined): string {
  if (!result) return 'Сравнение решений'
  const wins = new Map<string, number>()
  for (const row of result.rows)
    if (row.best_product_id) wins.set(row.best_product_id, (wins.get(row.best_product_id) ?? 0) + 1)
  const [leaderId, count] = [...wins.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
  const leader = result.products.find((p) => p.id === leaderId)
  const tie = [...wins.values()].filter((v) => v === count).length > 1
  const n = result.products.length
  if (!leader || !count || tie)
    return `${n} ${pluralRu(n, ['решение', 'решения', 'решений'])} рядом: характеристики и источники`
  const comparable = result.rows.filter((r) => r.best_product_id).length
  return `${shortProductName(leader.name)}: лучшее значение в ${count} из ${comparable} сравнимых характеристик`
}

function ProjectPicker({ value, onChange }: { value?: string; onChange: (value: string | null) => void }) {
  const { status } = useSession()
  if (status !== 'authenticated') return null
  return <AuthenticatedProjectPicker value={value} onChange={onChange} />
}

function AuthenticatedProjectPicker({ value, onChange }: { value?: string; onChange: (value: string | null) => void }) {
  const projects = useProjects()
  const items = projects.data?.items ?? []
  if (!items.length) return null
  return (
    <label className="block w-[300px]">
      <span className="meta mb-1.5 block">Проверить совместимость с объектом</span>
      <Select
        ariaLabel="Проект для проверки совместимости"
        value={value ?? ''}
        onChange={(next) => onChange(next || null)}
        options={[{ value: '', label: 'Без проекта' }, ...items.map((p) => ({ value: p.id, label: p.name }))]}
      />
    </label>
  )
}

function CompareTable({
  result,
  projectId,
  canAdd,
  onRemove,
}: {
  result: CompareResult
  projectId?: string
  canAdd: boolean
  onRemove: (id: string) => void
}) {
  const navigate = useNavigate()
  const [onlyDiff, setOnlyDiff] = useState<'all' | 'diff'>('all')
  const products = result.products
  const filled = result.rows.filter((row) => products.some((p) => hasValue(row, p.id)))
  const hiddenEmpty = result.rows.length - filled.length
  const rows = onlyDiff === 'diff' ? filled.filter((row) => differs(row, products)) : filled
  const groups = SPEC_GROUP_ORDER.map((group) => ({ group, rows: rows.filter((r) => r.group === group) })).filter(
    (g) => g.rows.length > 0,
  )
  // The backend may not know compatibility for every product (or at all) — then the row is omitted.
  const compatibility = projectId && result.compatibility && Object.keys(result.compatibility).length > 0
  const cols = products.length + 1

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Segmented
          size="sm"
          layoutId="compare-diff"
          value={onlyDiff}
          onChange={setOnlyDiff}
          options={[
            { value: 'all', label: 'Все характеристики' },
            { value: 'diff', label: 'Только различия' },
          ]}
        />
        <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-ok-soft ring-1 ring-ok/30" /> лучшее значение
        </span>
        <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
          <KeyMark /> ключевое ограничение подбора
        </span>
        {hiddenEmpty > 0 && (
          <span className="text-[12.5px] text-ink-4">
            Скрыто без данных у всех: <span className="num">{hiddenEmpty}</span>
          </span>
        )}
        {canAdd && (
          <Button
            size="sm"
            variant="ghost"
            icon={<Plus size={14} />}
            className="ml-auto"
            onClick={() => navigate('/catalog')}
          >
            Добавить решение
          </Button>
        )}
      </div>

      <div className="card scroll-thin overflow-x-auto">
        <table className="w-full min-w-[860px] table-fixed border-collapse text-[13.5px]">
          <colgroup>
            <col className="w-[230px]" />
            {products.map((p) => (
              <col key={p.id} />
            ))}
          </colgroup>
          <thead>
            <tr className="align-top">
              <th className="sticky left-0 z-10 bg-surface px-4 py-4 text-left text-[12.5px] font-normal text-ink-3">
                Решение
              </th>
              {products.map((product) => (
                <th key={product.id} className="border-l border-line px-4 py-4 text-left font-normal">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to={`/catalog/${product.id}`}
                      className="line-clamp-2 text-[14px] font-semibold hover:underline"
                    >
                      {product.name}
                    </Link>
                    <button
                      type="button"
                      onClick={() => onRemove(product.id)}
                      className="rounded-md p-1 text-ink-4 hover:bg-black/[0.05] hover:text-ink"
                      aria-label={`Убрать «${product.name}» из сравнения`}
                      title="Убрать из сравнения"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-ink-3" title={product.manufacturer.name}>
                    {product.manufacturer.name}
                  </div>
                  <div className="mt-2">
                    <PriceFrom price={product.price_from} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <GroupHeader cols={cols}>Сводка</GroupHeader>
            <SummaryRow label="Тип решения" products={products}>
              {(p) => p.solution_type_name ?? p.solution_type}
            </SummaryRow>
            <SummaryRow label="Стадия и УГТ" products={products}>
              {(p) => (
                <span className="flex flex-wrap items-center gap-1.5">
                  <StatusPill status={p.status} />
                  {p.trl != null && <span className="num text-ink-3">УГТ {p.trl}</span>}
                </span>
              )}
            </SummaryRow>
            <SummaryRow label="Отметки" products={products}>
              {(p) => (p.badges.length ? <BadgePills badges={p.badges} /> : <span className="text-ink-4">—</span>)}
            </SummaryRow>
            <SummaryRow label="Полнота карточки" products={products}>
              {(p) => <CompletenessBar value={p.completeness} label="заполнено" />}
            </SummaryRow>
            {compatibility && (
              <SummaryRow label="Совместимость с объектом" products={products}>
                {(p) => {
                  const status = result.compatibility?.[p.id]
                  if (!status) return <span className="text-[12.5px] text-ink-4">не подбиралось</span>
                  return <Pill tone={COMPAT_TONE[status]}>{CANDIDATE_STATUS_LABEL[status]}</Pill>
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
                <td colSpan={cols} className="px-4 py-8 text-center text-ink-3">
                  {onlyDiff === 'diff'
                    ? 'Все заполненные характеристики совпадают'
                    : 'У выбранных решений нет характеристик'}
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
    <tr className="border-t border-line bg-surface-2">
      <td colSpan={cols} className="px-4 py-2 text-[12px] font-medium tracking-[0.02em] text-ink-3 uppercase">
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
    <tr className="border-t border-line align-top">
      <td className="sticky left-0 z-10 bg-surface px-4 py-2.5 text-ink-2">{label}</td>
      {products.map((product) => (
        <td key={product.id} className="border-l border-line px-4 py-2.5">
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
    <tr className="border-t border-line align-top">
      <td className="sticky left-0 z-10 bg-surface px-4 py-2.5">
        <div className="flex items-center gap-1.5 text-ink-2">
          {row.name}
          {isKey && <KeyMark />}
        </div>
        {(row.unit || hint) && (
          <div className="text-[12px] text-ink-4">{[row.unit, hint].filter(Boolean).join(', ')}</div>
        )}
      </td>
      {products.map((product) => {
        const spec = row.values[product.id]
        const best = row.best_product_id === product.id
        return (
          <td key={product.id} className={`border-l border-line px-4 py-2.5 ${best ? 'bg-ok-soft/70' : ''}`}>
            {spec && hasValue(row, product.id) ? (
              <span className="flex items-start gap-2">
                <span className={`num min-w-0 break-words ${best ? 'font-semibold text-ok' : 'font-medium'}`}>
                  {formatValue(spec.value, spec.unit ?? row.unit)}
                </span>
                <span className="mt-[5px]">
                  <SourceDot provenance={spec.provenance} />
                </span>
              </span>
            ) : (
              <span className="text-ink-4">нет данных</span>
            )}
          </td>
        )
      })}
    </tr>
  )
}

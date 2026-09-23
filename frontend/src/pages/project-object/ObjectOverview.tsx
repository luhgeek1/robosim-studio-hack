import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, CircleAlert, Info, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useDataQuality, useValidation } from '@/entities/project'
import { PROVENANCE_LABEL } from '@/entities/provenance'
import type { DataQualityReport, ObjectType, ProjectParam, ProvenanceStatus, ValidationIssue } from '@/shared/api/types'
import { formatNumber, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { ObjectTwin } from './ObjectTwin'
import { scrollToParam } from './scroll'

type Item = DataQualityReport['items'][number]

/* Главные цифры объекта в паспорте. Для типов объекта без этих ключей берём первые обязательные числа. */
const PASSPORT: { key: string; label: string }[] = [
  { key: 'area_m2', label: 'площадь склада, м²' },
  { key: 'robotized_area_m2', label: 'зона роботов, м²' },
  { key: 'staff_total', label: 'сотрудников' },
  { key: 'pallet_positions', label: 'паллетомест' },
  { key: 'order_lines_per_day', label: 'строк заказов в сутки' },
  { key: 'pallets_in_per_day', label: 'поддонов в сутки' },
]

const IMPACT_RANK: Record<Item['impact'], number> = { high: 0, medium: 1, low: 2, unknown: 3 }
const IMPACT_LABEL: Record<Item['impact'], string> = {
  high: 'сильно влияет',
  medium: 'влияет',
  low: 'слабо влияет',
  unknown: '',
}
const STATUS_RANK: Partial<Record<ProvenanceStatus, number>> = { missing: 0, assumption: 1, default: 2 }
const SEVERITY_RANK: Record<ValidationIssue['severity'], number> = { error: 0, warning: 1, info: 2 }
const BLOCK_LABEL: Record<NonNullable<ValidationIssue['blocks']>[number], string> = {
  matching: 'подбор',
  calculation: 'расчёт',
  simulation: 'имитацию',
  report: 'отчёт',
}

// Сегменты полосы качества: сначала то, что подтверждено, в конце — пробелы.
const SEGMENTS: { statuses: ProvenanceStatus[]; label: string; color: string }[] = [
  { statuses: ['user', 'imported', 'confirmed'], label: 'введено', color: 'bg-ok' },
  { statuses: ['derived'], label: 'вычислено', color: 'bg-info' },
  { statuses: ['default'], label: 'из справочника', color: 'bg-ink-4' },
  { statuses: ['assumption', 'vendor_claim', 'llm_suggested'], label: 'допущения', color: 'bg-warn' },
  { statuses: ['missing'], label: 'нет данных', color: 'bg-crit' },
]
const LIMIT = 5

export function ObjectOverview({
  projectId,
  objectType,
  params,
}: {
  projectId: string
  objectType: ObjectType | undefined
  params: ProjectParam[] | undefined
}) {
  return (
    <section className="card grid grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="min-w-0 px-6 py-6">
        <Passport params={params} objectType={objectType} />
        <div className="hairline my-6" />
        <Readiness projectId={projectId} />
      </div>
      <div className="relative min-h-140 border-t border-line lg:border-t-0 lg:border-l">
        {objectType ? (
          <ObjectTwin projectId={projectId} objectType={objectType} />
        ) : (
          <div className="absolute inset-0 animate-pulse bg-surface-2" />
        )}
      </div>
    </section>
  )
}

function Passport({ params, objectType }: { params: ProjectParam[] | undefined; objectType: ObjectType | undefined }) {
  if (!params) return <LoadingBlock rows={2} />
  const byKey = new Map(params.map((p) => [p.key, p]))
  let figures = PASSPORT.flatMap(({ key, label }) => {
    const param = byKey.get(key)
    return param ? [{ param, label }] : []
  })
  if (figures.length < 3) {
    figures = params
      .filter((p) => p.definition?.required && typeof p.value === 'number')
      .slice(0, 6)
      .map((param) => ({ param, label: `${param.name}${param.unit ? `, ${param.unit}` : ''}` }))
  }
  const shifts = byKey.get('shifts_per_day')?.value
  const hours = byKey.get('shift_hours')?.value
  const days = byKey.get('working_days_per_year')?.value

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-ink-2">Паспорт объекта</span>
        {objectType && <span className="meta">{objectType.name}</span>}
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-x-6 gap-y-5">
        {figures.map(({ param, label }, i) => (
          <motion.button
            key={param.key}
            type="button"
            onClick={() => scrollToParam(param.key)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.04 }}
            className="group flex min-w-0 flex-col-reverse text-left"
            title={`${param.name} — изменить`}
          >
            <dt className="mt-0.5 truncate text-[12.5px] text-ink-3 transition-colors group-hover:text-ink-2">
              {label}
            </dt>
            <dd
              className={cn(
                'num text-[22px] leading-tight font-semibold tracking-[-0.015em]',
                typeof param.value !== 'number' && 'text-ink-4',
              )}
            >
              {typeof param.value === 'number' ? formatNumber(param.value) : '—'}
            </dd>
          </motion.button>
        ))}
      </dl>
      {typeof shifts === 'number' && typeof hours === 'number' && (
        <p className="mt-5 text-[13px] text-ink-3">
          Работает{' '}
          <span className="text-ink">
            {shifts} {pluralRu(shifts, ['смену', 'смены', 'смен'])} по {formatNumber(hours)} ч
          </span>
          {typeof days === 'number' && (
            <>
              , <span className="text-ink">{days} дн.</span> в году
            </>
          )}
        </p>
      )}
    </div>
  )
}

function Readiness({ projectId }: { projectId: string }) {
  const quality = useDataQuality(projectId)
  const validation = useValidation(projectId)

  if (quality.isPending || validation.isPending) return <LoadingBlock rows={3} />
  if (quality.error) return <ErrorBlock error={quality.error} onRetry={() => quality.refetch()} />
  if (validation.error) return <ErrorBlock error={validation.error} onRetry={() => validation.refetch()} />

  const { summary, items } = quality.data
  const report = validation.data
  const total = Object.values(summary.counts).reduce((sum, n) => sum + (n ?? 0), 0) || 1
  const segments = SEGMENTS.map((s) => ({ ...s, n: s.statuses.reduce((sum, k) => sum + (summary.counts[k] ?? 0), 0) }))
  const gates = [
    { ok: report.can_match, label: 'Подбор' },
    { ok: report.can_calculate, label: 'Расчёт' },
    { ok: report.can_simulate, label: 'Имитация' },
  ]
  const issues = [...report.issues].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])

  // Без прогона чувствительности влияние у всех «unknown»: тогда показываем только настоящие пробелы.
  const noImpact = items.every((i) => i.impact === 'unknown')
  const toClarify = items
    .filter((i) => STATUS_RANK[i.status] !== undefined && (i.impact !== 'low' || i.status === 'missing'))
    .filter((i) => !noImpact || i.status !== 'default')
    .sort(
      (a, b) =>
        IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact] || (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9),
    )

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-ink-2">
          Откуда данные{' '}
          <span className="text-ink-3">
            · <span className="num">{total}</span> {pluralRu(total, ['параметр', 'параметра', 'параметров'])}
          </span>
        </span>
        <span className="flex items-center gap-3 text-[12.5px]">
          {gates.map((gate) => (
            <span
              key={gate.label}
              className={cn('flex items-center gap-1.5', gate.ok ? 'text-ink-3' : 'font-medium text-crit')}
              title={gate.ok ? `${gate.label}: данных хватает` : `${gate.label}: заблокирован, см. замечания`}
            >
              <span className={cn('size-1.5 rounded-full', gate.ok ? 'bg-ok' : 'bg-crit')} />
              {gate.label}
            </span>
          ))}
        </span>
      </div>

      <div className="mt-4 flex h-1.5 w-full gap-0.5 overflow-hidden rounded-[2px]">
        {segments
          .filter((s) => s.n > 0)
          .map((s, i) => (
            <motion.div
              key={s.label}
              className={s.color}
              initial={{ flexGrow: 0 }}
              animate={{ flexGrow: s.n }}
              transition={{ type: 'spring', stiffness: 120, damping: 24, delay: i * 0.05 }}
              style={{ flexBasis: 0 }}
              title={`${s.label}: ${s.n}`}
            />
          ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-3">
        {segments
          .filter((s) => s.n > 0 || s.label === 'введено')
          .map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span className={cn('size-1.5 rounded-full', s.color)} />
              {s.label} <span className="num text-ink">{s.n}</span>
            </span>
          ))}
      </div>

      {issues.length > 0 && (
        <ul className="mt-5 space-y-1">
          {issues.map((issue, index) => (
            <IssueRow key={`${issue.key}-${issue.code}-${index}`} issue={issue} />
          ))}
        </ul>
      )}

      <ToClarify items={toClarify} noImpact={noImpact} />
    </div>
  )
}

function IssueRow({ issue }: { issue: ValidationIssue }) {
  const Icon = issue.severity === 'error' ? CircleAlert : issue.severity === 'warning' ? TriangleAlert : Info
  const tone = issue.severity === 'error' ? 'text-crit' : issue.severity === 'warning' ? 'text-warn' : 'text-info'
  return (
    <li>
      <button
        type="button"
        onClick={() => scrollToParam(issue.key)}
        className={cn(
          'flex w-full gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] transition-colors',
          issue.severity === 'error' ? 'bg-crit-soft/70 hover:bg-crit-soft' : 'bg-warn-soft/60 hover:bg-warn-soft',
        )}
      >
        <Icon className={cn('mt-0.5 size-4 shrink-0', tone)} />
        <span className="min-w-0">
          <span className="block font-medium text-ink">{issue.name ?? issue.message}</span>
          {issue.name && <span className="block text-ink-2">{issue.message}</span>}
          {issue.how_to_fix && <span className="mt-0.5 block text-ink-3">{issue.how_to_fix}</span>}
          {issue.blocks && issue.blocks.length > 0 && (
            <span className={cn('mt-0.5 block', tone)}>
              блокирует {issue.blocks.map((b) => BLOCK_LABEL[b]).join(', ')}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}

function ToClarify({ items, noImpact }: { items: Item[]; noImpact: boolean }) {
  const [all, setAll] = useState(false)
  if (items.length === 0) {
    return <p className="mt-5 text-[13px] text-ink-3">Пропусков и допущений среди важных параметров нет.</p>
  }
  const head = items.slice(0, LIMIT)
  const rest = items.slice(LIMIT)
  return (
    <div className="mt-6">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-ink-2">Что стоит уточнить</span>
        <span className="meta">{noImpact ? 'сначала пропуски' : 'по влиянию на результат'}</span>
      </div>
      <ul className="divide-y divide-line">
        {head.map((item) => (
          <ClarifyRow key={item.key} item={item} />
        ))}
      </ul>
      <AnimatePresence initial={false}>
        {all && (
          <motion.ul
            key="rest"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 32 }}
            className="divide-y divide-line overflow-hidden border-t border-line"
          >
            {rest.map((item) => (
              <ClarifyRow key={item.key} item={item} />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
      {rest.length > 0 && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="mt-2 flex items-center gap-1 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"
        >
          {all ? 'Свернуть' : `Ещё ${rest.length}`}
          <ChevronDown className={cn('size-3.5 transition-transform duration-300', all && 'rotate-180')} />
        </button>
      )}
    </div>
  )
}

function ClarifyRow({ item }: { item: Item }) {
  const dot = item.status === 'missing' ? 'bg-crit' : item.status === 'assumption' ? 'bg-warn' : 'bg-ink-4'
  return (
    <li>
      <button
        type="button"
        onClick={() => scrollToParam(item.key)}
        title={item.source_title ? `${item.name} · ${item.source_title}` : item.name}
        className="group flex w-full items-center gap-2.5 py-2.5 text-left"
      >
        <span className={cn('size-1.5 shrink-0 rounded-full', dot)} />
        <span className="min-w-0 flex-1 truncate text-[14px] transition-colors group-hover:text-info">{item.name}</span>
        <Hint>
          {item.impact !== 'unknown' && item.impact !== 'low' && (
            <span className={item.impact === 'high' ? 'text-crit' : 'text-warn'}>{IMPACT_LABEL[item.impact]} · </span>
          )}
          {PROVENANCE_LABEL[item.status].toLowerCase()}
        </Hint>
      </button>
    </li>
  )
}

function Hint({ children }: { children: ReactNode }) {
  return <span className="shrink-0 text-[12.5px] whitespace-nowrap text-ink-3">{children}</span>
}

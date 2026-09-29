import { AnimatePresence, motion, type Transition } from 'framer-motion'
import { Check, ChevronLeft, ChevronRight, CircleAlert, TriangleAlert } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { useDataQuality, useUpdateParam, useValidation } from '@/entities/project'
import { PROVENANCE_LABEL } from '@/entities/provenance'
import { ParamValueInput, displayRange, parseDraft, shortHint, toDraft } from '@/features/param-edit'
import type { DataQualityReport, ObjectType, ProjectParam, ProvenanceStatus, ValidationIssue } from '@/shared/api/types'
import { formatNumber, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { ObjectTwin } from './ObjectTwin'
import { scrollToParam } from './scroll'

type Item = DataQualityReport['items'][number]

const SWAP: Transition = { type: 'spring', stiffness: 170, damping: 26, mass: 1 }

/* Главные цифры объекта для полосы паспорта. Для типов объекта без этих ключей берём первые обязательные числа. */
const PASSPORT: { key: string; label: string }[] = [
  { key: 'area_m2', label: 'площадь склада, м²' },
  { key: 'robotized_area_m2', label: 'зона роботов, м²' },
  { key: 'staff_total', label: 'сотрудников' },
  { key: 'pallet_positions', label: 'паллетомест' },
  { key: 'order_lines_per_day', label: 'строк заказов в сутки' },
]

const IMPACT_RANK: Record<Item['impact'], number> = { high: 0, medium: 1, low: 2, unknown: 3 }
const IMPACT_LABEL: Partial<Record<Item['impact'], string>> = { high: 'Сильно влияет', medium: 'Влияет' }
const STATUS_RANK: Partial<Record<ProvenanceStatus, number>> = { missing: 0, assumption: 1, default: 2 }

// Клетки карты параметров идут от подтверждённого к пробелам, цвет — по происхождению значения.
const CELL_ORDER: ProvenanceStatus[] = [
  'user',
  'imported',
  'confirmed',
  'derived',
  'default',
  'vendor_claim',
  'llm_suggested',
  'assumption',
  'missing',
]
const CELL: Record<ProvenanceStatus, string> = {
  user: 'bg-ok',
  imported: 'bg-ok',
  confirmed: 'bg-ok',
  derived: 'bg-info/70',
  default: 'bg-black/12',
  vendor_claim: 'bg-warn/60',
  llm_suggested: 'bg-warn/60',
  assumption: 'bg-warn',
  missing: 'bg-crit',
}
const LEGEND: { label: string; statuses: ProvenanceStatus[]; color: string }[] = [
  { label: 'введено', statuses: ['user', 'imported', 'confirmed'], color: 'bg-ok' },
  { label: 'из справочника', statuses: ['default', 'derived'], color: 'bg-black/12' },
  { label: 'допущения', statuses: ['assumption', 'vendor_claim', 'llm_suggested'], color: 'bg-warn' },
  { label: 'нет данных', statuses: ['missing'], color: 'bg-crit' },
]

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
    <section className="card overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex min-w-0 flex-col px-5 py-6 sm:px-7 sm:py-7">
          {params ? <Readiness projectId={projectId} params={params} /> : <LoadingBlock rows={4} />}
        </div>
        <div className="relative min-h-110 border-t border-line sm:min-h-140 lg:border-t-0 lg:border-l">
          {objectType ? (
            <ObjectTwin projectId={projectId} objectType={objectType} />
          ) : (
            <div className="absolute inset-0 animate-pulse bg-surface-2" />
          )}
        </div>
      </div>
      {params && <Passport params={params} />}
    </section>
  )
}

function Readiness({ projectId, params }: { projectId: string; params: ProjectParam[] }) {
  const quality = useDataQuality(projectId)
  const validation = useValidation(projectId)

  if (quality.isPending || validation.isPending) return <LoadingBlock rows={4} />
  if (quality.error) return <ErrorBlock error={quality.error} onRetry={() => quality.refetch()} />
  if (validation.error) return <ErrorBlock error={validation.error} onRetry={() => validation.refetch()} />

  const report = validation.data
  const errors = report.issues.filter((issue) => issue.severity !== 'info')
  // Без прогона чувствительности влияние у всех «unknown»: тогда в очередь идут только настоящие пробелы.
  const noImpact = quality.data.items.every((i) => i.impact === 'unknown')
  const queue = quality.data.items
    .filter((i) => STATUS_RANK[i.status] !== undefined && (i.impact !== 'low' || i.status === 'missing'))
    .filter((i) => !noImpact || i.status !== 'default')
    .sort(
      (a, b) =>
        IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact] || (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9),
    )

  const verdict = !report.can_match
    ? { ok: false, title: 'Для подбора не хватает данных' }
    : !report.can_calculate
      ? { ok: false, title: 'Для расчёта не хватает данных' }
      : !report.can_simulate
        ? { ok: false, title: 'Для имитации не хватает данных' }
        : { ok: true, title: 'Данных хватает для расчёта' }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-start gap-3.5">
        <span
          className={cn(
            'mt-0.5 grid size-9 shrink-0 place-items-center rounded-full',
            verdict.ok ? 'bg-ok-soft text-ok' : 'bg-crit-soft text-crit',
          )}
        >
          {verdict.ok ? <Check className="size-4.5" strokeWidth={2.5} /> : <CircleAlert className="size-4.5" />}
        </span>
        <div className="min-w-0">
          <h2 className="h3 text-[20px]">{verdict.title}</h2>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-3">
            {queue.length > 0
              ? `Оценка станет точнее, если уточнить ${queue.length} ${pluralRu(queue.length, ['значение', 'значения', 'значений'])} — начните с главного.`
              : 'Все важные значения уточнены — оценка опирается на ваши данные.'}
          </p>
        </div>
      </div>

      <ParamMap params={params} />

      {errors.length > 0 && (
        <ul className="mt-5 space-y-1.5">
          {errors.map((issue, index) => (
            <IssueRow key={`${issue.key}-${issue.code}-${index}`} issue={issue} />
          ))}
        </ul>
      )}

      <Focus projectId={projectId} queue={queue} params={params} />
    </div>
  )
}

/* Карта параметров: одна клетка — один параметр. Видно, какая часть объекта описана вашими данными,
   а какая держится на справочнике и допущениях; клик ведёт к параметру. */
function ParamMap({ params }: { params: ProjectParam[] }) {
  const [hovered, setHovered] = useState<ProjectParam | null>(null)
  // Последний наведённый параметр держим отдельно, чтобы подпись не пропадала раньше, чем погаснет.
  const [last, setLast] = useState<ProjectParam | null>(null)
  const cells = [...params].sort(
    (a, b) => CELL_ORDER.indexOf(a.provenance.status) - CELL_ORDER.indexOf(b.provenance.status),
  )
  const count = (statuses: ProvenanceStatus[]) => params.filter((p) => statuses.includes(p.provenance.status)).length
  const show = (param: ProjectParam) => {
    setHovered(param)
    setLast(param)
  }

  return (
    <div className="my-auto py-6 sm:py-8">
      <div className="flex flex-wrap gap-1.25" onPointerLeave={() => setHovered(null)}>
        {cells.map((param) => (
          <motion.button
            key={param.key}
            layout
            type="button"
            transition={SWAP}
            whileHover={{ scale: 1.25 }}
            onPointerEnter={() => show(param)}
            onFocus={() => show(param)}
            onBlur={() => setHovered(null)}
            onClick={() => scrollToParam(param.key)}
            aria-label={`${param.name}: ${PROVENANCE_LABEL[param.provenance.status].toLowerCase()}`}
            className={cn(
              'size-5 rounded-[5px] transition-opacity duration-150',
              CELL[param.provenance.status],
              hovered && hovered.key !== param.key && 'opacity-45',
            )}
          />
        ))}
      </div>
      {/* Легенда и подпись наведённого параметра лежат друг на друге и меняются только прозрачностью:
          без монтирования по ключу подпись не может «застрять», как бы быстро ни двигался курсор. */}
      {/* До lg легенда стоит в потоке и переносится; подпись лежит поверх неё. */}
      <div className="relative mt-3 min-h-5 text-[12.5px] lg:h-5">
        <div
          className={cn(
            'flex min-h-5 flex-wrap gap-x-4 gap-y-1 text-ink-3 lg:absolute lg:inset-0 lg:flex-nowrap transition-opacity duration-150',
            hovered ? 'opacity-0' : 'opacity-100',
          )}
        >
          {LEGEND.map((entry) => (
            <span key={entry.label} className="flex items-center gap-1.5 whitespace-nowrap">
              <span className={cn('size-2 rounded-[2px]', entry.color)} />
              {entry.label} <span className="num text-ink">{count(entry.statuses)}</span>
            </span>
          ))}
        </div>
        <div
          aria-hidden={!hovered}
          className={cn(
            'pointer-events-none absolute inset-0 truncate transition-opacity duration-150',
            hovered ? 'opacity-100' : 'opacity-0',
          )}
        >
          {last && (
            <>
              <span className="font-medium text-ink">{last.name}</span>
              <span className="text-ink-3"> · {PROVENANCE_LABEL[last.provenance.status].toLowerCase()}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* Очередь «уточните главное»: по одному параметру, начиная с самых влиятельных. Значение можно исправить или
   подтвердить как верное — после сохранения параметр уходит из очереди и становится «введённым». */
function Focus({ projectId, queue, params }: { projectId: string; queue: Item[]; params: ProjectParam[] }) {
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const byKey = new Map(params.map((p) => [p.key, p]))
  const list = queue.filter((item) => byKey.has(item.key))

  if (list.length === 0) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-xl bg-ok-soft/60 px-4 py-3.5 text-[14px] text-ok">
        <Check className="size-4" /> Очередь пуста: важных пропусков и допущений не осталось.
      </div>
    )
  }

  const current = Math.min(index, list.length - 1)
  const item = list[current]
  const go = (step: number) => {
    setDirection(step)
    setIndex((current + step + list.length) % list.length)
  }

  return (
    <div className="mt-2">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[13px] text-ink-2">Уточните главное</span>
        <span className="flex items-center gap-1">
          <span className="num mr-1.5 text-[12.5px] text-ink-3">
            {current + 1} из {list.length}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => go(-1)} aria-label="Предыдущий параметр">
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => go(1)} aria-label="Следующий параметр">
            <ChevronRight />
          </Button>
        </span>
      </div>
      <div className="relative overflow-hidden rounded-xl bg-surface-2 ring-1 ring-line">
        <AnimatePresence initial={false} mode="popLayout" custom={direction}>
          <motion.div
            key={item.key}
            custom={direction}
            variants={{
              enter: (d: number) => ({ x: d * 40, opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit: (d: number) => ({ x: d * -40, opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={SWAP}
          >
            <FocusCard projectId={projectId} item={item} param={byKey.get(item.key)!} onNext={() => go(1)} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function FocusCard({
  projectId,
  item,
  param,
  onNext,
}: {
  projectId: string
  item: Item
  param: ProjectParam
  onNext: () => void
}) {
  const update = useUpdateParam(projectId)
  const type = param.definition?.type ?? 'string'
  const textual = type === 'number' || type === 'integer' || type === 'string'
  const initial = toDraft(param.value, type)
  const [draft, setDraft] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const range = displayRange(param)
  const hint = param.definition?.hint
  const impact = IMPACT_LABEL[item.impact]
  const changed = draft.trim() !== initial.trim()
  const empty = draft.trim() === ''

  const save = async () => {
    const parsed = parseDraft(draft, type)
    if (!parsed.ok) return setError(parsed.error)
    setError(null)
    // Ошибку API показывает глобальный тост; черновик остаётся, чтобы его можно было поправить.
    await update.mutateAsync({ key: param.key, value: parsed.value, unit: param.unit ?? null }).catch(() => undefined)
  }

  return (
    <div className="px-4 pt-4.5 pb-5 sm:px-5">
      <div className="flex items-center gap-2 text-[12.5px]">
        {impact && (
          <span className={cn('font-medium', item.impact === 'high' ? 'text-crit' : 'text-warn')}>{impact}</span>
        )}
        {impact && <span className="text-ink-4">·</span>}
        <span className="text-ink-3">сейчас {PROVENANCE_LABEL[item.status].toLowerCase()}</span>
      </div>
      <h3 className="mt-1.5 text-[18px] leading-snug font-semibold tracking-[-0.01em]">{param.name}</h3>
      {hint && (
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="mt-1 line-clamp-2 cursor-help text-[13.5px] leading-relaxed text-ink-3">{shortHint(hint)}</p>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">{hint}</TooltipContent>
        </Tooltip>
      )}

      {textual ? (
        <form
          className="mt-4 flex items-stretch gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <label className="relative flex-1">
            <input
              value={draft}
              inputMode={type === 'string' ? 'text' : 'decimal'}
              placeholder={param.definition?.example ? `напр. ${param.definition.example}` : 'введите значение'}
              aria-label={param.name}
              aria-invalid={error ? true : undefined}
              disabled={update.isPending}
              // На телефоне поле узкое: отступ под единицу по её длине, а не фиксированный, иначе число не видно.
              style={
                param.unit
                  ? ({ '--unit-pad': `calc(${param.unit.length * 0.5}rem + 1.75rem)` } as CSSProperties)
                  : undefined
              }
              onChange={(event) => {
                setDraft(event.target.value)
                if (error) setError(null)
              }}
              className={cn(
                'h-12 w-full rounded-lg bg-card px-3.5 text-[17px] sm:px-4 shadow-[0_1px_2px_rgba(20,20,19,0.04)] ring-1 ring-line transition-shadow outline-none placeholder:text-[15px] placeholder:text-ink-4 focus:ring-2 focus:ring-ink/80',
                type !== 'string' && 'num',
                param.unit && 'pr-(--unit-pad) sm:pr-24',
                error && 'ring-crit',
              )}
            />
            {param.unit && (
              <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-[13px] text-ink-3 sm:right-4">
                {param.unit}
              </span>
            )}
          </label>
          <Button
            type="submit"
            className="h-12 min-w-22 rounded-lg px-4 text-[14px] sm:min-w-28 sm:px-5"
            disabled={update.isPending || empty}
          >
            {update.isPending ? <Spinner /> : changed ? 'Сохранить' : 'Верно'}
          </Button>
        </form>
      ) : (
        <div className="mt-4">
          <ParamValueInput
            param={param}
            pending={update.isPending}
            onCommit={(value) => update.mutateAsync({ key: param.key, value, unit: param.unit ?? null })}
          />
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-3 text-[12.5px]">
        <span className={cn('min-w-0 truncate', error ? 'text-crit' : 'text-ink-3')}>
          {error ??
            (range ? `обычно ${range}` : changed ? 'Enter — сохранить' : 'Если значение верное, подтвердите его')}
        </span>
        <button
          type="button"
          onClick={onNext}
          className="shrink-0 font-medium text-ink-3 transition-colors hover:text-ink max-sm:-my-2 max-sm:py-2"
        >
          Пропустить
        </button>
      </div>
    </div>
  )
}

function IssueRow({ issue }: { issue: ValidationIssue }) {
  const error = issue.severity === 'error'
  const Icon = error ? CircleAlert : TriangleAlert
  return (
    <li>
      <button
        type="button"
        onClick={() => scrollToParam(issue.key)}
        className={cn(
          'flex w-full gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] transition-colors',
          error ? 'bg-crit-soft/70 hover:bg-crit-soft' : 'bg-warn-soft/60 hover:bg-warn-soft',
        )}
      >
        <Icon className={cn('mt-0.5 size-4 shrink-0', error ? 'text-crit' : 'text-warn')} />
        <span className="min-w-0">
          <span className="block font-medium text-ink">{issue.name ?? issue.message}</span>
          {issue.name && <span className="block text-ink-2">{issue.message}</span>}
          {issue.how_to_fix && <span className="mt-0.5 block text-ink-3">{issue.how_to_fix}</span>}
        </span>
      </button>
    </li>
  )
}

function Passport({ params }: { params: ProjectParam[] }) {
  const byKey = new Map(params.map((p) => [p.key, p]))
  let figures = PASSPORT.flatMap(({ key, label }) => {
    const param = byKey.get(key)
    return param ? [{ param, label }] : []
  })
  if (figures.length < 3) {
    figures = params
      .filter((p) => p.definition?.required && typeof p.value === 'number')
      .slice(0, 5)
      .map((param) => ({ param, label: `${param.name}${param.unit ? `, ${param.unit}` : ''}` }))
  }
  const shifts = byKey.get('shifts_per_day')
  const hours = byKey.get('shift_hours')?.value

  return (
    <div className="grid grid-cols-2 border-t border-line sm:grid-cols-3 lg:grid-cols-6 lg:divide-x lg:divide-line">
      {figures.map(({ param, label }) => (
        <Figure
          key={param.key}
          value={typeof param.value === 'number' ? formatNumber(param.value) : '—'}
          label={label}
          onClick={() => scrollToParam(param.key)}
        />
      ))}
      {shifts && typeof shifts.value === 'number' && (
        <Figure
          value={typeof hours === 'number' ? `${shifts.value} × ${formatNumber(hours)} ч` : formatNumber(shifts.value)}
          label={pluralRu(shifts.value, ['смена в сутки', 'смены в сутки', 'смен в сутки'])}
          onClick={() => scrollToParam(shifts.key)}
        />
      )}
    </div>
  )
}

function Figure({ value, label, onClick }: { value: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-0 px-5 py-3.5 text-left transition-colors hover:bg-surface-2 sm:px-6 sm:py-4"
      title={`${label} — изменить`}
    >
      <span className="num block text-[20px] leading-tight font-semibold tracking-[-0.01em]">{value}</span>
      <span className="mt-0.5 block text-[12.5px] text-ink-3 max-lg:leading-snug lg:truncate">{label}</span>
    </button>
  )
}

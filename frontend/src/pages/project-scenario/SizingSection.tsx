import { useIsMutating } from '@tanstack/react-query'
import { Bot, Sparkles, Timer } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { useLayout } from '@/entities/layout'
import { useProject, useProjectId } from '@/entities/project'
import { useObjectType } from '@/entities/reference'
import { useCalculate, useCountSource } from '@/entities/scenario'
import { checkable, useLastSweep, type FleetEconomics } from '@/entities/simulation'
import type { SizingResult } from '@/shared/api/types'
import { formatNumber, formatPct, formatRub, formatYears, isNum } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Section } from '@/shared/ui/page'
import { cn } from '@/shared/lib/utils'
import { Spinner } from '@/shared/ui/states'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'

const COUNT_SOURCE_LABEL = {
  analytic: 'по формуле цикла',
  simulated: 'проверено имитацией',
  manual: 'задано вручную',
} as const

export function SizingSection({
  scenarioId,
  sizing,
  onTrace,
  locked = false,
}: {
  scenarioId: string
  sizing: SizingResult[]
  onTrace: (query: string) => void
  locked?: boolean
}) {
  if (sizing.length === 0) return null
  return (
    <Section
      title="Сколько роботов нужно: паспорт против физики"
      description="Производительность считается из времени цикла на планировке объекта, а не из паспорта"
    >
      <div className="space-y-4">
        {sizing.map((s) => (
          <SizingCard
            key={`${s.process_key}-${s.product_id}`}
            scenarioId={scenarioId}
            sizing={s}
            onTrace={onTrace}
            locked={locked}
          />
        ))}
      </div>
    </Section>
  )
}

function SizingCard({
  scenarioId,
  sizing,
  onTrace,
  locked,
}: {
  scenarioId: string
  sizing: SizingResult
  onTrace: (query: string) => void
  locked: boolean
}) {
  const { robot, count } = sizing
  const cycleTotal = robot.cycle_components?.reduce((sum, c) => sum + c.seconds, 0) ?? 0

  return (
    <div className="rounded-md border bg-raised/40 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-medium">{sizing.product_name}</div>
          <div className="text-xs text-muted-foreground">
            Спрос в пик {formatNumber(sizing.demand_peak_per_hour)} ед/ч
            {isNum(sizing.demand_avg_per_hour) && `, в среднем ${formatNumber(sizing.demand_avg_per_hour)} ед/ч`}
          </div>
        </div>
        <button
          type="button"
          className="text-xs font-medium text-ink-3 transition-colors hover:text-ink"
          onClick={() => onTrace(sizing.process_key)}
        >
          Трасса расчёта процесса
        </button>
      </div>

      <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Timer className="size-3.5" /> Цикл робота
          </div>
          {robot.cycle_components && robot.cycle_components.length > 0 ? (
            <>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                {robot.cycle_components.map((c, i) => (
                  <div
                    key={c.key}
                    className={['bg-ink', 'bg-warn', 'bg-ok', 'bg-ink-4', 'bg-crit'][i % 5]}
                    style={{ width: `${(c.seconds / (cycleTotal || 1)) * 100}%` }}
                  />
                ))}
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {robot.cycle_components.map((c) => (
                    <tr key={c.key}>
                      <td className="py-0.5 text-muted-foreground">{c.name}</td>
                      <td className="num py-0.5 text-right">{formatNumber(c.seconds, 1)} с</td>
                    </tr>
                  ))}
                  <tr className="border-t font-medium">
                    <td className="py-0.5">Время цикла</td>
                    <td className="num py-0.5 text-right">{formatNumber(robot.cycle_time_s, 1)} с</td>
                  </tr>
                </tbody>
              </table>
            </>
          ) : (
            <div className="text-xs text-muted-foreground">
              У модели нет цикла (площадь или станция) либо количество задано вручную.
            </div>
          )}
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="text-muted-foreground">Производительность одного робота</div>
          <Row label="По циклу (3600 / цикл)" value={robot.nominal_throughput_per_hour} unit="ед/ч" />
          <Row label="Доступность (зарядка, простои)" value={robot.availability} share />
          <Row label="Целевая загрузка" value={robot.utilization_target} share />
          <Row label="Эффективная" value={robot.effective_throughput_per_hour} unit="ед/ч" strong />
          {isNum(robot.vendor_claim_per_hour) && (
            <Row label="Заявлено производителем" value={robot.vendor_claim_per_hour} unit="ед/ч" muted />
          )}
          <Row label="Покрытие пика парком" value={sizing.coverage_of_peak} share />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Bot className="size-3.5" /> Количество
          </div>
          <div className="flex items-end gap-4">
            <CountCell label="по циклу" value={count.analytic} />
            <CountCell label="имитация" value={count.simulated} />
            <CountCell label="резерв" value={count.reserve} prefix="+" />
            <div className="ml-auto text-right">
              <div className="num text-3xl leading-none font-semibold">{count.final}</div>
              <div className="text-xs text-muted-foreground">итого</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
            <span className="flex items-center gap-1.5 font-medium text-ink-2">
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  count.source === 'simulated' ? 'bg-ok' : count.source === 'manual' ? 'bg-warn' : 'bg-ink',
                )}
              />
              {COUNT_SOURCE_LABEL[count.source]}
            </span>
            <span className="num">зарядок: {sizing.chargers_count}</span>
            {isNum(sizing.stations_count) && <span className="num">станций: {sizing.stations_count}</span>}
          </div>
          {count.explanation && <p className="text-xs text-muted-foreground">{count.explanation}</p>}
        </div>
      </div>
      <CountOrigin scenarioId={scenarioId} sizing={sizing} locked={locked} />
    </div>
  )
}

/* Откуда число роботов: формула цикла даёт стартовое N с запасами, имитация на планировке находит минимальное N,
   которое держит SLA. Обе оценки и их экономика видны рядом, пользователь выбирает, какую брать в расчёт. */
function CountOrigin({ scenarioId, sizing, locked }: { scenarioId: string; sizing: SizingResult; locked: boolean }) {
  const projectId = useProjectId()
  const project = useProject(projectId).data
  const depth = useObjectType(project?.object_type).data?.depth
  const layout = useLayout(projectId, depth === 'full').data
  const { count } = sizing
  const cycle = sizing.robot.cycle_time_s != null
  const simulable = cycle && depth === 'full'
  const sweep = useLastSweep(scenarioId, simulable ? sizing.process_key : undefined).data
  const recheck = useCalculate(projectId, scenarioId)
  const source = useCountSource(projectId, scenarioId)
  const mutating = useIsMutating() > 0
  const busy = locked || mutating
  const formula = sweep?.by_formula
  const simulated = sweep?.by_simulation

  const check = (force: boolean) =>
    recheck.mutate(force, {
      onSuccess: ({ checked, skipped }) => {
        if (!checked.length && skipped.length) toast.warning(`Имитация не проверила число роботов: ${skipped[0]}`)
        else if (checked.some((r) => r.recommended_count == null))
          toast.warning('Даже тройной парк не держит SLA: ограничение не в числе роботов — смотрите узкое место')
      },
    })
  const checkButton = (force: boolean, label: string) => (
    <Button size="sm" variant="outline" onClick={() => check(force)} disabled={busy}>
      {recheck.isPending ? <Spinner /> : <Sparkles />} {label}
    </Button>
  )

  if (!simulable) return null
  if (!layout) {
    return (
      <Note>
        Число роботов посчитано по формуле цикла. Чтобы проверить его имитацией, постройте планировку на шаге
        «Планировка».
      </Note>
    )
  }
  if (count.source === 'analytic') {
    return (
      <Note action={checkable(sizing) ? checkButton(false, 'Проверить имитацией') : null}>
        {sweep
          ? 'Параметры объекта менялись после проверки имитацией: число роботов сейчас по формуле цикла. Проверьте заново.'
          : 'Число роботов посчитано по формуле цикла и ещё не проверено имитацией на планировке объекта.'}
      </Note>
    )
  }
  if (!formula || !simulated) {
    return (
      <Note action={checkButton(true, 'Перепроверить')}>
        {count.source === 'simulated'
          ? 'Число роботов проверено имитацией по прежнему правилу. Перепроверьте: теперь парк принят, только если SLA держат все прогоны.'
          : 'Число роботов задано вручную.'}
      </Note>
    )
  }

  const usingFormula = count.source === 'manual' && count.final === formula.total
  const usingSimulation = count.source === 'simulated'
  return (
    <div className="mt-4 rounded-[10px] bg-surface-2 p-4 text-[13px]">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-ink">Откуда число роботов</span>
        <Link to={`/projects/${projectId}/simulation`} className="text-[12.5px] text-ink-3 hover:text-ink">
          Подробнее на шаге «Имитация» →
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <OriginCard
          title="По формуле цикла"
          note="Робот доступен и загружен с запасом, каждый рейс — туда и обратно порожняком"
          fleet={formula}
          active={usingFormula}
        />
        <OriginCard
          title="По имитации"
          note={`Минимальный парк, который держит SLA ${formatNumber(sweep?.target_pct)} % во всех прогонах пика`}
          fleet={simulated}
          active={usingSimulation}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            source.mutate({ processKey: sizing.process_key, manual: usingSimulation ? formula.total : null })
          }
        >
          {source.isPending && <Spinner />}
          {usingSimulation ? `Считать по формуле (${formula.total})` : `Считать по имитации (${simulated.total})`}
        </Button>
        <span className="text-[12px] text-ink-3">
          {locked
            ? 'Сначала сохраните или отмените правки состава'
            : count.source === 'manual' && !usingFormula
              ? `Сейчас в расчёте — ${count.final}, заданное вручную`
              : 'Выбор применяется и к вариантам RaaS и лизинга с тем же роботом'}
        </span>
      </div>
    </div>
  )
}

function Note({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-surface-2 px-4 py-3 text-[13px]">
      <span className="text-ink-2">{children}</span>
      {action}
    </div>
  )
}

function OriginCard({
  title,
  note,
  fleet,
  active,
}: {
  title: string
  note: string
  fleet: FleetEconomics
  active: boolean
}) {
  return (
    <div className={cn('rounded-[10px] border bg-white p-3', active ? 'border-ink' : 'border-line')}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-ink">{title}</span>
        {active && <span className="text-[11.5px] font-medium text-ok">в расчёте</span>}
      </div>
      <div className="num mt-1 text-[22px] leading-tight font-semibold">
        {fleet.working} + {fleet.reserve} = {fleet.total}
        <span className="ml-1 text-[12px] font-normal text-ink-3">в работе + резерв</span>
      </div>
      <div className="num mt-1 grid grid-cols-3 gap-2 text-[12px] text-ink-2">
        <span>CAPEX {formatRub(fleet.capex_rub)}</span>
        <span>окупаемость {formatYears(fleet.payback_years)}</span>
        <span>NPV {formatRub(fleet.npv_rub)}</span>
      </div>
      <p className="mt-1.5 text-[12px] text-ink-3">{note}</p>
    </div>
  )
}

function Row({
  label,
  value,
  unit,
  share,
  strong,
  muted,
}: {
  label: string
  value: number | null | undefined
  unit?: string
  share?: boolean
  strong?: boolean
  muted?: boolean
}) {
  const text = share ? formatPct(value, { share: true, digits: 0 }) : `${formatNumber(value)} ${unit ?? ''}`
  return (
    <div className={`flex justify-between gap-2 ${muted ? 'text-muted-foreground' : ''}`}>
      <span className={muted ? '' : 'text-muted-foreground'}>{label}</span>
      <span className={`num ${strong ? 'font-semibold' : ''}`}>{isNum(value) ? text : '—'}</span>
    </div>
  )
}

function CountCell({ label, value, prefix }: { label: string; value: number | null | undefined; prefix?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="text-center">
          <div className="num text-lg leading-none font-medium">{isNum(value) ? `${prefix ?? ''}${value}` : '—'}</div>
          <div className="text-[11px] text-muted-foreground">{label}</div>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {label === 'имитация' && !isNum(value)
          ? 'Имитация ещё не запускалась'
          : `${label}: ${isNum(value) ? value : '—'}`}
      </TooltipContent>
    </Tooltip>
  )
}

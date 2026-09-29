import { Sparkles } from 'lucide-react'
import { Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useCountSource } from '@/entities/scenario'
import {
  useFleetSweep,
  type FleetEconomics,
  type FleetSweepResult,
  type SimulationSummary,
} from '@/entities/simulation'
import { parseApiProblem } from '@/shared/api/problem'
import type { SizingResult } from '@/shared/api/types'
import { formatDate, formatNumber, formatPct, formatRub, formatYears, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Spinner } from '@/shared/ui/states'
import { Pill, type Tone } from '@/shared/ui/v0'
import { Hint } from './Hint'
import { SEED } from './runConfig'

type Point = FleetSweepResult['points'][number]

const VS_LABEL: Record<string, { text: string; tone: Tone }> = {
  confirmed: { text: 'имитация подтверждает расчёт', tone: 'ok' },
  shortfall: { text: 'имитация ниже расчёта', tone: 'warn' },
  excess: { text: 'имитация выше расчёта', tone: 'accent' },
}

/* «Почему N»: формула против имитации с экономикой, перебор флота столбцами «N → худший прогон SLA» с линией цели
   и сверка производительности. Перебор записывает N в сценарий (D-029); клик по столбцу открывает прогон. */
export function WhyCount({
  projectId,
  scenarioId,
  variantIds,
  sizing,
  last,
  summary,
  shownCount,
  onOpen,
}: {
  projectId: string
  scenarioId: string
  variantIds: string[]
  sizing: SizingResult
  last: FleetSweepResult | undefined
  summary: SimulationSummary | null
  shownCount: number
  onOpen: (count: number, simulationId: string | null) => void
}) {
  const sweep = useFleetSweep(projectId, scenarioId, variantIds)
  const source = useCountSource(projectId, scenarioId)
  const result: FleetSweepResult | undefined = sweep.data ?? last
  const { count } = sizing
  const formula = result?.by_formula
  const simulated = result?.by_simulation
  const usingSimulation = count.source === 'simulated'
  const usingFormula = count.source === 'manual' && formula != null && count.final === formula.total
  const best = result?.points.find((p) => p.count === result.recommended_count)
  const busy = sweep.isPending || source.isPending
  const inCalc = usingSimulation ? simulated?.working : usingFormula ? formula?.working : undefined

  const run = () =>
    sweep.mutate(
      { process_key: sizing.process_key, mode: 'peak', seed: SEED },
      { onSuccess: (r) => r.recommended_count != null && onOpen(r.recommended_count, r.simulation_id ?? null) },
    )

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5">
        <div>
          <h2 className="h3 flex items-center gap-1.5">
            {simulated
              ? `Почему ${simulated.working} ${pluralRu(simulated.working, ['робот', 'робота', 'роботов'])}`
              : 'Сколько роботов нужно'}
            {result && (
              <Hint>
                {formula && simulated && best && (
                  <WhyDifferent sizing={sizing} formula={formula} simulated={simulated} best={best} />
                )}
                <p className="text-ink-3">{result.explanation}</p>
                <p className="text-ink-3">
                  Цель — {formatNumber(result.target_pct)} % задач в срок в каждом из прогонов. Окупаемость — сценария с
                  этим N и резервом. {result.computed_at ? `Перебор от ${formatDate(result.computed_at)}.` : ''}
                </p>
              </Hint>
            )}
          </h2>
          <p className="meta mt-0.5">
            Один и тот же пиковый день для разного числа роботов: принимается наименьшее, при котором срок держат все
            прогоны
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {formula && simulated && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              title={usingSimulation ? 'Считать число роботов по формуле цикла' : 'Считать число роботов по имитации'}
              onClick={() =>
                source.mutate({ processKey: sizing.process_key, manual: usingSimulation ? formula.total : null })
              }
            >
              {source.isPending && <Spinner />}
              {usingSimulation ? `Считать по формуле (${formula.total})` : `Считать по имитации (${simulated.total})`}
            </Button>
          )}
          <Button size="sm" variant={result ? 'outline' : 'default'} disabled={busy} onClick={run}>
            {sweep.isPending ? <Spinner /> : <Sparkles />}{' '}
            {sweep.isPending
              ? variantIds.length
                ? 'Перебираем для всех вариантов…'
                : 'Перебираем флот…'
              : result
                ? 'Перепроверить'
                : 'Подобрать N имитацией'}
          </Button>
        </div>
      </div>
      {sweep.isError && <p className="px-6 pt-2 text-[12.5px] text-crit">{parseApiProblem(sweep.error).detail}</p>}

      {!result ? (
        <p className="px-6 pt-3 pb-6 text-[13.5px] leading-relaxed text-ink-2">
          Формула цикла дала {count.analytic} {pluralRu(count.analytic, ['робота', 'роботов', 'роботов'])} с запасами.
          Перебор прогонит одни и те же пиковые часы на планировке для разного N и найдёт минимальное, при котором срок
          держат все прогоны. Найденное число запишется в сценарий, экономика пересчитается.
        </p>
      ) : (
        <div className="grid gap-6 px-6 pt-5 pb-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
          {formula && simulated && (
            <div className="space-y-2.5">
              <FleetTile title="По имитации" fleet={simulated} active={usingSimulation} strong />
              <FleetTile title="По формуле цикла" fleet={formula} active={usingFormula} />
            </div>
          )}
          <SweepChart result={result} inCalc={inCalc} shown={shownCount} onOpen={onOpen} />
        </div>
      )}

      {summary && <VsLine summary={summary} />}
    </section>
  )
}

function FleetTile({
  title,
  fleet,
  active,
  strong = false,
}: {
  title: string
  fleet: FleetEconomics
  active: boolean
  strong?: boolean
}) {
  return (
    <div className={cn('rounded-[12px] border px-4 py-3', active ? 'border-ink bg-card' : 'border-line bg-surface-2')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] text-ink-2">{title}</span>
        {active && <span className="text-[11.5px] font-medium text-ok">в расчёте</span>}
      </div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className={cn('display num', strong ? 'text-[30px]' : 'text-[24px]')}>{fleet.total}</span>
        <span className="num text-[12px] text-ink-3">
          {fleet.working} в работе + {fleet.reserve} рез.
        </span>
      </div>
      <div className="num mt-0.5 text-[12px] text-ink-2">
        окупаемость {formatYears(fleet.payback_years)} · {formatRub(fleet.capex_rub)}
      </div>
    </div>
  )
}

/* Столбец — худший из прогонов пика для этого N (он решает, принят ли парк); пунктир — цель по сроку.
   Шкала от нуля: разница между 87 и 100 % видна честно, красный цвет подчёркивает провал. */
function SweepChart({
  result,
  inCalc,
  shown,
  onOpen,
}: {
  result: FleetSweepResult
  inCalc?: number
  shown: number
  onOpen: (count: number, simulationId: string | null) => void
}) {
  const data = [...result.points]
    .sort((a, b) => a.count - b.count)
    .map((p) => ({ ...p, worst: p.sla_min_pct ?? p.sla_achieved_pct }))
  const fill = (p: Point) =>
    p.count === (inCalc ?? result.recommended_count) ? 'var(--signal)' : p.passed ? 'var(--foreground)' : 'var(--crit)'
  return (
    <div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 22, right: 48, bottom: 4, left: 0 }} barCategoryGap="28%">
            <XAxis
              dataKey="count"
              axisLine={false}
              tickLine={false}
              tick={({ x, y, payload }) => {
                const p = data.find((d) => d.count === payload.value)
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text y={12} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--foreground)">
                      {payload.value} роб.
                    </text>
                    <text y={28} textAnchor="middle" fontSize={11} fill="var(--muted-foreground)">
                      {p?.passed ? formatYears(p.payback_years) : 'не держит'}
                    </text>
                  </g>
                )
              }}
              height={36}
            />
            <YAxis hide domain={[0, 100]} />
            <ReferenceLine
              y={result.target_pct ?? undefined}
              stroke="var(--ink-4)"
              strokeDasharray="4 4"
              label={{
                value: `цель ${formatNumber(result.target_pct)} %`,
                position: 'right',
                fontSize: 11,
                fill: 'var(--ink-4)',
              }}
            />
            <Tooltip
              cursor={{ fill: 'rgba(0,0,0,0.03)' }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as (Point & { worst: number }) | undefined
                if (!active || !p) return null
                return (
                  <div className="rounded-lg bg-ink px-3 py-2 text-[12px] text-white shadow-float">
                    <div className="font-medium">{p.count} роботов</div>
                    <div className="num text-white/80">
                      срок: в среднем {formatPct(p.sla_achieved_pct, { digits: 0 })}, худший{' '}
                      {formatPct(p.worst, { digits: 0 })}
                    </div>
                    <div className="num text-white/80">
                      загрузка {formatPct(p.utilization, { share: true, digits: 0 })}
                    </div>
                    <div className="num text-white/80">
                      {p.passed ? `окупаемость ${formatYears(p.payback_years)}` : 'парк не держит срок'}
                    </div>
                    <div className="mt-0.5 text-white/50">нажмите, чтобы открыть прогон</div>
                  </div>
                )
              }}
            />
            <Bar
              dataKey="worst"
              radius={[4, 4, 0, 0]}
              maxBarSize={64}
              cursor="pointer"
              animationDuration={700}
              onClick={(entry) => {
                const p = entry?.payload as Point | undefined
                if (p) onOpen(p.count, p.simulation_id ?? null)
              }}
            >
              {data.map((p) => (
                <Cell key={p.count} fill={fill(p)} opacity={p.count === shown ? 1 : 0.88} />
              ))}
              <LabelList
                dataKey="worst"
                content={({ x, y, width, index }) => {
                  const p = index !== undefined ? data[index] : undefined
                  if (!p) return null
                  return (
                    <text
                      x={Number(x ?? 0) + Number(width ?? 0) / 2}
                      y={Number(y ?? 0) - 8}
                      textAnchor="middle"
                      fontSize={12.5}
                      fontWeight={600}
                      fill={p.passed ? 'var(--foreground)' : 'var(--crit)'}
                      stroke="var(--card)"
                      strokeWidth={4}
                      paintOrder="stroke"
                    >
                      {formatNumber(p.worst, 0)} %
                    </text>
                  )
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
        <Legend color="bg-signal" text="в расчёте" />
        <Legend color="bg-ink" text="держит срок" />
        <Legend color="bg-crit" text="не держит" />
        <span>высота — худший из прогонов пика</span>
      </div>
    </div>
  )
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('size-2.5 rounded-[3px]', color)} />
      {text}
    </span>
  )
}

function VsLine({ summary }: { summary: SimulationSummary }) {
  const vs = summary.vs_analytic
  const label = VS_LABEL[vs.verdict]
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-surface-2 px-6 py-3.5 text-[13px]">
      <span className="hud">Расчёт против имитации</span>
      <span className="num">
        <span className="font-semibold">{formatNumber(vs.analytic_throughput_per_hour)}</span>{' '}
        <span className="text-ink-3">ед/ч по формуле</span>
      </span>
      <span className="num">
        <span className="font-semibold">{formatNumber(vs.sim_throughput_per_hour)}</span>{' '}
        <span className="text-ink-3">ед/ч в имитации · {formatPct(vs.delta_pct, { digits: 0 })}</span>
      </span>
      {label && <Pill tone={label.tone}>{label.text}</Pill>}
      {(vs.text || summary.completed_by_humans) && (
        <Hint>
          {vs.text && <p>{vs.text}</p>}
          {summary.completed_by_humans ? (
            <p>Задач ушло людям после превышения норматива ожидания: {summary.completed_by_humans}</p>
          ) : null}
        </Hint>
      )}
    </div>
  )
}

/* Почему формула и имитация расходятся — теми же числами, что в расчёте и в прогонах перебора. */
function WhyDifferent({
  sizing,
  formula,
  simulated,
  best,
}: {
  sizing: SizingResult
  formula: FleetEconomics
  simulated: FleetEconomics
  best: Point
}) {
  const { robot } = sizing
  if (formula.working === simulated.working) {
    return <p>Имитация подтвердила формулу: {simulated.working} роботов держат SLA во всех прогонах пика.</p>
  }
  const perRobot = best.throughput_per_hour / Math.max(1, best.count)
  const fewer = simulated.working < formula.working
  return (
    <div className="space-y-1.5">
      <p>
        <span className="font-medium text-ink">Формула</span> считает один робот за{' '}
        {formatNumber(robot.effective_throughput_per_hour, 1)} ед/ч:{' '}
        {formatNumber(robot.nominal_throughput_per_hour, 1)} по циклу × доступность{' '}
        {formatPct(robot.availability, { share: true, digits: 0 })} × целевая загрузка{' '}
        {formatPct(robot.utilization_target, { share: true, digits: 0 })}; каждый рейс — туда и обратно, обратно пустым.
      </p>
      <p>
        <span className="font-medium text-ink">Имитация</span>: {best.count} роботов реально везут{' '}
        {formatNumber(perRobot, 1)} ед/ч каждый при загрузке {formatPct(best.utilization, { share: true, digits: 0 })}
        {fewer
          ? ' — часть парка так же стоит на зарядке, но робот берёт ближайшую задачу вместо пустого возврата, работает без запаса 20 %, а короткая очередь укладывается в норматив срока.'
          : ' — заторы в проходах, очереди у ворот и зарядка съедают часть производительности.'}
      </p>
    </div>
  )
}

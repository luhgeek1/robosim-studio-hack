import { AnimatePresence, motion } from 'framer-motion'
import { Pause, Play, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useProjectId } from '@/entities/project'
import { SCENARIO_KIND_LABEL, useCalculation, useScenarios } from '@/entities/scenario'
import {
  isFinal,
  useFleetSweepResult,
  useSimulationRun,
  useSimulationTimeline,
  useSimulations,
  useStartFleetSweep,
  useStartSimulation,
  type SimulationRun,
  type SimulationSummary,
} from '@/entities/simulation'
import { parseApiProblem } from '@/shared/api/problem'
import type { SizingResult } from '@/shared/api/types'
import { formatNumber, formatPct, formatRub, formatYears } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Callout, Screen } from '@/shared/ui/page'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { EmptyState, ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { Bar, Dot, KpiNumber, Pill, Segmented, type Tone } from '@/shared/ui/v0'
import {
  MAX_ROBOTS,
  Twin,
  ZONE_NAMES,
  ZONE_STATUS_LABEL,
  robotStatus,
  useTwin,
  useTwinLoop,
  zoneStatus,
  type Live,
  type LoadMode,
} from '@/widgets/twin'
import { QueueSparkline } from './QueueSparkline'

const SEED = 1

function slaTone(sla: number, target: number): Tone {
  return sla >= target ? 'ok' : sla >= target - 7 ? 'warn' : 'crit'
}
const SLA_LABEL: Record<string, string> = { ok: 'SLA выполняется', warn: 'SLA под угрозой', crit: 'SLA не выполняется' }
const VS_LABEL: Record<string, { text: string; tone: Tone }> = {
  confirmed: { text: 'имитация подтверждает расчёт', tone: 'ok' },
  shortfall: { text: 'имитация ниже расчёта', tone: 'warn' },
  excess: { text: 'имитация выше расчёта', tone: 'accent' },
}

/* Живые цифры двойника — только из сводки бэкенда. Тон зоны — загрузка её ресурса: очередь приёмки к максимуму дня,
   флот в хранении и на отгрузке, станции отбора (если процесс их использует, иначе тоже флот). */
function toLive(summary: SimulationSummary): Live {
  const queueMax = Math.max(summary.queue?.max ?? 0, 1)
  const fleet = summary.utilization.fleet
  const stations = summary.stations?.count ? (summary.stations.utilization ?? fleet) : fleet
  return {
    throughput: summary.throughput_per_hour,
    queue: summary.queue?.avg ?? 0,
    utilization: fleet * 100,
    sla: summary.sla.achieved_pct,
    zones: [Math.min(1, (summary.queue?.avg ?? 0) / queueMax), fleet, stations, fleet],
  }
}

const fleetOf = (run: SimulationRun, processKey: string) => run.fleet?.find((f) => f.process_key === processKey)?.count

export function SimulationPage() {
  const projectId = useProjectId()
  const scenarios = useScenarios(projectId)
  const options = (scenarios.data ?? []).filter((s) => !s.is_baseline && s.last_calculation)
  const [picked, setPicked] = useState<string>()
  const scenario = options.find((s) => s.id === picked) ?? options.find((s) => s.is_recommended) ?? options[0]

  if (scenarios.isPending) {
    return (
      <Screen wide title="Справятся ли роботы">
        <LoadingBlock label="Загружаем сценарии…" />
      </Screen>
    )
  }
  if (scenarios.isError || !scenario) {
    return (
      <Screen
        wide
        title="Справятся ли роботы"
        lead="Имитация проверяет число роботов из расчёта на графе планировки: заторы, зарядка, SLA."
      >
        {scenarios.isError ? (
          <ErrorBlock error={scenarios.error} onRetry={() => scenarios.refetch()} />
        ) : (
          <EmptyState
            title="Нет рассчитанного сценария роботизации"
            description="Имитация запускается для сценария с готовым расчётом: она проверяет его число роботов."
            action={
              <Button asChild>
                <Link to={`/projects/${projectId}/scenarios`}>К сценариям</Link>
              </Button>
            }
          />
        )}
      </Screen>
    )
  }

  return (
    <SimulationView
      key={scenario.id}
      scenarioId={scenario.id}
      calculationId={scenario.last_calculation!.calculation_id}
      picker={
        options.length > 1 ? (
          <Select value={scenario.id} onValueChange={setPicked}>
            <SelectTrigger className="min-w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} · {SCENARIO_KIND_LABEL[s.kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null
      }
    />
  )
}

function SimulationView({
  scenarioId,
  calculationId,
  picker,
}: {
  scenarioId: string
  calculationId: string
  picker: React.ReactNode
}) {
  useTwinLoop()
  const calculation = useCalculation(calculationId)
  const runs = useSimulations(scenarioId)
  const start = useStartSimulation(scenarioId)
  const [mode, setMode] = useState<LoadMode>('peak')
  const [count, setCount] = useState<number | null>(null)
  const [runIds, setRunIds] = useState<Record<string, string>>({})
  const running = useTwin((s) => s.running)
  const live = useTwin((s) => s.live)
  const selection = useTwin((s) => s.selection)
  const { setRunning, setRobotCount, setLoadMode, setSelection, setTarget } = useTwin.getState()

  // Имитируем первый процесс сценария с моделью цикла: паллеты или G2P, остальные N остаются по расчёту.
  const sizing: SizingResult | undefined =
    calculation.data?.sizing.find((s) => s.robot.cycle_time_s != null) ?? calculation.data?.sizing[0]
  const analytic = sizing?.count.final ?? 0
  const chosen = count ?? analytic
  const counts = useMemo(() => {
    const base = Math.max(1, analytic)
    return [base - 2, base - 1, base, base + 1, base + 2].filter((n) => n >= 1)
  }, [analytic])

  const key = `${mode}:${chosen}`
  // Прогон с теми же условиями уже есть — берём его, а не запускаем заново.
  const existing = useMemo(
    () =>
      runs.data?.find(
        (r) =>
          r.status === 'done' &&
          r.summary &&
          (r.config.mode === mode || (mode === 'normal' && r.config.mode === 'custom')) &&
          (r.config.volume_multiplier ?? 1) === 1 &&
          sizing &&
          fleetOf(r, sizing.process_key) === chosen,
      ),
    [runs.data, mode, chosen, sizing],
  )
  const runId = runIds[key] ?? existing?.id ?? null
  const run = useSimulationRun(runId)
  const summary = run.data?.status === 'done' ? run.data.summary : null
  const timeline = useSimulationTimeline(runId, Boolean(summary))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setRobotCount(Math.min(chosen, MAX_ROBOTS))
    setLoadMode(mode)
  }, [chosen, mode, setRobotCount, setLoadMode])

  useEffect(() => {
    if (!sizing || runId || runs.isPending || start.isPending) return
    setError(null)
    start.mutate(
      {
        mode,
        duration_hours: 24,
        seed: SEED,
        volume_multiplier: 1,
        fleet_override: [{ process_key: sizing.process_key, count: chosen }],
        record_events: false,
        compare_baseline: false,
      },
      {
        onSuccess: (created) => setRunIds((prev) => ({ ...prev, [key]: created.id })),
        onError: (e) => setError(parseApiProblem(e).detail),
      },
    )
    // Запуск только при смене конфигурации; повторный вызов с тем же ключом не нужен.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, sizing?.process_key, runId, runs.isPending])

  useEffect(() => {
    setTarget(summary ? toLive(summary) : null)
  }, [summary, setTarget])

  const busy = !summary && (start.isPending || (run.data && !isFinal(run.data.status)) || (runId === null && !error))
  const failed = run.data?.status === 'failed' ? (run.data.error?.detail ?? 'Прогон завершился с ошибкой') : null
  const target = sizing
    ? mode === 'peak'
      ? sizing.demand_peak_per_hour
      : (sizing.demand_avg_per_hour ?? sizing.demand_peak_per_hour)
    : 0
  const slaTarget = summary?.sla.target_pct ?? 95
  const tone = slaTone(live.sla, slaTarget)
  const vs = summary?.vs_analytic
  const lead = !sizing
    ? 'В сценарии нет процесса с моделью цикла — имитировать нечего.'
    : chosen === analytic
      ? `Расчёт дал ${analytic} роботов на процесс «${sizing.product_name ?? ''}». Переключите количество и режим нагрузки — двойник и показатели пересчитаются по имитации.`
      : chosen < analytic
        ? 'Конфигурация дешевле расчётной: смотрите очередь на приёмке и SLA.'
        : 'Конфигурация с запасом: часть роботов простаивает, экономика хуже.'

  return (
    <Screen
      wide
      title={
        <>
          {chosen} × {sizing?.product_name ?? '…'}
          {summary && (
            <span className="ml-3 align-middle">
              <Pill tone={tone} className="!h-7 !px-2.5 !text-[13px]">
                <Dot tone={tone} pulse={tone !== 'ok'} />
                {SLA_LABEL[tone]}
              </Pill>
            </span>
          )}
        </>
      }
      lead={lead}
      actions={picker}
      nextLabel="Далее: отчёт"
      nextDisabled
    >
      {calculation.isPending && <LoadingBlock label="Загружаем расчёт…" />}
      {calculation.isError && <ErrorBlock error={calculation.error} onRetry={() => calculation.refetch()} />}
      {error && (
        <Callout tone="crit" className="mb-4">
          Имитация не запустилась: {error}
        </Callout>
      )}

      {sizing && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
          <div className="card relative h-160 overflow-hidden">
            <Twin mode="sim" />

            <AnimatePresence>
              {selection && (
                <motion.div
                  key={selection.kind + selection.index}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className="absolute top-4 right-4 z-10 w-65 rounded-[12px] border border-line bg-white/95 p-4 shadow-card backdrop-blur"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="meta">{selection.kind === 'zone' ? 'Зона' : 'Робот'}</div>
                      <div className="h3">
                        {selection.kind === 'zone'
                          ? ZONE_NAMES[selection.index]
                          : `${sizing.product_name ?? 'Робот'} · ${selection.index + 1}`}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="text-ink-4 hover:text-ink"
                      onClick={() => setSelection(null)}
                      aria-label="Закрыть"
                    >
                      <X size={15} />
                    </button>
                  </div>
                  {selection.kind === 'zone' ? (
                    <ZoneInfo index={selection.index} />
                  ) : (
                    <RobotInfo index={selection.index} util={live.utilization} />
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {busy && (
                <motion.div
                  key="busy"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="pointer-events-none absolute bottom-21 left-1/2 z-10 flex w-[min(520px,90%)] -translate-x-1/2 items-center justify-center gap-2 rounded-[12px] bg-ink px-5 py-3 text-center text-[14px] font-medium text-white shadow-float"
                >
                  <Spinner /> Считаем день имитацией{run.data?.stage ? `: ${run.data.stage}` : '…'}
                  {run.data && run.data.progress > 0 && (
                    <span className="num text-white/70">{Math.round(run.data.progress * 100)} %</span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-[14px] border border-line bg-white/95 p-2 shadow-card backdrop-blur">
              <Segmented
                layoutId="robots-count"
                value={chosen}
                onChange={setCount}
                options={counts.map((n) => ({
                  value: n,
                  label: `${n} роботов`,
                  hint: n === analytic ? 'по расчёту' : undefined,
                }))}
              />
              <div className="h-6 w-px bg-line" />
              <Segmented
                layoutId="load-mode"
                value={mode}
                onChange={setMode}
                options={[
                  {
                    value: 'normal',
                    label: 'Обычный день',
                    hint: `${formatNumber(sizing.demand_avg_per_hour)} ед/ч в среднем`,
                  },
                  { value: 'peak', label: 'Пик', hint: `${formatNumber(sizing.demand_peak_per_hour)} ед/ч` },
                ]}
              />
              <div className="h-6 w-px bg-line" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRunning(!running)}
                aria-label={running ? 'Пауза' : 'Продолжить'}
              >
                {running ? <Pause /> : <Play />}
                <span className="hidden sm:inline">{running ? 'Пауза' : 'Продолжить'}</span>
              </Button>
            </div>

            <div className="pointer-events-none absolute top-4 left-4 z-10 flex items-center gap-2">
              <span className="rounded-full border border-line bg-white/90 px-2.5 py-1 text-[12px] text-ink-3">
                нагрузка сейчас <span className="num font-medium text-ink">{formatNumber(target)} ед/ч</span>
              </span>
              {chosen > MAX_ROBOTS && (
                <span className="rounded-full bg-white/90 px-2.5 py-1 text-[12px] text-ink-3">
                  на сцене {MAX_ROBOTS} из {chosen}
                </span>
              )}
              {!running && (
                <span className="rounded-full bg-ink px-2.5 py-1 text-[12px] font-medium text-white">Пауза</span>
              )}
            </div>
          </div>

          <aside className="card scroll-thin flex h-160 flex-col overflow-y-auto">
            <div className="p-5">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-ink-2">Вовремя · SLA</span>
                <span className="meta">цель {formatNumber(slaTarget)} %</span>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <KpiNumber
                  value={live.sla}
                  digits={live.sla >= 99 ? 1 : 0}
                  className={`display text-[44px] ${tone === 'ok' ? 'text-ink' : tone === 'warn' ? 'text-warn' : 'text-crit'}`}
                />
                <span className="display text-[22px] text-ink-3">%</span>
              </div>
              <div className="relative mt-2 h-2 w-full rounded-full bg-black/6">
                <motion.div
                  className={`h-full rounded-full ${tone === 'ok' ? 'bg-ink' : tone === 'warn' ? 'bg-warn' : 'bg-crit'}`}
                  initial={false}
                  animate={{ width: `${Math.max(0, Math.min(100, live.sla))}%` }}
                  transition={{ type: 'spring', stiffness: 120, damping: 24 }}
                />
                <span
                  className="absolute -top-1 h-4 w-px bg-ink-2"
                  style={{ left: `${slaTarget}%` }}
                  title={`Цель ${slaTarget} %`}
                />
              </div>
              {failed && <p className="mt-2 text-[12.5px] text-crit">{failed}</p>}
            </div>

            <div className="grid grid-cols-3 divide-x divide-line border-y border-line">
              <Kpi
                label="Мощность"
                value={live.throughput}
                unit="ед/ч"
                hint={`нужно ${formatNumber(target)}`}
                tone={live.throughput >= target ? 'neutral' : 'crit'}
              />
              <Kpi
                label="Очередь"
                value={live.queue}
                unit="задач"
                hint={summary ? `максимум ${summary.queue?.max ?? 0}` : undefined}
                tone={live.queue > 15 ? 'crit' : live.queue > 6 ? 'warn' : 'neutral'}
              />
              <Kpi
                label="Загрузка флота"
                value={live.utilization}
                unit="%"
                hint={live.utilization > 90 ? 'без запаса' : live.utilization < 55 ? 'простой' : 'оптимально'}
                tone={live.utilization > 90 ? 'crit' : live.utilization < 55 ? 'warn' : 'neutral'}
              />
            </div>

            <div className="p-5">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="h3">Нагрузка по зонам</span>
                <span className="meta">нажмите, чтобы выделить</span>
              </div>
              <ul className="space-y-2.5">
                {ZONE_NAMES.map((z, i) => {
                  const load = live.zones[i]
                  const st = zoneStatus(load)
                  const t: Tone = st === 'critical' ? 'crit' : st === 'high' ? 'warn' : 'neutral'
                  return (
                    <li key={z}>
                      <button
                        type="button"
                        onClick={() =>
                          setSelection(
                            selection?.kind === 'zone' && selection.index === i ? null : { kind: 'zone', index: i },
                          )
                        }
                        className="group w-full text-left"
                      >
                        <div className="mb-1 flex items-center justify-between text-[13px]">
                          <span className="text-ink group-hover:text-info">{z}</span>
                          <span className="flex items-center gap-2">
                            <span
                              className={`text-[12px] ${t === 'crit' ? 'text-crit' : t === 'warn' ? 'text-warn' : 'text-ink-3'}`}
                            >
                              {ZONE_STATUS_LABEL[st]}
                            </span>
                            <KpiNumber value={load * 100} className="w-9 text-right text-ink-2" suffix=" %" />
                          </span>
                        </div>
                        <Bar value={load * 100} tone={t} height={5} />
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="meta mt-2">
                Приёмка — очередь к максимуму дня, хранение — загрузка флота, комплектация — станции, отгрузка — доля
                выполненного.
              </p>
              {timeline.data && (
                <div className="mt-4">
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-[13px] text-ink-2">Очередь в течение дня</span>
                    <span className="meta">по таймлайну прогона</span>
                  </div>
                  <QueueSparkline points={timeline.data.points} />
                </div>
              )}
            </div>

            {summary && (
              <div className="border-y border-line bg-surface-2 p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="h3">Расчёт против имитации</span>
                  {vs && (
                    <Pill tone={VS_LABEL[vs.verdict]?.tone ?? 'neutral'}>
                      {VS_LABEL[vs.verdict]?.text ?? vs.verdict}
                    </Pill>
                  )}
                </div>
                {vs && (
                  <>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <div className="display num text-[22px]">{formatNumber(vs.analytic_throughput_per_hour)}</div>
                        <div className="meta">ед/ч по циклу</div>
                      </div>
                      <div>
                        <div className="display num text-[22px]">{formatNumber(vs.sim_throughput_per_hour)}</div>
                        <div className="meta">ед/ч по имитации ({formatPct(vs.delta_pct, { digits: 0 })})</div>
                      </div>
                    </div>
                    {vs.text && <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{vs.text}</p>}
                  </>
                )}
                {summary.bottleneck && summary.bottleneck.resource_kind !== 'none' && (
                  <div className="mt-3 rounded-[10px] bg-white p-3 text-[13px] leading-relaxed">
                    <div className="font-medium text-ink">
                      Узкое место: {summary.bottleneck.resource_name ?? summary.bottleneck.resource_kind}
                    </div>
                    <div className="text-ink-2">{summary.bottleneck.explanation}</div>
                    {summary.bottleneck.suggestion && (
                      <div className="mt-1 text-ink-3">Что сделать: {summary.bottleneck.suggestion}</div>
                    )}
                  </div>
                )}
                {summary.completed_by_humans ? (
                  <p className="meta mt-2">
                    Задач ушло людям после превышения норматива ожидания: {summary.completed_by_humans}
                  </p>
                ) : null}
              </div>
            )}

            <FleetSweep scenarioId={scenarioId} processKey={sizing.process_key} analytic={analytic} onPick={setCount} />
          </aside>
        </div>
      )}
    </Screen>
  )
}

/* Перебор флота — это то, что записывает N в сценарий: следующий расчёт берёт число роботов из имитации (D-007). */
function FleetSweep({
  scenarioId,
  processKey,
  analytic,
  onPick,
}: {
  scenarioId: string
  processKey: string
  analytic: number
  onPick: (n: number) => void
}) {
  const start = useStartFleetSweep(scenarioId)
  const [jobId, setJobId] = useState<string | null>(null)
  const result = useFleetSweepResult(scenarioId, jobId)
  const pending = start.isPending || (Boolean(jobId) && result.isPending)
  return (
    <div className="p-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="h3">Сколько роботов нужно на самом деле</span>
      </div>
      <p className="text-[13px] leading-relaxed text-ink-2">
        Перебор ищет минимальное N, при котором имитация пикового дня выполняет SLA. Найденное число записывается в
        сценарий: следующий расчёт возьмёт его вместо {analytic} по циклу.
      </p>
      <Button
        size="sm"
        className="mt-3"
        disabled={pending}
        onClick={() =>
          start.mutate({ process_key: processKey, mode: 'peak', seed: SEED }, { onSuccess: (job) => setJobId(job.id) })
        }
      >
        {pending ? <Spinner /> : <Sparkles />} {pending ? 'Перебираем флот…' : 'Подобрать N имитацией'}
      </Button>
      {result.isError && !pending && (
        <p className="mt-2 text-[12.5px] text-crit">{parseApiProblem(result.error).detail}</p>
      )}
      {result.data && (
        <div className="mt-4 space-y-3">
          <div className="flex items-baseline gap-3">
            <span className="display num text-[32px]">{result.data.recommended_count ?? '—'}</span>
            <span className="text-[13px] text-ink-2">
              {result.data.recommended_count != null ? 'роботов по имитации' : 'даже тройной парк не выполняет SLA'}
            </span>
          </div>
          <p className="text-[13px] leading-relaxed text-ink-2">{result.data.explanation}</p>
          <table className="w-full text-[12.5px]">
            <thead className="text-ink-3">
              <tr>
                <th className="py-1 text-left font-normal">N</th>
                <th className="py-1 text-right font-normal">SLA</th>
                <th className="py-1 text-right font-normal">Загрузка</th>
                <th className="py-1 text-right font-normal">Окупаемость</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {result.data.points.map((p) => (
                <tr key={p.count} className={p.count === result.data!.recommended_count ? 'font-semibold' : ''}>
                  <td className="py-1">
                    <button type="button" className="num hover:text-info" onClick={() => onPick(p.count)}>
                      {p.count}
                    </button>
                  </td>
                  <td className={`num py-1 text-right ${p.passed ? 'text-ok' : 'text-crit'}`}>
                    {formatPct(p.sla_achieved_pct, { digits: 0 })}
                  </td>
                  <td className="num py-1 text-right">{formatPct(p.utilization, { share: true, digits: 0 })}</td>
                  <td className="num py-1 text-right">
                    {p.payback_years != null
                      ? formatYears(p.payback_years)
                      : p.capex_rub != null
                        ? formatRub(p.capex_rub)
                        : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.data.applied && (
            <p className="meta">
              N записано в сценарий — пересчитайте его на шаге «Сценарии», чтобы экономика взяла число из имитации.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Kpi({
  label,
  value,
  unit,
  hint,
  digits = 0,
  tone = 'neutral',
}: {
  label: string
  value: number
  unit: string
  hint?: string
  digits?: number
  tone?: Tone
}) {
  const c = tone === 'crit' ? 'text-crit' : tone === 'warn' ? 'text-warn' : 'text-ink'
  return (
    <div className="px-4 py-4">
      <div className="text-[12.5px] text-ink-3">{label}</div>
      <div className="mt-1 flex items-baseline gap-1 whitespace-nowrap">
        <KpiNumber value={value} digits={digits} className={`display text-[24px] ${c}`} />
        <span className="text-[12px] text-ink-3">{unit}</span>
      </div>
      {hint && (
        <div
          className={`mt-0.5 text-[12px] whitespace-nowrap ${tone === 'crit' ? 'text-crit' : tone === 'warn' ? 'text-warn' : 'text-ink-3'}`}
        >
          {hint}
        </div>
      )}
    </div>
  )
}

function ZoneInfo({ index }: { index: number }) {
  const load = useTwin((s) => s.live.zones[index])
  const queue = useTwin((s) => s.live.queue)
  const st = zoneStatus(load)
  const t: Tone = st === 'critical' ? 'crit' : st === 'high' ? 'warn' : 'ok'
  const facts: Record<number, string[]> = {
    0: [`Очередь ${Math.round(queue)} задач`, 'Тон — очередь относительно максимума дня'],
    1: ['Паллетное хранение', 'Тон — загрузка флота по имитации'],
    2: ['Станции комплектации', 'Тон — загрузка станций по имитации'],
    3: ['Доки отгрузки', 'Тон — загрузка флота по имитации'],
  }
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-[13px]">
        <span className="text-ink-2">Нагрузка</span>
        <span className="num font-medium">{Math.round(load * 100)} %</span>
      </div>
      <Bar value={load * 100} tone={t === 'ok' ? 'neutral' : t} height={5} />
      <div className="mt-2">
        <Pill tone={t}>{ZONE_STATUS_LABEL[st]}</Pill>
      </div>
      <ul className="mt-3 space-y-1 text-[13px] text-ink-2">
        {facts[index].map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </div>
  )
}

function RobotInfo({ index, util }: { index: number; util: number }) {
  const st = robotStatus(index)
  return (
    <div className="mt-3 space-y-2 text-[13px]">
      <div className="flex items-center justify-between">
        <span className="text-ink-2">Статус</span>
        <span className="font-medium">{st.task}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-ink-2">Груз</span>
        <span className="font-medium">{st.loaded ? 'паллета на борту' : 'пусто'}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-ink-2">Загрузка флота</span>
        <span className="num font-medium">{Math.round(util)} %</span>
      </div>
    </div>
  )
}

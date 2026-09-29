import { AnimatePresence, motion } from 'framer-motion'
import { Camera, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Link } from 'react-router'
import { useLayout } from '@/entities/layout'
import { useProject, useProjectId } from '@/entities/project'
import { useObjectType } from '@/entities/reference'
import { useUploadVisual } from '@/entities/report'
import { SCENARIO_KIND_LABEL, useCalculation, useCountSource, useScenarios } from '@/entities/scenario'
import {
  SWEEP_SEED,
  buildTracks,
  isFinal,
  poseAt,
  useFleetSweep,
  useLastSweep,
  usePlayback,
  useSimulationHeatmap,
  useSimulationReplay,
  useSimulationRun,
  useSimulationTimeline,
  useSimulations,
  useStartSimulation,
  type FleetEconomics,
  type FleetSweepResult,
  type RobotTrack,
  type SimulationRun,
  type SimulationSummary,
  type SimulationTimeline,
} from '@/entities/simulation'
import { parseApiProblem, problemText } from '@/shared/api/problem'
import type { Scenario, SizingResult } from '@/shared/api/types'
import { formatDate, formatNumber, formatPct, formatRub, formatYears, pluralRu } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Callout, Screen } from '@/shared/ui/page'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { EmptyState, ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { Toggle } from '@/shared/ui/toggle'
import { Bar, KpiNumber, Pill, Segmented, type Tone } from '@/shared/ui/v0'
import { Twin, type TwinCapture, type TwinView } from '@/widgets/twin'
import { PlayerBar, clock, usePlaybackDriver } from './PlayerBar'
import { QueueSparkline } from './QueueSparkline'

const SEED = SWEEP_SEED
// Стресс-тесты шага «Имитация» из docs/PRODUCT.md: +20 % объёма и отказ одного робота на 2 часа в начале смены.
const STRESS = {
  volumeMultiplier: 1.2,
  failure: { robot_index: 0, at_hour: 1, duration_hours: 2 },
} as const

type Mode = 'peak' | 'normal'
type RunConfig = { count: number; mode: Mode; volume: boolean; failure: boolean }

function slaTone(sla: number, target: number): Tone {
  return sla >= target ? 'ok' : sla >= target - 7 ? 'warn' : 'crit'
}
const VS_LABEL: Record<string, { text: string; tone: Tone }> = {
  confirmed: { text: 'имитация подтверждает расчёт', tone: 'ok' },
  shortfall: { text: 'имитация ниже расчёта', tone: 'warn' },
  excess: { text: 'имитация выше расчёта', tone: 'accent' },
}
const STATE_LABEL: Record<string, string> = {
  moving: 'в пути',
  loading: 'погрузка',
  unloading: 'выгрузка',
  charging: 'зарядка',
  waiting: 'ожидание в заторе',
  idle: 'простой',
  failed: 'отказ',
}
const POSE_LABEL: Record<string, string> = {
  moving: 'в пути',
  load: 'погрузка',
  unload: 'выгрузка',
  charge: 'на зарядке',
  wait: 'ждёт в заторе',
  idle: 'свободен',
  fail: 'отказ',
}

const fleetOf = (run: SimulationRun, processKey: string) => run.fleet?.find((f) => f.process_key === processKey)?.count

// Пиковые часы экрана — то же окно, что у перебора флота; прогоны «24 ч пика» из прежней версии экрана не подходят.
const PEAK_WINDOW_MAX_H = 12

const configOf = (run: SimulationRun, processKey: string): RunConfig | null => {
  const count = fleetOf(run, processKey)
  if (count == null) return null
  if (run.config.mode === 'peak' && (run.summary?.duration_hours ?? 0) > PEAK_WINDOW_MAX_H) return null
  return {
    count,
    mode: run.config.mode === 'peak' ? 'peak' : 'normal',
    volume: (run.config.volume_multiplier ?? 1) > 1,
    failure: (run.config.failures?.length ?? 0) > 0,
  }
}

const configKey = (c: RunConfig) => `${c.count}:${c.mode}:${c.volume ? 'v' : ''}:${c.failure ? 'f' : ''}`

// A usable run has the event log for the player; runs without it (record_events: false) are KPI-only.
const usable = (run: SimulationRun) =>
  run.status !== 'failed' && run.status !== 'cancelled' && (!isFinal(run.status) || (run.events_count ?? 0) > 0)

export function SimulationPage() {
  const projectId = useProjectId()
  const project = useProject(projectId).data
  const objectType = useObjectType(project?.object_type ?? '')
  const scenarios = useScenarios(projectId)
  const options = (scenarios.data ?? []).filter((s) => !s.is_baseline && s.last_calculation)
  const [picked, setPicked] = useState<string>()
  const scenario = options.find((s) => s.id === picked) ?? options.find((s) => s.is_recommended) ?? options[0]

  if (scenarios.isPending || objectType.isPending) {
    return (
      <Screen title="Справятся ли роботы">
        <LoadingBlock label="Загружаем сценарии…" />
      </Screen>
    )
  }
  if (objectType.data && objectType.data.depth !== 'full') {
    return (
      <Screen title="Имитация для этого типа объекта — следующим этапом">
        <EmptyState
          title="Число роботов посчитано по времени цикла"
          description="Дискретно-событийная имитация сейчас построена для склада. Для аэропорта и больницы количество роботов берётся из расчёта по времени цикла с резервом — его видно в сценариях и сравнении."
        />
      </Screen>
    )
  }
  if (scenarios.isError || !scenario) {
    return (
      <Screen
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
      projectId={projectId}
      scenario={scenario}
      variants={options.filter((s) => s.id !== scenario.id)}
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
  projectId,
  scenario,
  variants,
  calculationId,
  picker,
}: {
  projectId: string
  scenario: Scenario
  variants: Scenario[]
  calculationId: string
  picker: React.ReactNode
}) {
  usePlaybackDriver()
  const calculation = useCalculation(calculationId)
  const runs = useSimulations(scenario.id)
  const start = useStartSimulation(scenario.id)
  const projectLayout = useLayout(projectId)

  // Имитируем процесс сценария с моделью цикла (паллеты или G2P); остальные N остаются по расчёту.
  const sizing: SizingResult | undefined =
    calculation.data?.sizing.find((s) => s.count.simulation_id) ??
    calculation.data?.sizing.find((s) => s.robot.cycle_time_s != null) ??
    calculation.data?.sizing[0]
  // Имитация проверяет рабочий парк, который сейчас в расчёте (без резерва на отказы): по перебору флота, по формуле
  // или заданный вручную.
  const working = sizing ? workingCount(sizing) : 0
  const lastSweep = useLastSweep(scenario.id, sizing?.process_key).data ?? undefined
  const [draft, setDraft] = useState<Omit<RunConfig, 'count'> & { count: number | null }>({
    count: null,
    mode: 'peak',
    volume: false,
    failure: false,
  })
  const config: RunConfig = { ...draft, count: draft.count ?? Math.max(1, working) }
  const key = configKey(config)
  const counts = useMemo(() => {
    const base = Math.max(1, working)
    return [base - 2, base - 1, base, base + 1, base + 2].filter((n) => n >= 1)
  }, [working])

  const [runIds, setRunIds] = useState<Record<string, string>>({})
  // Прогон с теми же условиями уже есть — берём его; прогон, записавший N в сценарий, — первым.
  const existing = useMemo(() => {
    if (!sizing) return undefined
    const matching = (runs.data ?? []).filter((r) => {
      const c = configOf(r, sizing.process_key)
      return usable(r) && c !== null && configKey(c) === key
    })
    return matching.find((r) => r.id === sizing.count.simulation_id) ?? matching[0]
  }, [runs.data, sizing, key])
  const runId = runIds[key] ?? existing?.id ?? null
  const run = useSimulationRun(runId)
  const summary = run.data?.status === 'done' ? run.data.summary : null
  const ready = Boolean(summary)
  const replay = useSimulationReplay(runId, ready)
  const timeline = useSimulationTimeline(runId, ready)
  // Flow and congestion is a layer of the map (the map's own toolbar), not a run condition.
  const heat = useSimulationHeatmap(runId, ready)
  const [error, setError] = useState<string | null>(null)
  const [selectedRobot, setSelectedRobot] = useState<string | null>(null)
  const capture: TwinCapture = useRef(null)
  const [view, setView] = useState<TwinView>('3d')
  const upload = useUploadVisual(projectId)

  useEffect(() => {
    if (!sizing || runId || runs.isPending || start.isPending || error) return
    start.mutate(
      {
        mode: config.mode,
        // Пик — окно `sim_peak_duration_hours` бэкенда, то же, что у перебора флота; обычный день — сутки.
        ...(config.mode === 'normal' ? { duration_hours: 24 } : {}),
        seed: SEED,
        volume_multiplier: config.volume ? STRESS.volumeMultiplier : 1,
        fleet_override: [{ process_key: sizing.process_key, count: config.count }],
        failures: config.failure ? [STRESS.failure] : [],
        record_events: true,
        compare_baseline: false,
      },
      {
        onSuccess: (created) => setRunIds((prev) => ({ ...prev, [key]: created.id })),
        onError: (e) => setError(parseApiProblem(e).detail),
      },
    )
    // Запуск только при смене условий прогона; повторный вызов с тем же ключом не нужен.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, sizing?.process_key, runId, runs.isPending, error])

  const tracks = useMemo(() => (replay.data ? buildTracks(replay.data, replay.data.layout) : undefined), [replay.data])
  useEffect(() => {
    if (replay.data && runId) usePlayback.getState().load(runId, replay.data.total_seconds)
  }, [replay.data, runId])

  const change = (next: Partial<RunConfig>) => {
    setError(null)
    setSelectedRobot(null)
    setDraft((d) => ({ ...d, count: d.count ?? config.count, ...next }))
  }
  const openRun = (count: number, simulationId: string | null) => {
    const next: RunConfig = { count, mode: 'peak', volume: false, failure: false }
    if (simulationId) setRunIds((prev) => ({ ...prev, [configKey(next)]: simulationId }))
    change(next)
  }

  const layout = replay.data?.layout ?? projectLayout.data
  const busy = !summary && (start.isPending || (run.data && !isFinal(run.data.status)) || (runId === null && !error))
  const failed = run.data?.status === 'failed' ? (run.data.error?.detail ?? 'Прогон завершился с ошибкой') : null
  const target = sizing
    ? config.mode === 'peak'
      ? sizing.demand_peak_per_hour
      : (sizing.demand_avg_per_hour ?? sizing.demand_peak_per_hour)
    : 0
  const variantIds = sizing
    ? variants.filter((s) => s.items.some((i) => i.process_key === sizing.process_key)).map((s) => s.id)
    : []

  // ТЗ 3.7.4: снимок текущего кадра плеера уходит в PDF-отчёт вместе с условиями прогона и моментом времени.
  const snapshot = async () => {
    if (!runId || !capture.current || !sizing) return
    const png = await capture.current()
    if (!png) {
      toast.error('Не удалось сделать снимок сцены')
      return
    }
    const conditions = [
      config.mode === 'peak' ? 'пиковые часы' : 'обычный день',
      config.volume ? '+20 % объёма' : null,
      config.failure ? 'отказ робота на 2 ч' : null,
    ].filter(Boolean)
    const caption = `${config.count} × ${sizing.product_name ?? 'робот'}, ${conditions.join(', ')}, момент ${clock(usePlayback.getState().t)}`
    upload.mutate(
      { simulationId: runId, png, caption },
      {
        onSuccess: () => toast.success('Снимок добавлен в отчёт'),
        onError: (e) => toast.error(problemText(e)),
      },
    )
  }

  const lead = !sizing
    ? 'В сценарии нет процесса с моделью цикла — имитировать нечего.'
    : summary
      ? undefined
      : 'Имитация прогонит день на планировке объекта и проверит, успевает ли парк выполнять задачи в срок.'

  return (
    <Screen
      title={
        <>
          {config.count} × {sizing?.product_name ?? '…'}
        </>
      }
      lead={lead}
      actions={picker}
    >
      {calculation.isPending && <LoadingBlock label="Загружаем расчёт…" />}
      {calculation.isError && <ErrorBlock error={calculation.error} onRetry={() => calculation.refetch()} />}

      {sizing && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Segmented
              value={config.count}
              onChange={(count) => change({ count })}
              options={counts.map((n) => ({
                value: n,
                label: `${n} роб.`,
                hint: n === working ? COUNT_HINT[sizing.count.source] : undefined,
              }))}
            />
            <Segmented
              value={config.mode}
              onChange={(mode) => change({ mode })}
              options={[
                {
                  value: 'peak',
                  label: 'Пиковые часы',
                  hint: `${formatNumber(sizing.demand_peak_per_hour)} ед/ч без передышки, как в переборе флота`,
                },
                {
                  value: 'normal',
                  label: 'Обычный день',
                  hint: `сутки: ${formatNumber(sizing.demand_avg_per_hour)} ед/ч в среднем, пик в середине смены`,
                },
              ]}
            />
            <Toggle variant="outline" pressed={config.volume} onPressedChange={(volume) => change({ volume })}>
              +20 % объёма
            </Toggle>
            <Toggle variant="outline" pressed={config.failure} onPressedChange={(failure) => change({ failure })}>
              Отказ робота на 2 ч
            </Toggle>
            <Button
              variant="outline"
              size="sm"
              disabled={!tracks || upload.isPending}
              onClick={() => void snapshot()}
              title="Схема или 3D-вид в текущий момент прогона попадёт в PDF-отчёт"
            >
              {upload.isPending ? <Spinner /> : <Camera />} Снимок в отчёт
            </Button>
          </div>

          <WhatIfNote sizing={sizing} config={config} working={working} />
          {error && (
            <Callout tone="crit" className="mb-4">
              Имитация не запустилась: {error}. Сейчас имитация строится для транспортных роботов и «товар к человеку»;
              для остальных типов число роботов остаётся по расчёту времени цикла.
            </Callout>
          )}
          {replay.isError && (
            <Callout tone="crit" className="mb-4">
              Журнал событий не загрузился: {parseApiProblem(replay.error).detail}
            </Callout>
          )}

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
            {/* The player sits under the scene, not over it: the plan's labels and the legend stay visible. */}
            <div className="flex h-[min(640px,calc(100vh-230px))] min-h-110 flex-col gap-3">
              <div className="card relative min-h-0 flex-1 overflow-hidden">
                {layout ? (
                  <Twin
                    layout={layout}
                    capture={capture}
                    view={view}
                    onViewChange={setView}
                    tracks={tracks}
                    heat={heat.data ?? null}
                    selectedRobot={selectedRobot}
                    onSelectRobot={setSelectedRobot}
                  />
                ) : projectLayout.isPending ? (
                  <LoadingBlock label="Загружаем планировку…" />
                ) : (
                  <EmptyState
                    title="Планировка не построена"
                    description="Имитация идёт по графу проездов планировки. Постройте её на шаге «Планировка»."
                    action={
                      <Button asChild>
                        <Link to={`/projects/${projectId}/layout`}>К планировке</Link>
                      </Button>
                    }
                  />
                )}

                <AnimatePresence>
                  {selectedRobot && tracks && summary && (
                    <RobotCard
                      key={selectedRobot}
                      track={tracks.find((t) => t.id === selectedRobot)}
                      summary={summary}
                      onClose={() => setSelectedRobot(null)}
                    />
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {busy && (
                    <motion.div
                      key="busy"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="pointer-events-none absolute bottom-14 left-1/2 z-10 flex w-[min(520px,90%)] -translate-x-1/2 items-center justify-center gap-2 rounded-[12px] bg-ink px-5 py-3 text-center text-[14px] font-medium text-white shadow-float"
                    >
                      <Spinner /> Считаем день имитацией{run.data?.stage ? `: ${run.data.stage}` : '…'}
                      {run.data && run.data.progress > 0 && (
                        <span className="num text-white/70">{Math.round(run.data.progress * 100)} %</span>
                      )}
                    </motion.div>
                  )}
                  {ready && replay.isPending && (
                    <motion.div
                      key="replay"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="pointer-events-none absolute bottom-14 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white/95 px-3 py-1.5 text-[12.5px] text-ink-2 shadow-card"
                    >
                      Загружаем журнал событий…
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {tracks && <PlayerBar />}
            </div>

            <aside className="card scroll-thin flex h-[min(640px,calc(100vh-230px))] min-h-110 flex-col overflow-y-auto">
              {summary && run.data ? (
                <RunAside
                  run={run.data}
                  summary={summary}
                  timeline={timeline.data}
                  target={target}
                  sweepPoint={
                    run.data.purpose === 'sweep'
                      ? lastSweep?.points.find((p) => p.simulation_id === run.data?.id)
                      : undefined
                  }
                />
              ) : (
                <div className="flex flex-1 items-center justify-center p-6 text-center text-[13.5px] text-ink-3">
                  {failed ?? 'Показатели появятся, когда прогон завершится.'}
                </div>
              )}
              <FleetSweep
                projectId={projectId}
                scenarioId={scenario.id}
                variantIds={variantIds}
                sizing={sizing}
                last={lastSweep}
                shownCount={config.count}
                onOpen={openRun}
              />
            </aside>
          </div>
        </>
      )}
    </Screen>
  )
}

function pointAt(points: SimulationTimeline['points'], t: number) {
  let found = points[0]
  for (const p of points) {
    if (p.t_min * 60 <= t) found = p
    else break
  }
  return found
}

function RunAside({
  run,
  summary,
  timeline,
  target,
  sweepPoint,
}: {
  run: SimulationRun
  summary: SimulationSummary
  timeline?: SimulationTimeline
  target: number
  sweepPoint?: FleetSweepResult['points'][number]
}) {
  const bucket = usePlayback((s) => Math.floor(s.t / 30))
  const points = timeline?.points ?? []
  const now = points.length ? pointAt(points, bucket * 30) : undefined
  const slaTarget = summary.sla.target_pct
  const tone = slaTone(summary.sla.achieved_pct, slaTarget)
  const vs = summary.vs_analytic
  const byState = Object.entries(summary.utilization.by_state ?? {}).filter(([, v]) => (v ?? 0) > 0.001)
  const queue = now?.queue ?? 0

  return (
    <>
      <div className="p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-ink-2">Задачи в срок · SLA</span>
          <span className="meta">цель {formatNumber(slaTarget)} %</span>
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <KpiNumber
            value={summary.sla.achieved_pct}
            digits={summary.sla.achieved_pct >= 99 ? 1 : 0}
            className={`display text-[44px] ${tone === 'ok' ? 'text-ink' : tone === 'warn' ? 'text-warn' : 'text-crit'}`}
          />
          <span className="display text-[22px] text-ink-3">%</span>
        </div>
        <div className="relative mt-2 h-2 w-full rounded-full bg-black/6">
          <motion.div
            className={`h-full rounded-full ${tone === 'ok' ? 'bg-ink' : tone === 'warn' ? 'bg-warn' : 'bg-crit'}`}
            initial={false}
            animate={{ width: `${Math.max(0, Math.min(100, summary.sla.achieved_pct))}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 24 }}
          />
          <span
            className="absolute -top-1 h-4 w-px bg-ink-2"
            style={{ left: `${slaTarget}%` }}
            title={`Цель ${slaTarget} %`}
          />
        </div>
        {summary.sla.target_value != null && (
          <p className="meta mt-2">
            в срок — не дольше {formatNumber(summary.sla.target_value)} {summary.sla.target_unit ?? 'мин'} от появления
            задачи; в среднем {formatNumber(summary.sla.avg_lead_time_min, 1)} мин
          </p>
        )}
        {run.purpose === 'sweep' && (
          <p className="meta mt-1">
            Один из {sweepPoint?.runs ?? 'нескольких'} прогонов перебора флота
            {sweepPoint
              ? `: в среднем ${formatNumber(sweepPoint.sla_achieved_pct, 1)} %, худший ${formatNumber(sweepPoint.sla_min_pct ?? sweepPoint.sla_achieved_pct, 1)} %`
              : ''}
            . Число роботов принято, только если SLA держат все прогоны.
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 divide-x divide-line border-y border-line">
        <Kpi label="Выполнено" value={now?.done ?? 0} unit={`из ${formatNumber(now?.demand_cum ?? 0)}`} />
        <Kpi label="Очередь" value={queue} unit="задач" tone={queue > 15 ? 'crit' : queue > 6 ? 'warn' : 'neutral'} />
        <Kpi label="Загрузка парка" value={(now?.utilization ?? 0) * 100} unit="%" />
      </div>

      <div className="p-5">
        {points.length > 1 && (
          <>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[13px] text-ink-2">Очередь задач за прогон</span>
              <span className="meta">по событиям имитации</span>
            </div>
            <QueueSparkline points={points} cursorMin={(bucket * 30) / 60} />
          </>
        )}
        {byState.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="h3">Чем заняты роботы</span>
              <span className="meta">доля времени за прогон</span>
            </div>
            <ul className="space-y-2">
              {byState.map(([k, v]) => (
                <li key={k}>
                  <div className="mb-1 flex items-center justify-between text-[13px]">
                    <span className="text-ink-2">{STATE_LABEL[k] ?? k}</span>
                    <span className="num text-ink-2">{formatPct(v ?? 0, { share: true, digits: 0 })}</span>
                  </div>
                  <Bar
                    value={(v ?? 0) * 100}
                    tone={k === 'waiting' || k === 'failed' ? 'crit' : k === 'idle' ? 'warn' : 'neutral'}
                    height={5}
                  />
                </li>
              ))}
            </ul>
            {summary.congestion?.top_edges && summary.congestion.top_edges.length > 0 && (
              <p className="meta mt-2">
                Больше всего ждут:{' '}
                {summary.congestion.top_edges
                  .slice(0, 3)
                  .map((e) => `${e.name ?? e.edge_id} (${Math.round(e.wait_s ?? 0)} с)`)
                  .join(', ')}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="border-y border-line bg-surface-2 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="h3">Расчёт против имитации</span>
          <Pill tone={VS_LABEL[vs.verdict]?.tone ?? 'neutral'}>{VS_LABEL[vs.verdict]?.text ?? vs.verdict}</Pill>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <div className="display num text-[22px]">{formatNumber(vs.analytic_throughput_per_hour)}</div>
            <div className="meta">ед/ч — цикл формулы</div>
          </div>
          <div>
            <div className="display num text-[22px]">{formatNumber(vs.sim_throughput_per_hour)}</div>
            <div className="meta">ед/ч — средний цикл имитации ({formatPct(vs.delta_pct, { digits: 0 })})</div>
          </div>
        </div>
        <p className="meta mt-2">
          Мощность того же парка при одинаковом запасе (целевая загрузка), без запаса она выше; нужно в пик{' '}
          {formatNumber(target)} ед/ч.
        </p>
        {vs.text && <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{vs.text}</p>}
        {summary.bottleneck && summary.bottleneck.resource_kind !== 'none' && (
          <div className="mt-3 rounded-[10px] bg-white p-3 text-[13px] leading-relaxed">
            <div className="font-medium text-ink">
              Узкое место: {summary.bottleneck.resource_name ?? summary.bottleneck.resource_kind}
              {summary.bottleneck.utilization != null &&
                ` · загрузка ${formatPct(summary.bottleneck.utilization, { share: true, digits: 0 })}`}
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
    </>
  )
}

const COUNT_HINT: Record<SizingResult['count']['source'], string> = {
  simulated: 'в расчёте, проверено имитацией',
  analytic: 'в расчёте, по формуле цикла',
  manual: 'в расчёте, задано вручную',
}

// Рабочий парк сценария без резерва: по перебору флота, по формуле цикла или заданный вручную.
function workingCount(sizing: SizingResult): number {
  const { count } = sizing
  if (count.source === 'simulated' && count.simulated) return count.simulated
  if (count.source === 'manual') return Math.max(1, Math.min(count.final, count.analytic || count.final))
  return count.analytic
}

/* Прогоны экрана — проверка «что если»: они не меняют сценарий. Меняет его только перебор флота (или выбор
   «по формуле / по имитации»), и это сказано прямо, чтобы новое число на экране не путали с расчётом. */
function WhatIfNote({ sizing, config, working }: { sizing: SizingResult; config: RunConfig; working: number }) {
  const differs = config.count !== working || config.mode !== 'peak' || config.volume || config.failure
  if (!differs) return null
  const changes = [
    config.count !== working ? `${config.count} роботов вместо ${working}` : null,
    config.mode !== 'peak' ? 'обычный день' : null,
    config.volume ? '+20 % объёма' : null,
    config.failure ? 'отказ робота на 2 ч' : null,
  ].filter(Boolean)
  return (
    <Callout tone="info" className="mb-4">
      Проверка «что если» ({changes.join(', ')}): прогон ничего не меняет в сценарии. В расчёте — {working}{' '}
      {pluralRu(working, ['робот', 'робота', 'роботов'])} в работе + резерв {sizing.count.reserve},{' '}
      {COUNT_HINT[sizing.count.source]}.
    </Callout>
  )
}

/* Перебор флота записывает N в сценарий: он прогоняет одни и те же пиковые часы для разного N и берёт минимальное,
   при котором SLA держат все прогоны (D-029). Здесь же — сравнение «по формуле / по имитации» и выбор источника. */
function FleetSweep({
  projectId,
  scenarioId,
  variantIds,
  sizing,
  last,
  shownCount,
  onOpen,
}: {
  projectId: string
  scenarioId: string
  variantIds: string[]
  sizing: SizingResult
  last: FleetSweepResult | undefined
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

  const run = () =>
    sweep.mutate(
      { process_key: sizing.process_key, mode: 'peak', seed: SEED },
      {
        onSuccess: (r) => {
          if (r.recommended_count != null) onOpen(r.recommended_count, r.simulation_id ?? null)
        },
      },
    )

  return (
    <div className="p-5">
      <span className="h3">Сколько роботов нужно на самом деле</span>
      {!result ? (
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          Формула цикла дала {count.analytic} {pluralRu(count.analytic, ['робота', 'роботов', 'роботов'])} с запасами.
          Перебор прогонит одни и те же пиковые часы на планировке для разного N и найдёт минимальное, при котором SLA
          держат все прогоны. Найденное число запишется в сценарий, экономика пересчитается.
        </p>
      ) : (
        <>
          {formula && simulated && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <FleetTile title="По формуле цикла" fleet={formula} active={usingFormula} />
              <FleetTile title="По имитации" fleet={simulated} active={usingSimulation} />
            </div>
          )}
          {formula && simulated && best && (
            <WhyDifferent sizing={sizing} formula={formula} simulated={simulated} best={best} />
          )}
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">{result.explanation}</p>
        </>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant={result ? 'outline' : 'default'} disabled={busy} onClick={run}>
          {sweep.isPending ? <Spinner /> : <Sparkles />}{' '}
          {sweep.isPending
            ? variantIds.length
              ? 'Перебираем флот для всех вариантов…'
              : 'Перебираем флот…'
            : result
              ? 'Перепроверить'
              : 'Подобрать N имитацией'}
        </Button>
        {formula && simulated && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              source.mutate({ processKey: sizing.process_key, manual: usingSimulation ? formula.total : null })
            }
          >
            {source.isPending && <Spinner />}
            {usingSimulation ? `Считать по формуле (${formula.total})` : `Считать по имитации (${simulated.total})`}
          </Button>
        )}
      </div>
      {sweep.isError && <p className="mt-2 text-[12.5px] text-crit">{parseApiProblem(sweep.error).detail}</p>}

      {result && (
        <div className="mt-4">
          <table className="w-full text-[12.5px]">
            <thead className="text-ink-3">
              <tr>
                <th className="py-1 text-left font-normal">N</th>
                <th className="py-1 text-right font-normal" title="Среднее по прогонам пика">
                  SLA
                </th>
                <th className="py-1 text-right font-normal" title="Худший из прогонов: он решает, принят ли парк">
                  худший
                </th>
                <th className="py-1 text-right font-normal">загрузка</th>
                <th className="py-1 text-right font-normal" title="Сценарий с этим N и резервом">
                  окупаемость
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {result.points.map((p) => (
                <tr
                  key={p.count}
                  className={`${p.count === result.recommended_count ? 'font-semibold' : ''} ${p.count === shownCount ? 'bg-info-soft' : ''}`}
                >
                  <td className="py-1">
                    <button
                      type="button"
                      className="num hover:text-info"
                      title={p.simulation_id ? 'Показать этот прогон' : 'Прогнать это число роботов'}
                      onClick={() => onOpen(p.count, p.simulation_id ?? null)}
                    >
                      {p.count}
                    </button>
                  </td>
                  <td className="num py-1 text-right">{formatPct(p.sla_achieved_pct, { digits: 0 })}</td>
                  <td className={`num py-1 text-right ${p.passed ? 'text-ok' : 'text-crit'}`}>
                    {formatPct(p.sla_min_pct ?? p.sla_achieved_pct, { digits: 0 })}
                  </td>
                  <td className="num py-1 text-right">{formatPct(p.utilization, { share: true, digits: 0 })}</td>
                  <td className="num py-1 text-right" title={p.passed ? undefined : 'Парк не держит SLA'}>
                    {p.passed ? formatYears(p.payback_years) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="meta mt-2">
            Цель — {formatNumber(result.target_pct)} % задач в срок в каждом из прогонов. Окупаемость — сценария с этим
            N и резервом. {result.computed_at ? `Перебор от ${formatDate(result.computed_at)}.` : ''}
          </p>
        </div>
      )}
    </div>
  )
}

function FleetTile({ title, fleet, active }: { title: string; fleet: FleetEconomics; active: boolean }) {
  return (
    <div className={`rounded-[10px] border p-3 ${active ? 'border-ink bg-white' : 'border-line bg-surface-2'}`}>
      <div className="flex items-baseline justify-between gap-1 text-[12px]">
        <span className="text-ink-2">{title}</span>
        {active && <span className="font-medium text-ok">в расчёте</span>}
      </div>
      <div className="display num mt-1 text-[22px]">{fleet.total}</div>
      <div className="num text-[11.5px] text-ink-3">
        {fleet.working} в работе + {fleet.reserve} резерв
      </div>
      <div className="num mt-1.5 text-[12px] text-ink-2">окупаемость {formatYears(fleet.payback_years)}</div>
      <div className="num text-[12px] text-ink-2">CAPEX {formatRub(fleet.capex_rub)}</div>
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
  best: FleetSweepResult['points'][number]
}) {
  const { robot } = sizing
  if (formula.working === simulated.working) {
    return (
      <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
        Имитация подтвердила формулу: {simulated.working} роботов держат SLA во всех прогонах пика.
      </p>
    )
  }
  const perRobot = best.throughput_per_hour / Math.max(1, best.count)
  const fewer = simulated.working < formula.working
  return (
    <div className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-ink-2">
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
function RobotCard({
  track,
  summary,
  onClose,
}: {
  track: RobotTrack | undefined
  summary: SimulationSummary
  onClose: () => void
}) {
  const t = usePlayback((s) => Math.floor(s.t / 5) * 5)
  if (!track) return null
  const pose = poseAt(track, t)
  const stats = summary.utilization.per_robot?.find((r) => r.robot_id === track.id)
  const rows: [string, string][] = [
    ['Сейчас', POSE_LABEL[pose.state] ?? pose.state],
    ['Груз', pose.loaded ? 'на борту' : 'пусто'],
    ['Время прогона', clock(t)],
  ]
  if (stats?.tasks != null) rows.push(['Задач за прогон', formatNumber(stats.tasks)])
  if (stats?.utilization != null) rows.push(['Загрузка', formatPct(stats.utilization, { share: true, digits: 0 })])
  if (stats?.distance_km != null) rows.push(['Пробег', `${formatNumber(stats.distance_km, 1)} км`])
  if (stats?.charges != null) rows.push(['Зарядок', formatNumber(stats.charges)])
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18 }}
      className="absolute top-16 right-4 z-10 w-65 rounded-[12px] border border-line bg-white/95 p-4 shadow-card backdrop-blur"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="meta">Робот {track.id}</div>
          <div className="h3">{track.productName}</div>
        </div>
        <button type="button" className="text-ink-4 hover:text-ink" onClick={onClose} aria-label="Закрыть">
          <X size={15} />
        </button>
      </div>
      <div className="mt-3 space-y-1.5 text-[13px]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-ink-2">{label}</span>
            <span className="num font-medium">{value}</span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

function Kpi({ label, value, unit, tone = 'neutral' }: { label: string; value: number; unit: string; tone?: Tone }) {
  const c = tone === 'crit' ? 'text-crit' : tone === 'warn' ? 'text-warn' : 'text-ink'
  return (
    <div className="px-4 py-4">
      <div className="text-[12.5px] text-ink-3">{label}</div>
      <div className="mt-1 flex items-baseline gap-1 whitespace-nowrap">
        <KpiNumber value={value} className={`display text-[24px] ${c}`} />
        <span className="text-[12px] text-ink-3">{unit}</span>
      </div>
    </div>
  )
}

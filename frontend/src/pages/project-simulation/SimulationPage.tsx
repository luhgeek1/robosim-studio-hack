import { AnimatePresence, motion } from 'framer-motion'
import { Camera, Info, Sparkles, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Callout, Screen } from '@/shared/ui/page'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { EmptyState, ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { Toggle } from '@/shared/ui/toggle'
import { KpiNumber, Pill, Segmented, type Tone } from '@/shared/ui/v0'
import { Twin, type TwinCapture, type TwinView } from '@/widgets/twin'
import { PlayerBar, clock, usePlaybackDriver } from './PlayerBar'
import { QueueSparkline } from './QueueSparkline'
import { PaneSection, PaneTitle, StatusBar, type Panels } from './Workbench'

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
// Цвета долей «Чем заняты роботы»: полезная работа — оттенки чернил, простой — предупреждение, затор и отказ — тревога.
const STATE_COLOR: Record<string, string> = {
  moving: 'bg-ink-2',
  loading: 'bg-ink-3',
  unloading: 'bg-ink-4',
  charging: 'bg-info',
  waiting: 'bg-crit',
  idle: 'bg-warn',
  failed: 'bg-crit/60',
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
  const stage = useStageHeight()
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
  const [heatOn, setHeatOn] = useState(false)
  const heat = useSimulationHeatmap(runId, ready && heatOn)
  const [error, setError] = useState<string | null>(null)
  const [selectedRobot, setSelectedRobot] = useState<string | null>(null)
  const capture: TwinCapture = useRef(null)
  const [view, setView] = useState<TwinView>('3d')
  const upload = useUploadVisual(projectId)
  const [panels, setPanels] = useState<Panels>({ left: true, right: true, bottom: true })

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

  const whatIf = sizing ? whatIfText(sizing, config, working) : null

  const lead = !sizing
    ? 'В сценарии нет процесса с моделью цикла — имитировать нечего.'
    : summary
      ? undefined
      : 'Имитация прогонит день на планировке объекта и проверит, успевает ли парк выполнять задачи в срок.'

  return (
    <Screen
      wide
      dense
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
          {error && (
            <Callout tone="crit" className="mb-3">
              Имитация не запустилась: {error}. Сейчас имитация строится для транспортных роботов и «товар к человеку»;
              для остальных типов число роботов остаётся по расчёту времени цикла.
            </Callout>
          )}
          {replay.isError && (
            <Callout tone="crit" className="mb-3">
              Журнал событий не загрузился: {parseApiProblem(replay.error).detail}
            </Callout>
          )}

          {/* Рабочая область как в IDE: слева ход прогона, по центру карта, справа решение для расчёта,
              внизу плеер и условия прогона, под всем — строка состояния. */}
          <div
            ref={stage.ref}
            style={
              {
                '--stage-h': stage.height ? `${stage.height}px` : undefined,
                '--cols': `${panels.left ? `${LEFT_W}px` : '0px'} minmax(0,1fr) ${panels.right ? `${RIGHT_W}px` : '0px'}`,
              } as CSSProperties
            }
            className="card grid grid-cols-1 overflow-hidden transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:h-(--stage-h) lg:grid-cols-(--cols) lg:grid-rows-[minmax(0,1fr)_auto_auto]"
          >
            <aside
              className={cn(
                'order-2 min-h-0 min-w-0 overflow-hidden bg-surface-2 lg:order-none lg:row-span-2',
                panels.left && 'lg:border-r lg:border-line',
              )}
            >
              <div
                className="scroll-thin flex h-full flex-col overflow-y-auto lg:w-(--left-w)"
                style={{ '--left-w': `${LEFT_W}px` } as CSSProperties}
              >
                <PaneTitle>Прогон</PaneTitle>
                {summary && run.data ? (
                  <RunLive
                    run={run.data}
                    summary={summary}
                    timeline={timeline.data}
                    sweepPoint={
                      run.data.purpose === 'sweep'
                        ? lastSweep?.points.find((p) => p.simulation_id === run.data?.id)
                        : undefined
                    }
                  />
                ) : (
                  <div className="flex flex-1 items-center justify-center p-6 text-center text-[13px] text-ink-3">
                    {failed ?? 'Показатели появятся, когда прогон завершится.'}
                  </div>
                )}
              </div>
            </aside>

            <main className="relative order-1 h-[60vh] min-h-0 min-w-0 lg:order-none lg:h-auto">
              {layout ? (
                <Twin
                  layout={layout}
                  capture={capture}
                  view={view}
                  onViewChange={setView}
                  tracks={tracks}
                  heat={heatOn ? heat.data : null}
                  selectedRobot={selectedRobot}
                  onSelectRobot={setSelectedRobot}
                />
              ) : projectLayout.isPending ? (
                <LoadingBlock label="Загружаем планировку…" className="m-4" />
              ) : (
                <EmptyState
                  className="m-4"
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
                    className="pointer-events-none absolute bottom-5 left-1/2 z-10 flex w-[min(520px,90%)] -translate-x-1/2 items-center justify-center gap-2 rounded-[12px] bg-ink px-5 py-3 text-center text-[14px] font-medium text-white shadow-float"
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
                    className="pointer-events-none absolute bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white/95 px-3 py-1.5 text-[12.5px] text-ink-2 shadow-card"
                  >
                    Загружаем журнал событий…
                  </motion.div>
                )}
              </AnimatePresence>
            </main>

            <aside
              className={cn(
                'order-3 min-h-0 min-w-0 overflow-hidden bg-surface-2 lg:order-none lg:col-start-3 lg:row-span-2 lg:row-start-1',
                panels.right && 'lg:border-l lg:border-line',
              )}
            >
              <div
                className="scroll-thin flex h-full flex-col overflow-y-auto lg:w-(--right-w)"
                style={{ '--right-w': `${RIGHT_W}px` } as CSSProperties}
              >
                <PaneTitle>Решение для расчёта</PaneTitle>
                <FleetSweep
                  projectId={projectId}
                  scenarioId={scenario.id}
                  variantIds={variantIds}
                  sizing={sizing}
                  last={lastSweep}
                  shownCount={config.count}
                  onOpen={openRun}
                />
                {summary && <RunCheck summary={summary} target={target} />}
              </div>
            </aside>

            {panels.bottom && (
              <section className="order-4 min-w-0 border-t border-line bg-card lg:order-none lg:col-start-2 lg:row-start-2">
                <div className="flex h-9 items-center gap-4 border-b border-line pr-2 pl-3.5">
                  <span className="hud relative flex h-full shrink-0 items-center text-ink">
                    Условия прогона
                    <span className="absolute inset-x-0 -bottom-px h-0.5 bg-ink" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-info" title={whatIf ?? undefined}>
                    {whatIf}
                  </span>
                  <Toggle
                    size="sm"
                    variant="outline"
                    pressed={heatOn}
                    onPressedChange={setHeatOn}
                    disabled={!ready}
                    className="h-7"
                  >
                    Заторы
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
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-3.5 py-2">
                  <Control label="Роботов">
                    <Segmented
                      size="sm"
                      value={config.count}
                      onChange={(count) => change({ count })}
                      options={counts.map((n) => ({
                        value: n,
                        label: n === working ? `${n} ●` : String(n),
                        hint: n === working ? COUNT_HINT[sizing.count.source] : undefined,
                      }))}
                    />
                  </Control>
                  <Control label="Режим">
                    <Segmented
                      size="sm"
                      value={config.mode}
                      onChange={(mode) => change({ mode })}
                      options={[
                        {
                          value: 'peak',
                          label: 'Пик',
                          hint: `Пиковые часы: ${formatNumber(sizing.demand_peak_per_hour)} ед/ч без передышки, как в переборе флота`,
                        },
                        {
                          value: 'normal',
                          label: 'Сутки',
                          hint: `Обычный день, сутки: ${formatNumber(sizing.demand_avg_per_hour)} ед/ч в среднем, пик в середине смены`,
                        },
                      ]}
                    />
                  </Control>
                  <Control label="Стресс">
                    <div className="flex gap-1.5">
                      <Toggle
                        size="sm"
                        variant="outline"
                        pressed={config.volume}
                        onPressedChange={(volume) => change({ volume })}
                        title="Стресс-тест: объём задач на 20 % больше"
                      >
                        +20 %
                      </Toggle>
                      <Toggle
                        size="sm"
                        variant="outline"
                        pressed={config.failure}
                        onPressedChange={(failure) => change({ failure })}
                        title="Стресс-тест: один робот выходит из строя на 2 часа"
                      >
                        Отказ 2 ч
                      </Toggle>
                    </div>
                  </Control>
                </div>
                <div className="px-3.5 py-2">
                  <PlayerBar disabled={!tracks} />
                </div>
              </section>
            )}

            <StatusBar
              status={
                failed || error
                  ? 'Ошибка прогона'
                  : busy
                    ? `Считаем${run.data && run.data.progress > 0 ? ` ${Math.round(run.data.progress * 100)} %` : '…'}`
                    : ready
                      ? 'Прогон готов'
                      : 'Нет прогона'
              }
              live={Boolean(busy)}
              items={[
                config.mode === 'peak' ? 'Пиковые часы' : 'Обычный день',
                `${formatNumber(target)} ед/ч${config.volume ? ' +20 %' : ''}`,
                `${config.count} роб.${config.failure ? ' · отказ 2 ч' : ''}`,
                whatIf ? 'что если' : 'как в расчёте',
              ]}
              metrics={[
                ...(summary
                  ? [`SLA ${formatNumber(summary.sla.achieved_pct, summary.sla.achieved_pct >= 99 ? 1 : 0)} %`]
                  : []),
                <PlaybackClock key="clock" />,
              ]}
              panels={panels}
              onToggle={(key) => setPanels((p) => ({ ...p, [key]: !p[key] }))}
            />
          </div>
        </>
      )}
    </Screen>
  )
}

const LEFT_W = 272
const RIGHT_W = 316
// Нижний отступ сцены от края окна и минимальная высота, ниже которой колонки уже не читаются.
const STAGE_GAP_PX = 16
const STAGE_MIN_PX = 560
const HEADER_PX = 72

/* Сцена тянется до низа окна: карта и обе колонки помещаются в экран без прокрутки страницы. */
function useStageHeight() {
  // Callback-ref: сетка сцены монтируется только после загрузки расчёта.
  const [el, ref] = useState<HTMLDivElement | null>(null)
  const [height, setHeight] = useState<number>()
  useLayoutEffect(() => {
    if (!el) return
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY
      // На низком экране (1366×768) область не меньше STAGE_MIN_PX, но и не выше окна под шапкой: после короткой
      // прокрутки она видна целиком, вместе со строкой состояния.
      const floor = Math.min(STAGE_MIN_PX, window.innerHeight - HEADER_PX - STAGE_GAP_PX)
      setHeight(Math.max(floor, Math.round(window.innerHeight - top - STAGE_GAP_PX)))
    }
    fit()
    // Над сценой появляются и исчезают подсказки и ошибки — они сдвигают её верх.
    const observer = new ResizeObserver(fit)
    if (el.parentElement) observer.observe(el.parentElement)
    window.addEventListener('resize', fit)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', fit)
    }
  }, [el])
  return { ref, height }
}

function pointAt(points: SimulationTimeline['points'], t: number) {
  let found = points[0]
  for (const p of points) {
    if (p.t_min * 60 <= t) found = p
    else break
  }
  return found
}

function RunLive({
  run,
  summary,
  timeline,
  sweepPoint,
}: {
  run: SimulationRun
  summary: SimulationSummary
  timeline?: SimulationTimeline
  sweepPoint?: FleetSweepResult['points'][number]
}) {
  const bucket = usePlayback((s) => Math.floor(s.t / 30))
  const points = timeline?.points ?? []
  const now = points.length ? pointAt(points, bucket * 30) : undefined
  const slaTarget = summary.sla.target_pct
  const tone = slaTone(summary.sla.achieved_pct, slaTarget)
  const byState = Object.entries(summary.utilization.by_state ?? {}).filter(([, v]) => (v ?? 0) > 0.001)
  const queue = now?.queue ?? 0
  const topEdges = summary.congestion?.top_edges?.slice(0, 3) ?? []

  return (
    <>
      <PaneSection
        title="Задачи в срок · SLA"
        aside={
          run.purpose === 'sweep' ? (
            <Hint>
              Один из {sweepPoint?.runs ?? 'нескольких'} прогонов перебора флота
              {sweepPoint
                ? `: в среднем ${formatNumber(sweepPoint.sla_achieved_pct, 1)} %, худший ${formatNumber(sweepPoint.sla_min_pct ?? sweepPoint.sla_achieved_pct, 1)} %`
                : ''}
              . Число роботов принято, только если SLA держат все прогоны.
            </Hint>
          ) : undefined
        }
      >
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-1">
            <KpiNumber
              value={summary.sla.achieved_pct}
              digits={summary.sla.achieved_pct >= 99 ? 1 : 0}
              className={`display text-[38px] ${tone === 'ok' ? 'text-ink' : tone === 'warn' ? 'text-warn' : 'text-crit'}`}
            />
            <span className="display text-[18px] text-ink-3">%</span>
          </div>
          <span className="meta">цель {formatNumber(slaTarget)} %</span>
        </div>
        <div className="relative mt-1.5 h-1.5 w-full rounded-full bg-black/6">
          <motion.div
            className={`h-full rounded-full ${tone === 'ok' ? 'bg-ink' : tone === 'warn' ? 'bg-warn' : 'bg-crit'}`}
            initial={false}
            animate={{ width: `${Math.max(0, Math.min(100, summary.sla.achieved_pct))}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 24 }}
          />
          <span
            className="absolute -top-1 h-3.5 w-px bg-signal"
            style={{ left: `${slaTarget}%` }}
            title={`Цель ${slaTarget} %`}
          />
        </div>
        {summary.sla.target_value != null && (
          <p className="meta mt-2">
            в срок — до {formatNumber(summary.sla.target_value)} {summary.sla.target_unit ?? 'мин'} · в среднем{' '}
            {formatNumber(summary.sla.avg_lead_time_min, 1)} мин
          </p>
        )}
      </PaneSection>

      <PaneSection title="В момент плеера">
        <div className="-mx-3.5 grid grid-cols-3 divide-x divide-line border-y border-line bg-card">
          <Kpi label="Готово" value={now?.done ?? 0} unit={`/ ${formatNumber(now?.demand_cum ?? 0)}`} />
          <Kpi label="Очередь" value={queue} unit="зад." tone={queue > 15 ? 'crit' : queue > 6 ? 'warn' : 'neutral'} />
          <Kpi label="Загрузка" value={(now?.utilization ?? 0) * 100} unit="%" />
        </div>
      </PaneSection>

      {points.length > 1 && (
        <PaneSection title="Очередь за прогон">
          <QueueSparkline points={points} cursorMin={(bucket * 30) / 60} height={48} />
        </PaneSection>
      )}

      {byState.length > 0 && (
        <PaneSection title="Чем заняты роботы" aside={<span className="meta">доля времени</span>}>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-black/6">
            {byState.map(([k, v]) => (
              <motion.div
                key={k}
                className={STATE_COLOR[k] ?? 'bg-ink-4'}
                initial={false}
                animate={{ width: `${(v ?? 0) * 100}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 24 }}
              />
            ))}
          </div>
          <ul className="mt-2.5 space-y-1 text-[12.5px]">
            {byState.map(([k, v]) => (
              <li key={k} className="flex items-center gap-2">
                <span className={cn('size-2 shrink-0 rounded-full', STATE_COLOR[k] ?? 'bg-ink-4')} />
                <span className="min-w-0 truncate text-ink-2">{STATE_LABEL[k] ?? k}</span>
                <span className="num ml-auto shrink-0 text-ink">{formatPct(v ?? 0, { share: true, digits: 0 })}</span>
              </li>
            ))}
          </ul>
        </PaneSection>
      )}

      {topEdges.length > 0 && (
        <PaneSection title="Где ждут дольше всего">
          <ul className="space-y-1 text-[12.5px]">
            {topEdges.map((e) => (
              <li key={e.edge_id} className="flex items-center gap-2">
                <span className="size-1.5 shrink-0 rounded-full bg-crit" />
                <span className="min-w-0 truncate text-ink-2">{e.name ?? e.edge_id}</span>
                <span className="num ml-auto shrink-0">{Math.round(e.wait_s ?? 0)} с</span>
              </li>
            ))}
          </ul>
        </PaneSection>
      )}
    </>
  )
}

function RunCheck({ summary, target }: { summary: SimulationSummary; target: number }) {
  const vs = summary.vs_analytic
  const bottleneck = summary.bottleneck && summary.bottleneck.resource_kind !== 'none' ? summary.bottleneck : null
  return (
    <PaneSection
      title="Расчёт против имитации"
      aside={
        <Hint>
          <p>
            Мощность того же парка при одинаковом запасе (целевая загрузка), без запаса она выше; нужно в пик{' '}
            {formatNumber(target)} ед/ч.
          </p>
          {vs.text && <p>{vs.text}</p>}
          {summary.completed_by_humans ? (
            <p>Задач ушло людям после превышения норматива ожидания: {summary.completed_by_humans}</p>
          ) : null}
        </Hint>
      }
    >
      <Pill tone={VS_LABEL[vs.verdict]?.tone ?? 'neutral'}>{VS_LABEL[vs.verdict]?.text ?? vs.verdict}</Pill>
      <div className="mt-2.5 grid grid-cols-2 gap-3">
        <div>
          <div className="display num text-[22px]">{formatNumber(vs.analytic_throughput_per_hour)}</div>
          <div className="meta">ед/ч по формуле</div>
        </div>
        <div>
          <div className="display num text-[22px]">{formatNumber(vs.sim_throughput_per_hour)}</div>
          <div className="meta whitespace-nowrap">ед/ч в имитации · {formatPct(vs.delta_pct, { digits: 0 })}</div>
        </div>
      </div>
      {bottleneck && (
        <div className="mt-3 rounded-[10px] border border-line bg-card px-3 py-2 text-[12.5px]">
          <div className="flex items-center gap-1">
            <span className="hud">Узкое место</span>
            <Hint>
              <p>{bottleneck.explanation}</p>
              {bottleneck.suggestion && <p>Что сделать: {bottleneck.suggestion}</p>}
            </Hint>
          </div>
          <div className="mt-0.5 font-medium text-ink">
            {bottleneck.resource_name ?? bottleneck.resource_kind}
            {bottleneck.utilization != null && ` · ${formatPct(bottleneck.utilization, { share: true, digits: 0 })}`}
          </div>
        </div>
      )}
    </PaneSection>
  )
}

/* Пояснение по клику: в колонках имитации текст не должен съедать высоту, но остаётся под рукой. */
function Hint({ children }: { children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        className="inline-flex shrink-0 text-ink-4 transition-colors hover:text-ink"
        aria-label="Пояснение"
      >
        <Info size={14} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2 text-[13px] leading-relaxed text-ink-2">
        {children}
      </PopoverContent>
    </Popover>
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
function whatIfText(sizing: SizingResult, config: RunConfig, working: number): string | null {
  const changes = [
    config.count !== working ? `${config.count} роботов вместо ${working}` : null,
    config.mode !== 'peak' ? 'обычный день' : null,
    config.volume ? '+20 % объёма' : null,
    config.failure ? 'отказ робота на 2 ч' : null,
  ].filter(Boolean)
  if (!changes.length) return null
  return `Проверка «что если» (${changes.join(', ')}) — сценарий не меняется: в расчёте ${working} ${pluralRu(working, ['робот', 'робота', 'роботов'])} в работе + резерв ${sizing.count.reserve}, ${COUNT_HINT[sizing.count.source]}`
}

function Control({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="hud">{label}</span>
      {children}
    </div>
  )
}

function PlaybackClock() {
  const t = usePlayback((s) => Math.floor(s.t / 10) * 10)
  const total = usePlayback((s) => s.total)
  return (
    <span>
      {clock(t)} / {clock(total)}
    </span>
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
    <>
      <PaneSection
        title="Сколько роботов нужно"
        aside={
          result ? (
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
          ) : undefined
        }
      >
        {!result ? (
          <p className="text-[13px] leading-relaxed text-ink-2">
            Формула цикла дала {count.analytic} {pluralRu(count.analytic, ['робота', 'роботов', 'роботов'])} с запасами.
            Перебор прогонит одни и те же пиковые часы на планировке для разного N и найдёт минимальное, при котором SLA
            держат все прогоны. Найденное число запишется в сценарий, экономика пересчитается.
          </p>
        ) : (
          formula &&
          simulated && (
            <div className="grid grid-cols-2 gap-2">
              <FleetTile title="По формуле цикла" fleet={formula} active={usingFormula} />
              <FleetTile title="По имитации" fleet={simulated} active={usingSimulation} />
            </div>
          )
        )}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
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
              {usingSimulation ? `По формуле (${formula.total})` : `По имитации (${simulated.total})`}
            </Button>
          )}
        </div>
        {sweep.isError && <p className="mt-2 text-[12.5px] text-crit">{parseApiProblem(sweep.error).detail}</p>}
      </PaneSection>

      {result && (
        <PaneSection title="Перебор флота" aside={<span className="meta">клик — открыть прогон</span>}>
          <table className="w-full text-[12.5px]">
            <thead className="text-ink-3">
              <tr>
                <th className="pb-1 text-left font-normal">N</th>
                <th className="pb-1 text-right font-normal" title="Среднее по прогонам пика">
                  SLA
                </th>
                <th className="pb-1 text-right font-normal" title="Худший из прогонов: он решает, принят ли парк">
                  худший
                </th>
                <th className="pb-1 text-right font-normal">загр.</th>
                <th className="pb-1 text-right font-normal" title="Сценарий с этим N и резервом">
                  окуп.
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {result.points.map((p) => (
                <tr
                  key={p.count}
                  onClick={() => onOpen(p.count, p.simulation_id ?? null)}
                  title={p.simulation_id ? 'Показать этот прогон' : 'Прогнать это число роботов'}
                  className={cn(
                    'cursor-pointer transition-colors hover:bg-black/3',
                    p.count === result.recommended_count && 'font-semibold',
                    p.count === shownCount && 'bg-signal-soft/70',
                  )}
                >
                  <td className="num py-1">{p.count}</td>
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
        </PaneSection>
      )}
    </>
  )
}

function FleetTile({ title, fleet, active }: { title: string; fleet: FleetEconomics; active: boolean }) {
  return (
    <div className={`rounded-[10px] border px-2.5 py-2 ${active ? 'border-ink bg-white' : 'border-line bg-surface-2'}`}>
      <div className="truncate text-[12px] text-ink-2">{title}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="display num text-[20px]">{fleet.total}</span>
        <span className="num text-[11.5px] text-ink-3" title={`${fleet.working} в работе + ${fleet.reserve} в резерве`}>
          {fleet.working} + {fleet.reserve} рез.
        </span>
      </div>
      <div className="num truncate text-[11.5px] text-ink-2">
        {formatYears(fleet.payback_years)} · {formatRub(fleet.capex_rub)}
      </div>
      {active && <div className="text-[11.5px] font-medium text-ok">в расчёте</div>}
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
          ? ' — в пиковые часы они не простаивают на зарядке, берут ближайшую задачу, а норматив срока позволяет короткой очереди рассосаться.'
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
    <div className="min-w-0 px-3 py-2.5">
      <div className="truncate text-[12px] text-ink-3">{label}</div>
      <div className="flex items-baseline gap-1 whitespace-nowrap">
        <KpiNumber value={value} className={`display text-[20px] ${c}`} />
        <span className="text-[11.5px] text-ink-3">{unit}</span>
      </div>
    </div>
  )
}

import { AnimatePresence, motion } from 'framer-motion'
import { Camera, Info, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import { Callout, Screen, Section } from '@/shared/ui/page'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { EmptyState, ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { KpiNumber, Pill, type Tone } from '@/shared/ui/v0'
import { Twin, type TwinCapture, type TwinView } from '@/widgets/twin'
import { PlayerBar, clock, usePlaybackDriver } from './PlayerBar'
import { Conditions } from './Conditions'
import { COUNT_HINT, type RunConfig } from './runConfig'
import { QueueSparkline } from './QueueSparkline'

const SEED = SWEEP_SEED
// Стресс-тесты шага «Имитация» из docs/PRODUCT.md: +20 % объёма и отказ одного робота на 2 часа в начале смены.
const STRESS = {
  volumeMultiplier: 1.2,
  failure: { robot_index: 0, at_hour: 1, duration_hours: 2 },
} as const

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
            <SelectTrigger className="w-full max-w-full min-w-0 bg-card" aria-label="Вариант сценария">
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

  // Имитируются процессы с моделью цикла (паллеты, G2P, тягачи); остальные N остаются по расчёту. Если таких
  // процессов несколько, песочница меняет парк одного из них, остальные едут в том же прогоне как в расчёте.
  const checkable = useMemo(
    () => calculation.data?.sizing.filter((s) => s.robot.cycle_time_s != null) ?? [],
    [calculation.data],
  )
  const [processKey, setProcessKey] = useState<string>()
  const sizing: SizingResult | undefined =
    checkable.find((s) => s.process_key === processKey) ??
    checkable.find((s) => s.count.simulation_id) ??
    checkable[0] ??
    calculation.data?.sizing[0]
  // Имитация проверяет рабочий парк, который сейчас в расчёте (без резерва на отказы): по перебору флота, по формуле
  // или заданный вручную.
  const working = sizing ? workingCount(sizing) : 0
  const lastSweep = useLastSweep(scenario.id, sizing?.process_key).data ?? undefined
  const [draft, setDraft] = useState<Omit<RunConfig, 'count'> & { count: number | null }>(FRESH)
  const config: RunConfig = { ...draft, count: draft.count ?? Math.max(1, working) }
  const key = configKey(config)
  const counts = useMemo(() => {
    const base = Math.max(1, working)
    return [base - 2, base - 1, base, base + 1, base + 2].filter((n) => n >= 1)
  }, [working])

  const [runIds, setRunIds] = useState<Record<string, string>>({})
  // Прогон с теми же условиями уже есть — берём его; прогон, записавший N в сценарий, — первым.
  const findRun = (c: RunConfig) => {
    if (!sizing) return undefined
    const k = configKey(c)
    if (runIds[k]) return runIds[k]
    const matching = (runs.data ?? []).filter((r) => {
      const rc = configOf(r, sizing.process_key)
      return usable(r) && rc !== null && configKey(rc) === k
    })
    return (matching.find((r) => r.id === sizing.count.simulation_id) ?? matching[0])?.id
  }
  const runId = findRun(config) ?? null
  const run = useSimulationRun(runId)
  const summary = run.data?.status === 'done' ? (run.data.summary ?? null) : null
  const ready = Boolean(summary)
  const replay = useSimulationReplay(runId, ready)
  const timeline = useSimulationTimeline(runId, ready)
  const heat = useSimulationHeatmap(runId, ready)
  const [error, setError] = useState<string | null>(null)
  const [selectedRobot, setSelectedRobot] = useState<string | null>(null)
  const capture: TwinCapture = useRef(null)
  const [view, setView] = useState<TwinView>('3d')
  const upload = useUploadVisual(projectId)

  const request = (c: RunConfig) => ({
    mode: c.mode,
    // Пик — окно `sim_peak_duration_hours` бэкенда, то же, что у перебора флота; обычный день — сутки.
    ...(c.mode === 'normal' ? { duration_hours: 24 } : {}),
    seed: SEED,
    volume_multiplier: c.volume ? STRESS.volumeMultiplier : 1,
    fleet_override: [{ process_key: sizing!.process_key, count: c.count }],
    failures: c.failure ? [STRESS.failure] : [],
    record_events: true,
    compare_baseline: false,
  })

  useEffect(() => {
    if (!sizing || runId || runs.isPending || start.isPending || error) return
    start.mutate(request(config), {
      onSuccess: (created) => setRunIds((prev) => ({ ...prev, [key]: created.id })),
      onError: (e) => setError(parseApiProblem(e).detail),
    })
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
  const open = (next: RunConfig, simulationId?: string | null) => {
    if (simulationId) setRunIds((prev) => ({ ...prev, [configKey(next)]: simulationId }))
    change(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const pickProcess = (next: string) => {
    setProcessKey(next)
    setRunIds({})
    setError(null)
    setSelectedRobot(null)
    setDraft(FRESH)
  }

  // Стресс-тесты «все сразу»: отдельный запуск, чтобы не мешать прогону на карте.
  const checks = useStartSimulation(scenario.id)
  const runChecks = async () => {
    for (const check of CHECKS) {
      const c: RunConfig = { count: fleet, mode: 'peak', ...check.config }
      if (findRun(c)) continue
      try {
        const created = await checks.mutateAsync(request(c))
        setRunIds((prev) => ({ ...prev, [configKey(c)]: created.id }))
      } catch (e) {
        toast.error(problemText(e))
        return
      }
    }
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
  // Стресс-тесты гоняют весь купленный парк: резерв на отказы для того и заложен.
  const fleet = working + (sizing?.count.reserve ?? 0)
  const sweepPoint =
    run.data?.purpose === 'sweep' ? lastSweep?.points.find((p) => p.simulation_id === run.data?.id) : undefined
  const sla = summary && sizing ? processSla(summary, sizing.process_key) : null
  const holds = summary && sla != null ? sla >= summary.sla.target_pct : null
  const robots = `${config.count} ${pluralRu(config.count, ['робот', 'робота', 'роботов'])}`
  const title =
    !sizing || !summary
      ? `${robots} ${sizing?.product_name ?? ''}: прогоняем ${config.mode === 'peak' ? 'пиковые часы' : 'сутки'}`
      : `${robots} ${holds ? (config.count === 1 ? 'держит' : 'держат') : config.count === 1 ? 'не держит' : 'не держат'} ${config.mode === 'peak' ? 'пик' : 'день'}${config.volume || config.failure ? ' со стрессом' : ''}: ${formatNumber(sla ?? 0, (sla ?? 0) >= 99 ? 1 : 0)} % задач в срок`

  return (
    <Screen
      wide
      dense
      title={title}
      lead={
        !sizing
          ? 'В сценарии нет процесса с моделью цикла — имитировать нечего.'
          : 'Песочница: смена на планировке — каждый робот, заторы и зарядка. Меняйте условия, парк проверяется сразу.'
      }
      actions={
        <>
          {picker && <div className="w-64 max-sm:w-full">{picker}</div>}
          <Button
            variant="outline"
            disabled={!tracks || upload.isPending}
            onClick={() => void snapshot()}
            title="Схема или 3D-вид в текущий момент прогона попадёт в PDF-отчёт"
          >
            {upload.isPending ? <Spinner /> : <Camera />} Снимок в отчёт
          </Button>
        </>
      }
    >
      {calculation.isPending && <LoadingBlock label="Загружаем расчёт…" />}
      {calculation.isError && <ErrorBlock error={calculation.error} onRetry={() => calculation.refetch()} />}
      {sizing && (
        <div className="space-y-4">
          <Conditions
            config={config}
            counts={counts}
            working={working}
            sizing={sizing}
            whatIf={whatIf}
            processes={checkable.map((s) => ({
              key: s.process_key,
              label: s.product_name?.split(' (')[0] ?? s.process_key,
            }))}
            onProcess={pickProcess}
            onChange={change}
          />

          <section className="card overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="relative h-[min(600px,calc(100svh-320px))] min-h-105">
                {(error || replay.isError) && (
                  <div className="absolute inset-x-3 top-16 z-20 space-y-2">
                    {error && (
                      <Callout tone="crit">
                        Имитация не запустилась: {error}. Сейчас имитация строится для транспортных роботов и «товар к
                        человеку»; для остальных типов число роботов остаётся по расчёту времени цикла.
                      </Callout>
                    )}
                    {replay.isError && (
                      <Callout tone="crit">
                        Журнал событий не загрузился: {parseApiProblem(replay.error).detail}
                      </Callout>
                    )}
                  </div>
                )}
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
                      <Spinner /> Считаем смену имитацией{run.data?.stage ? `: ${run.data.stage}` : '…'}
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
              </div>

              <RunAside
                processKey={sizing.process_key}
                run={run.data}
                summary={summary}
                timeline={timeline.data}
                sweepPoint={sweepPoint}
                target={target}
                failed={failed}
              />
            </div>
            <div className="border-t border-line px-4 py-2.5 sm:px-5">
              <PlayerBar
                disabled={!tracks}
                track={
                  timeline.data && timeline.data.points.length > 1 ? (
                    <QueueSparkline points={timeline.data.points} height={28} bare />
                  ) : undefined
                }
              />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <FleetDecision
              projectId={projectId}
              scenarioId={scenario.id}
              variantIds={variantIds}
              sizing={sizing}
              last={lastSweep}
              shownCount={config.mode === 'peak' && !config.volume && !config.failure ? config.count : null}
              onOpen={(count, id) => open({ count, mode: 'peak', volume: false, failure: false }, id)}
            />
            <div className="space-y-4">
              <StressChecks
                processKey={sizing.process_key}
                fleet={fleet}
                reserve={sizing.count.reserve ?? 0}
                target={summary?.sla.target_pct ?? null}
                find={findRun}
                current={key}
                pending={checks.isPending}
                onRun={() => void runChecks()}
                onOpen={(c, id) => open(c, id)}
              />
              {summary && <BusyShare summary={summary} />}
            </div>
          </div>
        </div>
      )}
    </Screen>
  )
}

const FRESH = { count: null, mode: 'peak', volume: false, failure: false } as const satisfies Omit<
  RunConfig,
  'count'
> & {
  count: number | null
}

// Проверки устойчивости парка из расчёта: объём выше плана, отказ робота и оба сразу — в пиковые часы.
const CHECKS: { key: string; title: string; config: Pick<RunConfig, 'volume' | 'failure'> }[] = [
  { key: 'volume', title: 'Объём на 20 % выше', config: { volume: true, failure: false } },
  { key: 'failure', title: 'Робот встал на 2 часа', config: { volume: false, failure: true } },
  { key: 'both', title: 'Оба сразу', config: { volume: true, failure: true } },
]

// Доля в срок того процесса, чей парк на экране: в прогоне сценария рядом едут и другие типы роботов со своим SLA.
function processSla(summary: SimulationSummary, processKey: string): number {
  const own = summary.per_process?.find((p) => p.process_key === processKey)
  return (summary.per_process?.length ?? 0) > 1 && own?.sla_achieved_pct != null
    ? own.sla_achieved_pct
    : summary.sla.achieved_pct
}

function pointAt(points: SimulationTimeline['points'], t: number) {
  let found = points[0]
  for (const p of points) {
    if (p.t_min * 60 <= t) found = p
    else break
  }
  return found
}

/* Колонка у карты — три ответа без прокрутки: держит ли парк SLA, что происходит в момент плеера, где узкое место. */
function RunAside({
  processKey,
  run,
  summary,
  timeline,
  sweepPoint,
  target,
  failed,
}: {
  processKey: string
  run: SimulationRun | undefined
  summary: SimulationSummary | null
  timeline?: SimulationTimeline
  sweepPoint?: FleetSweepResult['points'][number]
  target: number
  failed: string | null
}) {
  const bucket = usePlayback((s) => Math.floor(s.t / 30))
  if (!summary || !run) {
    return (
      <aside className="flex items-center justify-center border-t border-line px-5 py-10 text-center text-[13px] text-ink-3 lg:border-t-0 lg:border-l">
        {failed ?? 'Показатели появятся, когда прогон завершится.'}
      </aside>
    )
  }
  const points = timeline?.points ?? []
  const now = points.length ? pointAt(points, bucket * 30) : undefined
  const slaTarget = summary.sla.target_pct
  const sla = processSla(summary, processKey)
  const tone = slaTone(sla, slaTarget)
  const queue = now?.queue ?? 0
  const vs = summary.vs_analytic
  const bottleneck = summary.bottleneck && summary.bottleneck.resource_kind !== 'none' ? summary.bottleneck : null
  const worst = summary.congestion?.top_edges?.[0]

  return (
    <aside className="flex min-w-0 flex-col divide-y divide-line border-t border-line lg:border-t-0 lg:border-l">
      <div className="px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <span className="hud">Задачи в срок</span>
          {run.purpose === 'sweep' && (
            <Hint>
              Один из {sweepPoint?.runs ?? 'нескольких'} прогонов перебора флота
              {sweepPoint
                ? `: в среднем ${formatNumber(sweepPoint.sla_achieved_pct, 1)} %, худший ${formatNumber(sweepPoint.sla_min_pct ?? sweepPoint.sla_achieved_pct, 1)} %`
                : ''}
              . Число роботов принято, только если SLA держат все прогоны.
            </Hint>
          )}
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-1">
            <KpiNumber
              value={sla}
              digits={sla >= 99 ? 1 : 0}
              className={`display text-[40px] ${tone === 'ok' ? 'text-ink' : tone === 'warn' ? 'text-warn' : 'text-crit'}`}
            />
            <span className="display text-[18px] text-ink-3">%</span>
          </div>
          <span className="meta">цель {formatNumber(slaTarget)} %</span>
        </div>
        <div className="relative mt-1.5 h-1.5 w-full rounded-full bg-black/6">
          <motion.div
            className={`h-full rounded-full ${tone === 'ok' ? 'bg-ink' : tone === 'warn' ? 'bg-warn' : 'bg-crit'}`}
            initial={false}
            animate={{ width: `${Math.max(0, Math.min(100, sla))}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 24 }}
          />
          <span className="absolute -top-1 h-3.5 w-px bg-signal" style={{ left: `${slaTarget}%` }} />
        </div>
        {summary.sla.target_value != null && (
          <p className="meta mt-2">
            срок {formatNumber(summary.sla.target_value)} {summary.sla.target_unit ?? 'мин'} · в среднем{' '}
            {formatNumber(summary.sla.avg_lead_time_min, 1)} мин
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 divide-x divide-line">
        <Kpi label="Готово" value={now?.done ?? 0} unit={`/ ${formatNumber(now?.demand_cum ?? 0)}`} />
        <Kpi label="Очередь" value={queue} unit="зад." tone={queue > 15 ? 'crit' : queue > 6 ? 'warn' : 'neutral'} />
        <Kpi label="Загрузка" value={(now?.utilization ?? 0) * 100} unit="%" />
      </div>

      <div className="px-5 py-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="hud">Узкое место</span>
          {(bottleneck || worst) && (
            <Hint>
              {bottleneck && <p>{bottleneck.explanation}</p>}
              {bottleneck?.suggestion && <p>Что сделать: {bottleneck.suggestion}</p>}
              {worst && (
                <p>
                  Дольше всего ждут: {worst.name ?? worst.edge_id} — {Math.round(worst.wait_s ?? 0)} с за прогон. Слой
                  «Заторы» на карте показывает все участки.
                </p>
              )}
            </Hint>
          )}
        </div>
        <div className="mt-1 text-[14px] font-medium text-ink">
          {bottleneck
            ? `${bottleneck.resource_name ?? bottleneck.resource_kind}${bottleneck.utilization != null ? ` · ${formatPct(bottleneck.utilization, { share: true, digits: 0 })}` : ''}`
            : 'Нет: парк не упирается ни в проходы, ни в ворота'}
        </div>
        {worst && (worst.wait_s ?? 0) > 0 && (
          <div className="meta mt-0.5 truncate">
            ждут дольше всего: {worst.name ?? worst.edge_id}, {Math.round(worst.wait_s ?? 0)} с
          </div>
        )}
      </div>

      <div className="px-5 py-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="hud">Расчёт против имитации</span>
          <Hint>
            <p>
              Мощность того же парка при одинаковом запасе (целевая загрузка), без запаса она выше; нужно{' '}
              {formatNumber(target)} ед/ч.
            </p>
            {vs.text && <p>{vs.text}</p>}
            {summary.completed_by_humans ? (
              <p>Задач ушло людям после превышения норматива ожидания: {summary.completed_by_humans}</p>
            ) : null}
          </Hint>
        </div>
        <div className="num mt-1 text-[14px] text-ink">
          {formatNumber(vs.analytic_throughput_per_hour)} → {formatNumber(vs.sim_throughput_per_hour)} ед/ч
        </div>
        <div className="mt-1.5">
          <Pill tone={VS_LABEL[vs.verdict]?.tone ?? 'neutral'}>{VS_LABEL[vs.verdict]?.text ?? vs.verdict}</Pill>
        </div>
      </div>
    </aside>
  )
}

/* Чем заняты роботы — одна полоса долей времени. */
function BusyShare({ summary }: { summary: SimulationSummary }) {
  const byState = Object.entries(summary.utilization.by_state ?? {}).filter(([, v]) => (v ?? 0) > 0.001)
  if (!byState.length) return null
  return (
    <Section title="Чем заняты роботы" description="доля времени за прогон">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-black/6">
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
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px]">
        {byState.map(([k, v]) => (
          <li key={k} className="flex items-center gap-2">
            <span className={cn('size-2 shrink-0 rounded-full', STATE_COLOR[k] ?? 'bg-ink-4')} />
            <span className="min-w-0 truncate text-ink-2">{STATE_LABEL[k] ?? k}</span>
            <span className="num ml-auto shrink-0 text-ink">{formatPct(v ?? 0, { share: true, digits: 0 })}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/* Стресс-тесты как вердикт: парк из расчёта прогоняется в пике с повышенным объёмом, с отказом робота и с обоими
   сразу. Карточка — ответ «держит / не держит»; клик открывает этот прогон на карте. */
function StressChecks({
  processKey,
  fleet,
  reserve,
  target,
  find,
  current,
  pending,
  onRun,
  onOpen,
}: {
  processKey: string
  fleet: number
  reserve: number
  target: number | null
  find: (c: RunConfig) => string | undefined
  current: string
  pending: boolean
  onRun: () => void
  onOpen: (c: RunConfig, id: string) => void
}) {
  const items = CHECKS.map((check) => {
    const config: RunConfig = { count: fleet, mode: 'peak', ...check.config }
    return { ...check, config, id: find(config) }
  })
  const missing = items.some((i) => !i.id)
  return (
    <Section
      title="Стресс-тесты"
      description={`весь парк сценария: ${fleet} ${pluralRu(fleet, ['робот', 'робота', 'роботов'])}${reserve ? ` с резервом ${reserve}` : ''}, пиковые часы`}
      actions={
        missing ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={onRun}>
            {pending ? <Spinner /> : <Sparkles />} Прогнать проверки
          </Button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        {items.map((item) => (
          <StressCard
            key={item.key}
            processKey={processKey}
            title={item.title}
            id={item.id}
            target={target}
            active={configKey(item.config) === current}
            onOpen={() => item.id && onOpen(item.config, item.id)}
          />
        ))}
      </div>
    </Section>
  )
}

function StressCard({
  processKey,
  title,
  id,
  target,
  active,
  onOpen,
}: {
  processKey: string
  title: string
  id: string | undefined
  target: number | null
  active: boolean
  onOpen: () => void
}) {
  const run = useSimulationRun(id)
  const summary = run.data?.status === 'done' ? run.data.summary : null
  const goal = summary?.sla.target_pct ?? target
  const sla = summary ? processSla(summary, processKey) : undefined
  const holds = sla != null && goal != null ? sla >= goal : null
  const running = Boolean(id) && !summary && run.data?.status !== 'failed'
  return (
    <button
      type="button"
      disabled={!summary}
      onClick={onOpen}
      className={cn(
        'flex min-w-0 flex-col items-start rounded-[10px] border px-3 py-2.5 text-left transition-colors',
        active ? 'border-ink bg-white' : 'border-line bg-surface-2 enabled:hover:border-line-2 enabled:hover:bg-white',
      )}
    >
      <span className="truncate text-[12.5px] text-ink-2">{title}</span>
      {summary && sla != null ? (
        <>
          <span className={cn('text-[15px] font-semibold', holds ? 'text-ok' : 'text-crit')}>
            {holds ? 'держит' : 'не держит'}
          </span>
          <span className="num text-[12px] text-ink-3">SLA {formatNumber(sla, sla >= 99 ? 1 : 0)} %</span>
        </>
      ) : running ? (
        <span className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-3">
          <Spinner /> считаем…
        </span>
      ) : (
        <span className="mt-0.5 text-[13px] text-ink-4">{run.data?.status === 'failed' ? 'ошибка' : 'не прогнан'}</span>
      )}
    </button>
  )
}

/* «Почему N»: перебор флота прогоняет одни и те же пиковые часы для разного N и берёт минимальное, при котором SLA
   держат все прогоны (D-029). Здесь же сравнение «по формуле / по имитации» и выбор, какое число идёт в расчёт. */
function FleetDecision({
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
  shownCount: number | null
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
    <Section
      title={result?.recommended_count != null ? `Почему ${result.recommended_count}` : 'Сколько роботов нужно'}
      description={
        result
          ? `минимальное N, при котором все ${best?.runs ?? 5} прогонов пика держат ${formatNumber(result.target_pct)} % в срок`
          : 'перебор флота имитацией'
      }
      actions={
        <>
          {result && (
            <Hint>
              {formula && simulated && best && (
                <WhyDifferent sizing={sizing} formula={formula} simulated={simulated} best={best} />
              )}
              <p className="text-ink-3">{result.explanation}</p>
              <p className="text-ink-3">
                Окупаемость — сценария с этим N и резервом.{' '}
                {result.computed_at ? `Перебор от ${formatDate(result.computed_at)}.` : ''}
              </p>
            </Hint>
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
        </>
      }
    >
      {!result ? (
        <p className="text-[13.5px] leading-relaxed text-ink-2">
          Формула цикла дала {count.analytic} {pluralRu(count.analytic, ['робота', 'роботов', 'роботов'])} с запасами.
          Перебор прогонит одни и те же пиковые часы на планировке для разного N и найдёт минимальное, при котором SLA
          держат все прогоны. Найденное число запишется в сценарий, экономика пересчитается.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_14rem]">
          <SweepBars result={result} shownCount={shownCount} onOpen={onOpen} />
          {formula && simulated && (
            <div className="space-y-2">
              <FleetTile title="По формуле цикла" fleet={formula} active={usingFormula} />
              <FleetTile title="По имитации" fleet={simulated} active={usingSimulation} />
              <Button
                size="sm"
                variant="ghost"
                className="w-full"
                disabled={busy}
                title={usingSimulation ? 'Считать число роботов по формуле цикла' : 'Считать число роботов по имитации'}
                onClick={() =>
                  source.mutate({ processKey: sizing.process_key, manual: usingSimulation ? formula.total : null })
                }
              >
                {source.isPending && <Spinner />}
                {usingSimulation ? `Считать по формуле (${formula.total})` : `Считать по имитации (${simulated.total})`}
              </Button>
            </div>
          )}
        </div>
      )}
      {sweep.isError && <p className="mt-2 text-[12.5px] text-crit">{parseApiProblem(sweep.error).detail}</p>}
    </Section>
  )
}

/* Столбцы перебора: высота — худший из прогонов пика (он решает, принят ли парк), шкала от нуля, линия — цель.
   Принятое N — оранжевое, не держащие SLA — бледные. Клик открывает прогон на карте. */
function SweepBars({
  result,
  shownCount,
  onOpen,
}: {
  result: FleetSweepResult
  shownCount: number | null
  onOpen: (count: number, simulationId: string | null) => void
}) {
  const H = 132
  return (
    <div>
      <div className="relative flex items-end gap-2" style={{ height: H + 22 }}>
        {result.target_pct != null && (
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-signal/60"
            style={{ bottom: (result.target_pct / 100) * H + 22 }}
          ></div>
        )}
        {result.points.map((p) => {
          const worst = p.sla_min_pct ?? p.sla_achieved_pct
          const chosen = p.count === result.recommended_count
          return (
            <button
              key={p.count}
              type="button"
              onClick={() => onOpen(p.count, p.simulation_id ?? null)}
              title={`${p.count} роботов: в среднем ${formatNumber(p.sla_achieved_pct, 1)} %, худший прогон ${formatNumber(worst, 1)} %, загрузка ${formatPct(p.utilization, { share: true, digits: 0 })}`}
              className="group flex min-w-0 flex-1 flex-col items-center justify-end"
            >
              <span className={cn('num mb-1 text-[11.5px]', p.passed ? 'text-ink-2' : 'text-crit')}>
                {formatNumber(worst, 0)} %
              </span>
              <motion.span
                className={cn(
                  'w-full max-w-12 rounded-t-[4px] transition-opacity group-hover:opacity-80',
                  chosen ? 'bg-signal' : p.passed ? 'bg-ink' : 'bg-ink/20',
                  p.count === shownCount && 'ring-2 ring-info ring-offset-2 ring-offset-card',
                )}
                initial={{ height: 0 }}
                animate={{ height: Math.max(2, (worst / 100) * H) }}
                transition={{ type: 'spring', stiffness: 320, damping: 24 }}
              />
            </button>
          )
        })}
      </div>
      <div className="mt-1.5 flex gap-2">
        {result.points.map((p) => (
          <div key={p.count} className="min-w-0 flex-1 text-center">
            <div
              className={cn(
                'num text-[14px]',
                p.count === result.recommended_count ? 'font-extrabold text-ink' : 'text-ink-2',
              )}
            >
              {p.count}
            </div>
            <div className="num truncate text-[11px] text-ink-4">{p.passed ? formatYears(p.payback_years) : '—'}</div>
          </div>
        ))}
      </div>
      <p className="meta mt-2">Число роботов · окупаемость сценария; высота — худший из прогонов пика</p>
    </div>
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
    <div className="min-w-0 px-3 py-2.5">
      <div className="truncate text-[12px] text-ink-3">{label}</div>
      <div className="flex items-baseline gap-1 whitespace-nowrap">
        <KpiNumber value={value} className={`display text-[20px] ${c}`} />
        <span className="text-[11.5px] text-ink-3">{unit}</span>
      </div>
    </div>
  )
}

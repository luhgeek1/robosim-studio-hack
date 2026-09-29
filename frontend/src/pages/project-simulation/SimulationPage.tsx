import { AnimatePresence, motion } from 'framer-motion'
import { Camera, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { useLayout } from '@/entities/layout'
import { useProject, useProjectId } from '@/entities/project'
import { useObjectType } from '@/entities/reference'
import { useUploadVisual } from '@/entities/report'
import { SCENARIO_KIND_LABEL, useCalculation, useScenarios } from '@/entities/scenario'
import {
  buildTracks,
  isFinal,
  poseAt,
  useLastSweep,
  usePlayback,
  useSimulationHeatmap,
  useSimulationReplay,
  useSimulationRun,
  useSimulationTimeline,
  useSimulations,
  useStartSimulation,
  type RobotTrack,
  type SimulationSummary,
} from '@/entities/simulation'
import { parseApiProblem, problemText } from '@/shared/api/problem'
import type { Scenario, SizingResult } from '@/shared/api/types'
import { formatNumber, formatPct, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Callout, Screen } from '@/shared/ui/page'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { EmptyState, ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { Toggle } from '@/shared/ui/toggle'
import { Segmented } from '@/shared/ui/v0'
import { Twin, type TwinCapture, type TwinView } from '@/widgets/twin'
import { BusySection } from './BusySection'
import { PlayerBar, clock, usePlaybackDriver } from './PlayerBar'
import { QueueBackdrop } from './QueueSparkline'
import {
  COUNT_HINT,
  configKey,
  configOf,
  runPayload,
  stressChecks,
  usable,
  whatIfText,
  workingCount,
  type RunConfig,
} from './runConfig'
import { StageSide } from './StageSide'
import { StressChecks } from './StressChecks'
import { WhyCount } from './WhyCount'

const POSE_LABEL: Record<string, string> = {
  moving: 'в пути',
  load: 'погрузка',
  unload: 'выгрузка',
  charge: 'на зарядке',
  wait: 'ждёт в заторе',
  idle: 'свободен',
  fail: 'отказ',
}

const DETAILS_ANCHOR = 'simulation-details'

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
            <SelectTrigger className="w-72 bg-card" aria-label="Вариант сценария">
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
  // Готовые прогоны по условиям; прогон, записавший N в сценарий, — первым.
  const existing = useMemo(() => {
    const byKey: Record<string, string> = {}
    if (!sizing) return byKey
    for (const r of runs.data ?? []) {
      const c = configOf(r, sizing.process_key)
      if (!usable(r) || !c) continue
      const k = configKey(c)
      if (!byKey[k] || r.id === sizing.count.simulation_id) byKey[k] = r.id
    }
    return byKey
  }, [runs.data, sizing])
  const runIdFor = (c: RunConfig) => runIds[configKey(c)] ?? existing[configKey(c)] ?? null
  const runId = runIdFor(config)
  const run = useSimulationRun(runId)
  const summary = (run.data?.status === 'done' ? run.data.summary : null) ?? null
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
  const [startingChecks, setStartingChecks] = useState(false)

  const startRun = (c: RunConfig) =>
    start
      .mutateAsync(runPayload(c, sizing!.process_key))
      .then((created) => setRunIds((prev) => ({ ...prev, [configKey(c)]: created.id })))

  useEffect(() => {
    if (!sizing || runId || runs.isPending || start.isPending || error) return
    startRun(config).catch((e) => setError(parseApiProblem(e).detail))
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
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const checks = sizing ? stressChecks(working).map((check) => ({ check, runId: runIdFor(check.config) })) : []
  const runAllChecks = () => {
    setStartingChecks(true)
    Promise.all(checks.filter((c) => !c.runId).map((c) => startRun(c.check.config)))
      .catch((e) => toast.error(parseApiProblem(e).detail))
      .finally(() => setStartingChecks(false))
  }

  const layout = replay.data?.layout ?? projectLayout.data
  const busy = !summary && (start.isPending || (run.data && !isFinal(run.data.status)) || (runId === null && !error))
  const failed = run.data?.status === 'failed' ? (run.data.error?.detail ?? 'Прогон завершился с ошибкой') : null
  const variantIds = sizing
    ? variants.filter((s) => s.items.some((i) => i.process_key === sizing.process_key)).map((s) => s.id)
    : []
  const sweepPoint =
    run.data?.purpose === 'sweep' ? lastSweep?.points.find((p) => p.simulation_id === run.data?.id) : undefined
  const whatIf = sizing ? whatIfText(sizing, config, working) : null

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

  return (
    <Screen
      title={headline(config, sizing, summary)}
      lead={
        !sizing
          ? 'В сценарии нет процесса с моделью цикла — имитировать нечего.'
          : summary
            ? undefined
            : 'Имитация прогонит день на планировке объекта и проверит, успевает ли парк выполнять задачи в срок.'
      }
      actions={
        <>
          {picker}
          {sizing && (
            <Button variant="outline" disabled={!tracks || upload.isPending} onClick={() => void snapshot()}>
              {upload.isPending ? <Spinner /> : <Camera />} Снимок в отчёт
            </Button>
          )}
        </>
      }
    >
      {calculation.isPending && <LoadingBlock label="Загружаем расчёт…" />}
      {calculation.isError && <ErrorBlock error={calculation.error} onRetry={() => calculation.refetch()} />}

      {sizing && (
        <div className="space-y-5">
          <section className="card overflow-hidden">
            <RunConditions
              config={config}
              counts={counts}
              working={working}
              sizing={sizing}
              whatIf={whatIf}
              onChange={change}
            />
            <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="relative h-[min(560px,62vh)] min-h-100">
                {(error || replay.isError) && (
                  <div className="absolute inset-x-3 top-3 z-20 space-y-2">
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
                      <Spinner /> Считаем день имитацией{run.data?.stage ? `: ${run.data.stage}` : '…'}
                      {run.data && run.data.progress > 0 && (
                        <span className="num text-white/70">{Math.round(run.data.progress * 100)} %</span>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <StageSide
                run={run.data}
                summary={summary}
                timeline={timeline.data}
                sweepPoint={sweepPoint}
                placeholder={failed ?? (busy ? 'Показатели появятся, когда прогон завершится.' : 'Нет прогона.')}
                onDetails={() =>
                  document.getElementById(DETAILS_ANCHOR)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
              />
            </div>
            <div className="border-t border-line px-5 py-2.5">
              <PlayerBar
                disabled={!tracks}
                backdrop={timeline.data ? <QueueBackdrop points={timeline.data.points} /> : undefined}
              />
            </div>
          </section>

          <div id={DETAILS_ANCHOR} className="scroll-mt-32 space-y-5">
            <WhyCount
              projectId={projectId}
              scenarioId={scenario.id}
              variantIds={variantIds}
              sizing={sizing}
              last={lastSweep}
              summary={summary}
              shownCount={config.count}
              onOpen={openRun}
            />
            <StressChecks
              checks={checks}
              starting={startingChecks}
              onRunAll={runAllChecks}
              onOpen={(c) => {
                change(c)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            />
            {summary && <BusySection summary={summary} />}
          </div>
        </div>
      )}
    </Screen>
  )
}

// Заголовок-вывод: держит ли этот парк срок в выбранных условиях.
function headline(config: RunConfig, sizing: SizingResult | undefined, summary: SimulationSummary | null) {
  const robots = `${config.count} ${pluralRu(config.count, ['робот', 'робота', 'роботов'])}`
  if (!sizing || !summary) return `${robots} ${sizing?.product_name ?? ''}`.trim()
  const { achieved_pct: sla, target_pct: target, target_value, target_unit } = summary.sla
  const holds = sla >= target
  const window = config.mode === 'peak' ? 'пик' : 'обычный день'
  const within = target_value != null ? ` за ${formatNumber(target_value)} ${target_unit ?? 'мин'}` : ' в срок'
  return `${robots} ${holds ? (config.count === 1 ? 'держит' : 'держат') : config.count === 1 ? 'не держит' : 'не держат'} ${window}: ${formatNumber(sla, sla >= 99 ? 0 : 1)} % задач${within}`
}

/* Первая строка карточки — песочница: сколько роботов, какой день и какие сбои. Смена условий сразу запускает прогон;
   если условия отличаются от расчёта, строка говорит, что это проверка «что если». */
function RunConditions({
  config,
  counts,
  working,
  sizing,
  whatIf,
  onChange,
}: {
  config: RunConfig
  counts: number[]
  working: number
  sizing: SizingResult
  whatIf: string | null
  onChange: (next: Partial<RunConfig>) => void
}) {
  return (
    <div className={cn('border-b border-line px-5 py-3', whatIf && 'bg-info-soft/40')}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Field label="Роботов">
          <Segmented
            size="sm"
            value={config.count}
            onChange={(count) => onChange({ count })}
            options={counts.map((n) => ({
              value: n,
              label: n === working ? `${n} ●` : String(n),
              hint: n === working ? COUNT_HINT[sizing.count.source] : undefined,
            }))}
          />
        </Field>
        <Field label="Режим">
          <Segmented
            size="sm"
            value={config.mode}
            onChange={(mode) => onChange({ mode })}
            options={[
              {
                value: 'peak',
                label: 'Пиковые часы',
                hint: `${formatNumber(sizing.demand_peak_per_hour)} ед/ч без передышки, как в переборе флота`,
              },
              {
                value: 'normal',
                label: 'Обычный день',
                hint: `Сутки: ${formatNumber(sizing.demand_avg_per_hour)} ед/ч в среднем, пик в середине смены`,
              },
            ]}
          />
        </Field>
        <Field label="Стресс">
          <div className="flex gap-2">
            <Toggle
              variant="outline"
              pressed={config.volume}
              onPressedChange={(volume) => onChange({ volume })}
              className="h-8 px-3 data-[state=on]:border-ink data-[state=on]:bg-ink data-[state=on]:text-white"
              title="Объём задач на 20 % больше"
            >
              +20 % объёма
            </Toggle>
            <Toggle
              variant="outline"
              pressed={config.failure}
              onPressedChange={(failure) => onChange({ failure })}
              className="h-8 px-3 data-[state=on]:border-ink data-[state=on]:bg-ink data-[state=on]:text-white"
              title="Один робот выходит из строя на 2 часа в начале смены"
            >
              Отказ робота на 2 ч
            </Toggle>
          </div>
        </Field>
      </div>
      {whatIf && <p className="mt-2 text-[12.5px] text-info">{whatIf}</p>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="hud">{label}</span>
      {children}
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

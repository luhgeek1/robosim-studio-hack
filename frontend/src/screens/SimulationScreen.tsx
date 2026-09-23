import { Play, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useLayout } from '@/api/layout'
import { useProject } from '@/api/projects'
import {
  useFleetSweep,
  useHeatmap,
  useLastSweep,
  useReplay,
  useSimulation,
  useSimulations,
  useStartSimulation,
  useTimeline,
} from '@/api/simulation'
import { useBuildStory, useStory } from '@/api/story'
import type { SimulationStart } from '@/api/simulation'
import type { SimulationRun } from '@/api/types'
import { Screen } from '@/components/Screen'
import { PlayerBar, usePlaybackDriver } from '@/components/simulation/PlayerBar'
import { SimAside, slaTone } from '@/components/simulation/SimAside'
import { SimulatableSwap } from '@/components/simulation/SimulatableSwap'
import { SweepPanel } from '@/components/simulation/SweepPanel'
import { Empty, ErrorState, Loading } from '@/components/States'
import { Button, Dot, Pill, Segmented, Select } from '@/components/ui'
import { formatNumber } from '@/lib/format'
import { SCENARIO_KIND_LABEL } from '@/lib/labels'
import { stepPath, useProjectId } from '@/lib/story'
import { useStore } from '@/store'
import { buildTracks, usePlayback } from '@/twin/playback'
import { Twin } from '@/twin/Twin'

type Mode = 'peak' | 'normal'
type Draft = { count: number; mode: Mode; volume: boolean; failure: boolean }

const VOLUME_STRESS = 1.2
const SLA_LABEL = { ok: 'SLA выполняется', warn: 'SLA под угрозой', crit: 'SLA не выполняется' } as const

const runDraft = (run: SimulationRun): Draft => ({
  count: run.fleet?.[0]?.count ?? 1,
  mode: run.config.mode === 'normal' ? 'normal' : 'peak',
  volume: (run.config.volume_multiplier ?? 1) > 1,
  failure: (run.config.failures?.length ?? 0) > 0,
})

const sameDraft = (a: Draft, b: Draft) =>
  a.count === b.count && a.mode === b.mode && a.volume === b.volume && a.failure === b.failure

export function SimulationScreen() {
  usePlaybackDriver()
  const projectId = useProjectId()
  const navigate = useNavigate()
  const project = useProject(projectId).data
  const story = useStory(projectId)
  const build = useBuildStory(projectId)
  const toast = useStore((s) => s.toast)
  const robotized = story.scenarios.filter((s) => !s.is_baseline && s.items.length > 0)
  const [scenarioId, setScenarioId] = useState<string | null>(null)
  const scenario = robotized.find((s) => s.id === scenarioId) ?? story.main
  const runs = useSimulations(scenario?.id)
  const itemSimulation = scenario?.items.find((i) => i.count_result?.simulation_id)?.count_result?.simulation_id
  const latestDone = runs.data?.find((r) => r.status === 'done' && (r.events_count ?? 0) > 0)
  const [picked, setPicked] = useState<string | null>(null)
  const runId = picked ?? itemSimulation ?? latestDone?.id ?? null
  const run = useSimulation(runId)
  const ready = run.data?.status === 'done'
  const replay = useReplay(runId, ready)
  const timeline = useTimeline(runId, ready)
  const [heatOn, setHeatOn] = useState(false)
  const heat = useHeatmap(runId, ready && heatOn)
  const layoutQuery = useLayout(projectId)
  const start = useStartSimulation(scenario?.id ?? '')
  const processKey = run.data?.fleet?.[0]?.process_key ?? scenario?.items[0]?.process_key
  const sweepData = useLastSweep(scenario?.id, processKey).data ?? undefined
  const variantIds = robotized
    .filter((s) => s.id !== scenario?.id && s.items.some((i) => i.process_key === processKey))
    .map((s) => s.id)
  const sweep = useFleetSweep(projectId, scenario?.id ?? '', variantIds)
  const [selectedRobot, setSelectedRobot] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [draftFor, setDraftFor] = useState<string | null>(null)

  if (run.data && run.data.id !== draftFor && run.data.status === 'done') {
    setDraftFor(run.data.id)
    setDraft(runDraft(run.data))
  }

  const tracks = useMemo(() => (replay.data ? buildTracks(replay.data, replay.data.layout) : undefined), [replay.data])
  useEffect(() => {
    if (replay.data && runId) usePlayback.getState().load(runId, replay.data.total_seconds)
  }, [replay.data, runId])

  const summary = run.data?.summary
  const fleet = run.data?.fleet?.[0]
  const layout = replay.data?.layout ?? layoutQuery.data
  const shown = run.data && run.data.status === 'done' ? runDraft(run.data) : null
  const dirty = Boolean(draft && shown && !sameDraft(draft, shown))
  const busy = start.isPending || run.data?.status === 'queued' || run.data?.status === 'running'

  const launch = async () => {
    if (!draft || !scenario || !processKey) return
    const cached = runs.data?.find(
      (r) => r.status === 'done' && (r.events_count ?? 0) > 0 && sameDraft(runDraft(r), draft),
    )
    if (cached) {
      setPicked(cached.id)
      return
    }
    const body: SimulationStart = {
      mode: draft.mode,
      record_events: true,
      fleet_override: [{ process_key: processKey, count: draft.count }],
      volume_multiplier: draft.volume ? VOLUME_STRESS : 1,
      failures: draft.failure ? [{ robot_index: 0, at_hour: 1, duration_hours: 2 }] : [],
    }
    const created = await start.mutateAsync(body).catch(() => null)
    if (created) setPicked(created.id)
  }

  const runSweep = async () => {
    if (!processKey) return
    const result = await sweep.mutateAsync({ process_key: processKey, mode: 'peak' }).catch(() => null)
    if (!result) return
    if (result.simulation_id) setPicked(result.simulation_id)
    toast(
      `Перебор флота: ${result.recommended_count ?? '—'} роботов — число записано в сценарий${variantIds.length ? ' и в варианты RaaS и лизинга' : ''}`,
    )
  }

  if (story.isPending) return <Screen title="Имитация">{<Loading label="Загружаем сценарии…" />}</Screen>
  if (!scenario)
    return (
      <Screen title="Сначала выберите роботов">
        <Empty
          title="Для имитации нужен состав: процесс → робот"
          action={
            <Button
              variant="primary"
              icon={<Sparkles size={15} />}
              onClick={() => build.mutate({})}
              disabled={build.isPending}
            >
              {build.isPending ? 'Собираем сценарий…' : 'Собрать по рекомендации подбора'}
            </Button>
          }
        >
          Возьмём лучшие подходящие решения по каждому процессу — потом их можно поменять на шаге «Роботы».
        </Empty>
      </Screen>
    )
  if (project?.object_type !== 'warehouse')
    return (
      <Screen title="Имитация для этого типа объекта — следующим этапом">
        <Empty title="Число роботов посчитано по времени цикла">
          Дискретно-событийная имитация сейчас построена для склада (D-005). Для аэропорта и больницы количество роботов
          берётся из расчёта по времени цикла с резервом — его видно на шаге «Экономика».
        </Empty>
      </Screen>
    )

  // The fleet decision is made on the sweep average; a single recorded run may land above or below it.
  const sweepPoint = run.data?.purpose === 'sweep' ? sweepData?.points.find((p) => p.count === fleet?.count) : undefined
  const headlineSla = sweepPoint?.sla_achieved_pct ?? summary?.sla.achieved_pct
  const tone = summary && headlineSla != null ? slaTone(headlineSla, summary.sla.target_pct) : 'neutral'
  const countOptions = shown
    ? [shown.count - 1, shown.count, shown.count + 1]
        .filter((n) => n >= 1)
        .map((n) => ({ value: n, label: `${n} роб.` }))
    : []

  return (
    <Screen
      wide
      title={
        summary && fleet ? (
          <>
            {fleet.count} × {fleet.product_name}
            <span className="ml-3 align-middle">
              <Pill tone={tone} className="!h-7 !px-2.5 !text-[13px]">
                <Dot tone={tone} pulse={tone !== 'ok'} />
                {SLA_LABEL[tone as keyof typeof SLA_LABEL] ?? ''}
                {sweepPoint
                  ? ` · ${formatNumber(sweepPoint.sla_achieved_pct, 1)} % в среднем по ${sweepPoint.runs} прогонам`
                  : ''}
              </Pill>
            </span>
          </>
        ) : (
          'Сколько роботов нужно на самом деле'
        )
      }
      lead={
        summary ? (
          <>
            {run.data?.config.mode === 'normal' ? 'Обычный день' : 'Пиковое окно'}{' '}
            {formatNumber(summary.duration_hours ?? 0, 1)} ч: задач {formatNumber(summary.demand_total)}, выполнено{' '}
            {formatNumber(summary.completed)}
            {summary.completed_by_humans ? `, из них людьми — ${summary.completed_by_humans}` : ''}. Роботы ездят по
            графу планировки вашего объекта: однополосные проходы, ворота, зарядки — это журнал событий имитации, не
            анимация.
          </>
        ) : (
          'Имитация прогонит пиковый день на планировке объекта и проверит, успевает ли парк выполнять задачи в срок.'
        )
      }
      aside={
        robotized.length > 1 ? (
          <Select
            ariaLabel="Сценарий"
            value={scenario.id}
            onChange={(id) => {
              setScenarioId(id)
              setPicked(null)
            }}
            options={robotized.map((s) => ({ value: s.id, label: `${SCENARIO_KIND_LABEL[s.kind]} · ${s.name}` }))}
            className="!w-[300px]"
          />
        ) : undefined
      }
      nextLabel="Посчитать экономику"
      onNext={() => navigate(stepPath(projectId, 'economics'))}
    >
      {draft && shown && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Segmented
            layoutId="sim-count"
            value={draft.count}
            onChange={(count) => setDraft({ ...draft, count })}
            options={countOptions}
          />
          <Segmented
            layoutId="sim-mode"
            value={draft.mode}
            onChange={(mode) => setDraft({ ...draft, mode })}
            options={[
              { value: 'peak', label: 'Пиковый день' },
              { value: 'normal', label: 'Обычный день' },
            ]}
          />
          <Toggle
            on={draft.volume}
            onClick={() => setDraft({ ...draft, volume: !draft.volume })}
            label="+20 % объёма"
          />
          <Toggle
            on={draft.failure}
            onClick={() => setDraft({ ...draft, failure: !draft.failure })}
            label="Отказ робота на 2 ч"
          />
          <Toggle on={heatOn} onClick={() => setHeatOn((v) => !v)} label="Заторы" />
          {dirty && (
            <Button variant="primary" size="sm" icon={<Play size={14} />} onClick={() => void launch()} disabled={busy}>
              Запустить прогон
            </Button>
          )}
        </div>
      )}

      {runs.isPending && <Loading label="Ищем прогоны имитации…" />}
      {!runs.isPending && !runId && (
        <Empty
          title="Имитация ещё не запускалась"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="primary"
                icon={<Sparkles size={15} />}
                onClick={() => void runSweep()}
                disabled={sweep.isPending}
              >
                {sweep.isPending ? 'Перебираем флот… до минуты' : 'Подобрать число роботов имитацией'}
              </Button>
              <Button
                icon={<Play size={15} />}
                onClick={() =>
                  void start
                    .mutateAsync({ mode: 'peak', record_events: true })
                    .then((r) => setPicked(r.id))
                    .catch(() => undefined)
                }
                disabled={busy}
              >
                Прогнать пиковый день
              </Button>
            </div>
          }
        >
          Перебор флота прогонит один и тот же пиковый день для разного числа роботов и запишет минимальное, при котором
          SLA выполняется, в сценарий.
        </Empty>
      )}
      {processKey && !runId && (
        <SimulatableSwap
          projectId={projectId}
          scenario={scenario}
          processKey={processKey}
          busy={busy || sweep.isPending}
          onSwapped={() => {
            sweep.reset()
            start.reset()
            void runSweep()
          }}
        />
      )}
      {(sweep.error || start.error) && (
        <div className="mb-4 space-y-2">
          <ErrorState error={sweep.error ?? start.error} title="Имитация для этого состава не запустилась" />
          <p className="text-[13px] text-ink-3">
            Сейчас имитация строится для транспортных роботов и «товар к человеку». Для остальных типов число роботов
            остаётся по расчёту времени цикла — его видно на шаге «Экономика». Чтобы проверить парк имитацией, выберите
            транспортного робота (AMR) на шаге «Роботы».
          </p>
        </div>
      )}
      {run.error && <ErrorState error={run.error} />}
      {run.data?.status === 'failed' && <ErrorState error={run.data.error} title="Имитация завершилась с ошибкой" />}

      {runId && layout && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
          <div className="card relative h-[640px] overflow-hidden">
            <Twin
              layout={layout}
              tracks={tracks}
              heat={heatOn ? heat.data : null}
              selectedRobot={selectedRobot}
              onSelectRobot={setSelectedRobot}
            />
            {busy && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/60 backdrop-blur-[2px]">
                <div className="card px-5 py-4 text-center">
                  <div className="h3">Имитация идёт</div>
                  <div className="meta mt-1">
                    {run.data?.stage ?? 'в очереди'} · {formatNumber((run.data?.progress ?? 0) * 100, 0)} %
                  </div>
                </div>
              </div>
            )}
            {ready && replay.isPending && (
              <div className="absolute inset-x-0 top-16 z-20 flex justify-center">
                <Pill>загружаем журнал событий…</Pill>
              </div>
            )}
            {tracks && <PlayerBar />}
          </div>
          {run.data?.summary ? (
            <SimAside run={run.data} timeline={timeline.data} />
          ) : (
            <div className="card flex h-[640px] items-center justify-center p-6 text-center text-[13.5px] text-ink-3">
              Показатели появятся, когда прогон завершится.
            </div>
          )}
        </div>
      )}

      {runId && (
        <div className="mt-5">
          <SweepPanel
            sweep={sweepData}
            explanation={(() => {
              const result = scenario.items.find((i) => i.process_key === processKey)?.count_result
              return result?.source === 'simulated' ? result.explanation : null
            })()}
            running={sweep.isPending}
            onRun={() => void runSweep()}
            onPick={(id) => setPicked(id)}
            shownCount={fleet?.count}
          />
        </div>
      )}
    </Screen>
  )
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`h-8 rounded-[9px] border px-3 text-[13px] font-medium transition-colors ${
        on ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink-2 hover:border-line-2'
      }`}
    >
      {label}
    </button>
  )
}

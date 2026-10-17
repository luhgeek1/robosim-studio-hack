import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { Link } from 'react-router'
import { useDemoReplay, type DemoSnapshot } from '@/entities/demo/api'
import { demoUrl } from '@/entities/demo/navigation'
import { buildTracks, usePlayback } from '@/entities/simulation'
import { formatNumber } from '@/shared/lib/format'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { Callout } from '@/shared/ui/page'
import { LayoutMap } from '@/widgets/layout-map'
import type { TwinView } from '@/widgets/twin'
import { PlayerBar, usePlaybackDriver } from '@/widgets/twin/PlayerBar'
import { WorkbenchFrame, WorkbenchGrid, PaneSection, PaneTitle, StatusBar } from '@/widgets/workbench'
import { GuestScreen } from './GuestScreen'
import { FleetCheckPanel, type FleetCheckState } from './FleetCheck'
import { DemoBadge } from './DemoBadge'
const Twin = lazy(() => import('@/widgets/twin').then((m) => ({ default: m.Twin })))
const PANELS = { left: false, right: true, bottom: true }

export function Simulation({ demo, fleet }: { demo: DemoSnapshot; fleet: FleetCheckState }) {
  const [view, setView] = useState<TwinView>('3d')
  const reduced = useReducedMotion()
  const total = Number(demo.simulation?.summary?.duration_hours ?? 0) * 3600
  const replayWindow = usePlayback((s) =>
    s.runId === demo.simulation?.id ? Math.floor(Math.min(s.t, Math.max(0, total - 1)) / 3600) * 3600 : 0,
  )
  const replay = useDemoReplay(demo.demo.key, demo.revision, replayWindow, !!demo.simulation)
  const tracks = useMemo(() => (replay.data ? buildTracks(replay.data, replay.data.layout) : []), [replay.data])
  usePlaybackDriver()
  useEffect(() => {
    if (replay.data) {
      const c = usePlayback.getState()
      c.load(replay.data.simulation_id, replay.data.total_seconds)
      if (reduced) c.setPlaying(false)
    }
  }, [replay.data, reduced])
  const resume = useRef(false)
  useEffect(() => {
    const c = usePlayback.getState()
    if (replay.isFetching && c.playing) {
      resume.current = true
      c.setPlaying(false)
    } else if (!replay.isFetching && !replay.isError && resume.current) {
      resume.current = false
      c.setPlaying(true)
    }
  }, [replay.isFetching, replay.isError])
  useEffect(() => () => usePlayback.getState().setPlaying(false), [])
  const sweep = demo.sweep
  const sla = demo.simulation?.summary?.sla as { achieved_pct?: number; target_pct?: number } | undefined
  if (replay.isError)
    return (
      <GuestScreen title="Имитация">
        <ErrorBlock error={replay.error} onRetry={() => replay.refetch()} />
      </GuestScreen>
    )
  if (!demo.simulation)
    return (
      <GuestScreen title="Имитация">
        <Callout>Для этого примера прогон пока недоступен. Подбор и расчёт можно посмотреть в предыдущем шаге.</Callout>
      </GuestScreen>
    )
  if (!replay.data)
    return (
      <GuestScreen title="Имитация">
        <LoadingBlock label="Загружаем сохранённый прогон…" />
      </GuestScreen>
    )
  return (
    <WorkbenchFrame
      projectId={demo.demo.key}
      step="simulation"
      title={demo.demo.name}
      titleHint={demo.demo.name}
      eyebrow={<DemoBadge compact />}
      className="top-[10.375rem] xl:top-14"
      navigation={{
        index: 2,
        total: 4,
        previous: { label: 'Подбор и экономика', to: demoUrl(demo.demo.key, 'decision') },
        next: { label: 'Отчёт', to: demoUrl(demo.demo.key, 'report') },
      }}
    >
      <div className="guest-simulation-grid flex min-h-0 flex-1 flex-col max-lg:[&>div]:auto-rows-max max-lg:[&>div>aside>div]:h-auto max-lg:[&>div>aside>div]:overflow-visible [@media(max-width:1023px)]:[&>div>section]:order-2">
        <WorkbenchGrid
          panels={PANELS}
          leftWidth={0}
          rightWidth={320}
          left={null}
          center={
            <Suspense
              fallback={
                <LayoutMap
                  layout={replay.data.layout}
                  fill
                  legend={false}
                  simplified
                  className="h-full rounded-none border-0"
                />
              }
            >
              <Twin layout={replay.data.layout} tracks={tracks} view={view} onViewChange={setView} controls="basic" />
            </Suspense>
          }
          right={
            <>
              <PaneTitle>От формулы — к проверенному парку</PaneTitle>
              <FleetCheckPanel demo={demo} fleet={fleet} />
              <PaneSection title="Сохранённый прогон · задачи в срок">
                <div className="display num text-[36px]">
                  {formatNumber(sla?.achieved_pct)}
                  <span className="ml-1 text-[20px] text-ink-3">%</span>
                </div>
                <p className="meta mt-1">при цели {formatNumber(sla?.target_pct)}%</p>
                <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
                  Доля задач, которые парк успел выполнить за необходимое время.
                </p>
              </PaneSection>
              <PaneSection title="Условия проверки">
                <p className="text-[13px]">
                  {sweep?.joint_validation?.status === 'passed'
                    ? `Проверка пройдена в ${sweep.joint_validation.replications} прогонах.`
                    : 'Совместная проверка не подтверждена.'}
                </p>
                <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
                  Сохранённый прогон на сгенерированной планировке. Движение, очереди и зарядка участвуют в расчёте.
                </p>
                <details className="mt-3 text-[12px] text-ink-3">
                  <summary className="cursor-pointer">Подробнее</summary>
                  <p className="mt-2 leading-relaxed">{sweep?.explanation}</p>
                  {sweep?.joint_validation?.skipped_processes.map((p) => (
                    <p key={p.process_key} className="mt-2">
                      {p.reason}
                    </p>
                  ))}
                </details>
              </PaneSection>
              <div className="mt-auto border-t border-line p-3.5 text-[12px] leading-relaxed text-ink-3">
                В своём проекте можно редактировать план, менять парк и проверять пиковую нагрузку.
                <Link
                  to={demoUrl(demo.demo.key, 'report')}
                  className="mt-2 block font-medium text-ink underline underline-offset-4"
                >
                  Продолжить в своём проекте
                </Link>
              </div>
            </>
          }
          bottom={
            <div className="guest-simulation-player px-4 py-3 [&>div]:flex-wrap [&_input[type=range]]:basis-[28%] [@media(max-width:720px)]:[&>div]:gap-2 [@media(max-width:720px)]:[&_input[type=range]]:basis-1/5">
              <p className="mb-2 text-[11px] text-ink-3">
                На карте — подготовленный прогон проверенного парка, а не текущая оценка по формуле.
              </p>
              <PlayerBar disabled={replay.isFetching} speeds={[60, 120, 300]} />
            </div>
          }
          status={
            <div className="order-5 col-span-full lg:order-none">
              <StatusBar
                status="Демо-прогон"
                live={false}
                items={['Исходные условия']}
                metrics={[`SLA ${formatNumber(sla?.achieved_pct)}%`]}
                panels={PANELS}
                onToggle={() => {}}
                toggles={[]}
              />
            </div>
          }
        />
      </div>
    </WorkbenchFrame>
  )
}

import { useEffect, useMemo, useRef } from 'react'
import { useDemoReplay, type DemoSnapshot } from '@/entities/demo/api'
import { buildTracks, usePlayback } from '@/entities/simulation'
import { LayoutMap } from '@/widgets/layout-map'
import { RobotsLayer, ROBOT_LEGEND } from '@/widgets/twin/Robots2D'
import { PlayerBar, usePlaybackDriver } from '@/widgets/twin/PlayerBar'
import { formatNumber as n, formatRub as rub } from '@/shared/lib/format'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'

export function Simulation({ demo, changedVolume }: { demo: DemoSnapshot; changedVolume: boolean }) {
  const t = usePlayback((s) => (s.runId === demo.simulation?.id ? s.t : 0))
  const total = Number(demo.simulation?.summary?.duration_hours ?? 0) * 3600
  const window = Math.floor(Math.min(t, Math.max(0, total - 1)) / 3600) * 3600
  const replay = useDemoReplay(demo.demo.key, demo.revision, window, !!demo.simulation)
  const tracks = useMemo(() => (replay.data ? buildTracks(replay.data, replay.data.layout) : []), [replay.data])
  usePlaybackDriver()
  useEffect(() => {
    if (replay.data) usePlayback.getState().load(replay.data.simulation_id, replay.data.total_seconds)
  }, [replay.data])
  const resume = useRef(false)
  useEffect(() => {
    const clock = usePlayback.getState()
    if (replay.isFetching && clock.playing) {
      resume.current = true
      clock.setPlaying(false)
    } else if (!replay.isFetching && !replay.isError && resume.current) {
      resume.current = false
      clock.setPlaying(true)
    }
  }, [replay.isFetching, replay.isError])
  useEffect(() => () => usePlayback.getState().setPlaying(false), [])
  const sweep = demo.sweep
  return (
    <section className="demo-panel">
      <div className="demo-eyebrow">СОХРАНЁННЫЙ ПРОГОН · SEED {demo.simulation?.seed}</div>
      <h2>Имитация меняет решение</h2>
      <p>
        Движение на карте воспроизводит события расчётной модели. Маршруты, очереди, зарядка и общие ресурсы участвуют в
        проверке парка.
      </p>
      {changedVolume && (
        <div className="demo-notice">
          Вы изменили нагрузку. Здесь показан исходный пример: этот прогон не подтверждает ваши новые условия.
        </div>
      )}
      {sweep && (
        <>
          <div className="demo-sim-metrics">
            <div>
              <span>Парк с резервом по формуле</span>
              <strong>{n(sweep.by_formula?.total)}</strong>
              <small>{rub(sweep.by_formula?.capex_rub)}</small>
            </div>
            <div>
              <span>{sweep.applied ? 'Парк с резервом после проверки' : 'Парк не подтверждён'}</span>
              <strong>{sweep.applied ? n(sweep.by_simulation?.total) : '—'}</strong>
              <small>{sweep.applied ? rub(sweep.by_simulation?.capex_rub) : 'Сохранён аналитический расчёт'}</small>
            </div>
            <div>
              <span>Совместная проверка</span>
              <strong>{sweep.joint_validation?.status === 'passed' ? 'Пройдена' : 'Не пройдена'}</strong>
              <small>{sweep.joint_validation?.replications} повторений</small>
            </div>
          </div>
          <p className="demo-small">{sweep.explanation}</p>
        </>
      )}
      {replay.isError ? (
        <ErrorBlock error={replay.error} onRetry={() => replay.refetch()} />
      ) : replay.data ? (
        <>
          <LayoutMap layout={replay.data.layout} className="h-[400px]" legend={false}>
            {(view) => <RobotsLayer tracks={tracks} k={view.k} />}
          </LayoutMap>
          <div className="demo-player">
            <PlayerBar disabled={replay.isFetching} />
          </div>
          <div className="demo-facts">
            {ROBOT_LEGEND.map(([color, label]) => (
              <span key={label}>
                <i style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
        </>
      ) : (
        <LoadingBlock label="Загружаем события имитации…" />
      )}
      <details className="demo-details">
        <summary>Кривая «количество роботов → уровень сервиса»</summary>
        <div className="demo-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Рабочих роботов процесса</th>
                <th>Минимальный SLA</th>
                <th>Проверка</th>
              </tr>
            </thead>
            <tbody>
              {sweep?.points.map((point) => (
                <tr key={point.count}>
                  <td>{point.count}</td>
                  <td>{n(point.sla_min_pct ?? point.sla_achieved_pct)}%</td>
                  <td>{point.passed ? 'Пройдена' : 'Не пройдена'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="demo-small">
          Проверен диапазон кандидатов. Результат не доказывает глобальный минимум среди всех возможных конфигураций.
        </p>
      </details>
      {sweep?.joint_validation?.skipped_processes.map((process) => (
        <p key={process.process_key} className="demo-notice">
          {process.reason}
        </p>
      ))}
      <p className="demo-small">
        Планировка сгенерирована по параметрам объекта. Для внедрения нужно обследование и проверка на реальном плане.
      </p>
    </section>
  )
}

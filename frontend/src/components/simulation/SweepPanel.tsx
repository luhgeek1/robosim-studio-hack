import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import type { FleetSweepResult } from '@/api/types'
import { formatNumber, formatRub, formatYears } from '@/lib/format'
import { Button, Hint } from '../ui'

// «Почему N, а не N−1 и не N+1» — the fleet sweep is the proof: the same peak-day task stream replayed for each N.
export function SweepPanel({
  sweep,
  explanation,
  running,
  onRun,
  onPick,
  shownCount,
}: {
  sweep?: FleetSweepResult
  explanation?: string | null
  running: boolean
  onRun: () => void
  onPick: (simulationId: string) => void
  shownCount?: number
}) {
  if (!sweep) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="max-w-[720px]">
          <div className="h3">Почему столько роботов</div>
          <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">
            {explanation ??
              'Перебор флота прогонит один и тот же пиковый день для разного числа роботов и найдёт минимальное, при котором задачи выполняются в срок.'}
          </p>
        </div>
        <Button variant="secondary" icon={<Sparkles size={15} />} onClick={onRun} disabled={running}>
          {running ? 'Перебираем флот…' : 'Показать перебор флота'}
        </Button>
      </div>
    )
  }
  const target = sweep.target_pct ?? 95
  const maxN = Math.max(...sweep.points.map((p) => p.count))
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="h3">
          Почему {sweep.recommended_count ?? '—'} {sweep.recommended_count ? 'роботов' : ''}: перебор флота
        </div>
        <span className="meta">
          пиковый день, одинаковый поток задач для каждого N
          {sweep.analytic_count ? ` · по формуле цикла было бы ${sweep.analytic_count}` : ''}
        </span>
      </div>
      <p className="mt-1 max-w-[900px] text-[13.5px] leading-relaxed text-ink-2">{sweep.explanation}</p>
      <div className="mt-5 flex items-end gap-3">
        {sweep.points.map((p) => {
          const rec = p.count === sweep.recommended_count
          const height = Math.max(6, (p.sla_achieved_pct / 100) * 120)
          return (
            <Hint
              key={p.count}
              content={
                <div className="space-y-0.5">
                  <div className="font-medium">{p.count} роботов</div>
                  <div>
                    SLA в среднем {formatNumber(p.sla_achieved_pct, 1)} % (худший прогон{' '}
                    {formatNumber(p.sla_min_pct ?? p.sla_achieved_pct, 1)} %)
                  </div>
                  <div>
                    загрузка {formatNumber(p.utilization * 100, 0)} %, очередь до {p.queue_max}
                  </div>
                  {p.capex_rub != null && (
                    <div>
                      CAPEX {formatRub(p.capex_rub)} · окупаемость {formatYears(p.payback_years)}
                    </div>
                  )}
                  <div className="opacity-75">{p.runs} прогонов</div>
                </div>
              }
            >
              <button
                type="button"
                disabled={!p.simulation_id}
                onClick={() => p.simulation_id && onPick(p.simulation_id)}
                className={`group flex w-[64px] flex-col items-center gap-1.5 ${p.simulation_id ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <span className={`num text-[12px] ${p.passed ? 'text-ok' : 'text-crit'}`}>
                  {formatNumber(p.sla_achieved_pct, 0)} %
                </span>
                <span className="relative flex h-[124px] w-full items-end justify-center">
                  <span
                    className="absolute inset-x-0 border-t border-dashed border-ink-3"
                    style={{ bottom: `${(target / 100) * 120}px` }}
                  />
                  <motion.span
                    initial={{ height: 0 }}
                    animate={{ height }}
                    transition={{ type: 'spring', stiffness: 160, damping: 22 }}
                    className={`w-9 rounded-t-[6px] ${rec ? 'bg-ink' : p.passed ? 'bg-ok/50' : 'bg-crit/40'} ${shownCount === p.count ? 'ring-2 ring-accent ring-offset-2' : ''}`}
                  />
                </span>
                <span className={`num text-[13px] ${rec ? 'font-semibold text-ink' : 'text-ink-3'}`}>{p.count}</span>
              </button>
            </Hint>
          )
        })}
        <div className="ml-2 self-center text-[12px] leading-relaxed text-ink-3">
          <div className="flex items-center gap-1.5">
            <i className="w-4 border-t border-dashed border-ink-3" />
            цель {formatNumber(target)} %
          </div>
          <div className="mt-1">по оси — роботов, до {maxN}</div>
        </div>
      </div>
      {sweep.applied && (
        <p className="mt-4 text-[12.5px] text-ink-3">
          Число записано в сценарий: экономика на следующем шаге считается по имитации, а не по формуле.
        </p>
      )}
    </div>
  )
}

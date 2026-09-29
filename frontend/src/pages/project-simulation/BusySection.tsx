import { motion } from 'framer-motion'
import type { SimulationSummary } from '@/entities/simulation'
import { formatPct } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

const STATE_LABEL: Record<string, string> = {
  moving: 'в пути',
  loading: 'погрузка',
  unloading: 'выгрузка',
  charging: 'зарядка',
  waiting: 'ожидание в заторе',
  idle: 'простой',
  failed: 'отказ',
}
// Полезная работа — оттенки чернил, зарядка — синяя, простой — предупреждение, затор и отказ — тревога.
const STATE_COLOR: Record<string, string> = {
  moving: 'bg-ink-2',
  loading: 'bg-ink-3',
  unloading: 'bg-ink-4',
  charging: 'bg-info',
  waiting: 'bg-crit',
  idle: 'bg-warn',
  failed: 'bg-crit/60',
}

/* Чем заняты роботы за прогон — одной полосой, и где они ждут дольше всего. */
export function BusySection({ summary }: { summary: SimulationSummary }) {
  const byState = Object.entries(summary.utilization.by_state ?? {}).filter(([, v]) => (v ?? 0) > 0.001)
  const topEdges = summary.congestion?.top_edges?.slice(0, 3) ?? []
  if (!byState.length) return null
  return (
    <section className="card grid gap-6 px-6 pt-5 pb-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div>
        <h2 className="h3">Чем заняты роботы</h2>
        <p className="meta mt-0.5">Доля времени за прогон</p>
        <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-black/6">
          {byState.map(([k, v], i) => (
            <motion.div
              key={k}
              className={cn(STATE_COLOR[k] ?? 'bg-ink-4', i && 'border-l-2 border-card')}
              initial={{ width: 0 }}
              whileInView={{ width: `${(v ?? 0) * 100}%` }}
              viewport={{ once: true }}
              transition={{ type: 'spring', stiffness: 120, damping: 24, delay: i * 0.04 }}
            />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]">
          {byState.map(([k, v]) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className={cn('size-2.5 rounded-[3px]', STATE_COLOR[k] ?? 'bg-ink-4')} />
              <span className="text-ink-2">{STATE_LABEL[k] ?? k}</span>
              <span className="num font-medium">{formatPct(v ?? 0, { share: true, digits: 0 })}</span>
            </li>
          ))}
        </ul>
      </div>
      {topEdges.length > 0 && (
        <div>
          <div className="hud mb-2">Дольше всего ждут</div>
          <ul className="space-y-1.5 text-[13px]">
            {topEdges.map((e) => (
              <li key={e.edge_id} className="flex items-center gap-2">
                <span className="size-1.5 shrink-0 rounded-full bg-crit" />
                <span className="min-w-0 truncate text-ink-2">{e.name ?? e.edge_id}</span>
                <span className="num ml-auto shrink-0 font-medium">{Math.round(e.wait_s ?? 0)} с</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

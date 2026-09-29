import { motion } from 'framer-motion'
import { ArrowDown } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  usePlayback,
  type FleetSweepResult,
  type SimulationRun,
  type SimulationSummary,
  type SimulationTimeline,
} from '@/entities/simulation'
import { formatNumber, formatPct } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { KpiNumber } from '@/shared/ui/v0'
import { Hint } from './Hint'
import { clock } from './PlayerBar'

const NOW_BUCKET_S = 30

function pointAt(points: SimulationTimeline['points'], t: number) {
  let found = points[0]
  for (const p of points) {
    if (p.t_min * 60 <= t) found = p
    else break
  }
  return found
}

const slaTone = (sla: number, target: number) => (sla >= target ? 'ok' : sla >= target - 7 ? 'warn' : 'crit')
const TONE_TEXT = { ok: 'text-ink', warn: 'text-warn', crit: 'text-crit' } as const
const TONE_BAR = { ok: 'bg-ink', warn: 'bg-warn', crit: 'bg-crit' } as const

/* Колонка сцены: три ответа без прокрутки — держит ли парк срок, что происходит в момент плеера и где узкое место. */
export function StageSide({
  run,
  summary,
  timeline,
  sweepPoint,
  placeholder,
  onDetails,
}: {
  run?: SimulationRun
  summary: SimulationSummary | null
  timeline?: SimulationTimeline
  sweepPoint?: FleetSweepResult['points'][number]
  placeholder: string
  onDetails: () => void
}) {
  if (!summary || !run) {
    return (
      <aside className="flex items-center justify-center border-t border-line bg-surface-2 p-6 text-center text-[13px] text-ink-3 lg:border-t-0 lg:border-l">
        {placeholder}
      </aside>
    )
  }
  return (
    <aside className="flex flex-col border-t border-line bg-surface-2 lg:border-t-0 lg:border-l">
      <Sla run={run} summary={summary} sweepPoint={sweepPoint} />
      <Now timeline={timeline} />
      <Bottleneck summary={summary} onDetails={onDetails} />
    </aside>
  )
}

function Block({
  label,
  aside,
  children,
  className,
}: {
  label: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('border-b border-line px-5 py-4 last:border-b-0', className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="hud">{label}</span>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Sla({
  run,
  summary,
  sweepPoint,
}: {
  run: SimulationRun
  summary: SimulationSummary
  sweepPoint?: FleetSweepResult['points'][number]
}) {
  const { achieved_pct: sla, target_pct: target } = summary.sla
  const tone = slaTone(sla, target)
  return (
    <Block
      label="Задачи в срок"
      aside={
        run.purpose === 'sweep' ? (
          <Hint align="end">
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
        <span className={cn('display flex items-baseline gap-1 text-[44px] leading-none', TONE_TEXT[tone])}>
          <KpiNumber value={sla} digits={sla >= 99 ? 1 : 0} />
          <span className="text-[20px] text-ink-3">%</span>
        </span>
        <span className="meta">цель {formatNumber(target)} %</span>
      </div>
      <div className="relative mt-3 h-1.5 rounded-full bg-black/6">
        <motion.div
          className={cn('h-full rounded-full', TONE_BAR[tone])}
          initial={false}
          animate={{ width: `${Math.max(0, Math.min(100, sla))}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 24 }}
        />
        <span className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-signal" style={{ left: `${target}%` }} />
      </div>
      {summary.sla.target_value != null && (
        <p className="meta mt-2.5">
          в срок — до {formatNumber(summary.sla.target_value)} {summary.sla.target_unit ?? 'мин'} · в среднем{' '}
          {formatNumber(summary.sla.avg_lead_time_min, 1)} мин
        </p>
      )}
    </Block>
  )
}

function Now({ timeline }: { timeline?: SimulationTimeline }) {
  const bucket = usePlayback((s) => Math.floor(s.t / NOW_BUCKET_S))
  const points = timeline?.points ?? []
  const now = points.length ? pointAt(points, bucket * NOW_BUCKET_S) : undefined
  const queue = now?.queue ?? 0
  return (
    <Block label={`Сейчас · ${clock(bucket * NOW_BUCKET_S)}`}>
      <div className="grid grid-cols-3 gap-2">
        <Figure label="Готово" value={now?.done ?? 0} unit={`/ ${formatNumber(now?.demand_cum ?? 0)}`} />
        <Figure
          label="Очередь"
          value={queue}
          unit="зад."
          className={queue > 15 ? 'text-crit' : queue > 6 ? 'text-warn' : undefined}
        />
        <Figure label="Загрузка" value={(now?.utilization ?? 0) * 100} unit="%" />
      </div>
    </Block>
  )
}

function Figure({ label, value, unit, className }: { label: string; value: number; unit: string; className?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-ink-3">{label}</div>
      <div className="flex items-baseline gap-1 whitespace-nowrap">
        <KpiNumber value={value} className={cn('display text-[22px]', className)} />
        <span className="text-[11px] text-ink-3">{unit}</span>
      </div>
    </div>
  )
}

function Bottleneck({ summary, onDetails }: { summary: SimulationSummary; onDetails: () => void }) {
  const bottleneck = summary.bottleneck && summary.bottleneck.resource_kind !== 'none' ? summary.bottleneck : null
  const worst = summary.congestion?.top_edges?.[0]
  return (
    <Block
      label="Узкое место"
      aside={
        bottleneck ? (
          <Hint align="end">
            <p>{bottleneck.explanation}</p>
            {bottleneck.suggestion && <p>Что сделать: {bottleneck.suggestion}</p>}
          </Hint>
        ) : undefined
      }
      className="flex-1"
    >
      <div className="text-[15px] font-semibold">
        {bottleneck
          ? `${bottleneck.resource_name ?? bottleneck.resource_kind}${bottleneck.utilization != null ? ` · ${formatPct(bottleneck.utilization, { share: true, digits: 0 })}` : ''}`
          : 'Не найдено'}
      </div>
      {worst && (
        <p className="meta mt-1">
          дольше всего ждут: {worst.name ?? worst.edge_id} · {Math.round(worst.wait_s ?? 0)} с
        </p>
      )}
      <button
        type="button"
        onClick={onDetails}
        className="mt-3 flex items-center gap-1 text-[12.5px] font-medium text-ink-2 transition-colors hover:text-ink"
      >
        Почему столько роботов и проверки <ArrowDown size={13} />
      </button>
    </Block>
  )
}

import { motion } from 'framer-motion'
import { useMemo } from 'react'
import type { SimulationRun, SimulationTimeline, TimelinePoint } from '@/api/types'
import { formatNumber, formatPct } from '@/lib/format'
import { usePlayback } from '@/twin/playback'
import { KpiNumber } from '../KpiNumber'
import { Disclosure, Pill, type Tone } from '../ui'

const STATE_LABEL: Record<string, string> = {
  moving: 'в пути',
  loading: 'погрузка',
  unloading: 'выгрузка',
  charging: 'зарядка',
  waiting: 'ожидание в заторе',
  idle: 'простой',
  failed: 'отказ',
}

const STATE_COLOR: Record<string, string> = {
  moving: 'bg-[#287d9c]',
  loading: 'bg-ok',
  unloading: 'bg-ok/70',
  charging: 'bg-warn',
  waiting: 'bg-crit',
  idle: 'bg-ink-4',
  failed: 'bg-crit/60',
}

function pointAt(points: TimelinePoint[], t: number): TimelinePoint | undefined {
  let found: TimelinePoint | undefined
  for (const p of points) {
    if (p.t_min * 60 <= t) found = p
    else break
  }
  return found ?? points[0]
}

export function slaTone(achieved: number, target: number): Tone {
  return achieved >= target ? 'ok' : achieved >= target - 7 ? 'warn' : 'crit'
}

export function SimAside({ run, timeline }: { run: SimulationRun; timeline?: SimulationTimeline }) {
  const summary = run.summary!
  const bucket = usePlayback((s) => Math.floor(s.t / 30))
  const points = useMemo(() => timeline?.points ?? [], [timeline])
  const now = pointAt(points, bucket * 30)
  const target = summary.sla.target_pct
  const tone = slaTone(summary.sla.achieved_pct, target)
  const byState = Object.entries(summary.utilization.by_state ?? {}).filter(([, v]) => (v ?? 0) > 0.001)
  const va = summary.vs_analytic
  const bottleneck = summary.bottleneck

  return (
    <aside className="card scroll-thin flex h-[640px] flex-col overflow-y-auto">
      <div className="p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-ink-2">Задачи в срок за прогон · SLA</span>
          <span className="meta">цель {formatNumber(target)} %</span>
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span
            className={`display num text-[44px] ${tone === 'ok' ? 'text-ink' : tone === 'warn' ? 'text-warn' : 'text-crit'}`}
          >
            {formatNumber(summary.sla.achieved_pct, 1)}
          </span>
          <span className="display text-[22px] text-ink-3">%</span>
        </div>
        <div className="relative mt-2 h-2 w-full rounded-full bg-black/[0.06]">
          <motion.div
            className={`h-full rounded-full ${tone === 'ok' ? 'bg-ink' : tone === 'warn' ? 'bg-warn' : 'bg-crit'}`}
            initial={false}
            animate={{ width: `${Math.min(100, summary.sla.achieved_pct)}%` }}
          />
          <span className="absolute -top-1 h-4 w-px bg-ink-2" style={{ left: `${target}%` }} />
        </div>
        {run.purpose === 'sweep' && (
          <div className="meta mt-2">
            Показан один прогон из перебора флота; решение о числе роботов принято по среднему нескольких прогонов.
          </div>
        )}
        {summary.sla.target_value != null && (
          <div className="meta mt-2">
            в срок — не дольше {formatNumber(summary.sla.target_value)} {summary.sla.target_unit ?? 'мин'} от появления
            задачи; в среднем {formatNumber(summary.sla.avg_lead_time_min ?? 0, 1)} мин
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 divide-x divide-line border-y border-line">
        <Kpi label="Выполнено" value={now?.done ?? 0} unit={`из ${now?.demand_cum ?? 0}`} />
        <Kpi
          label="Очередь задач"
          value={now?.queue ?? 0}
          unit="шт"
          tone={(now?.queue ?? 0) > 15 ? 'crit' : (now?.queue ?? 0) > 6 ? 'warn' : 'neutral'}
        />
        <Kpi label="Загрузка парка" value={Math.round((now?.utilization ?? 0) * 100)} unit="%" />
      </div>

      {points.length > 1 && (
        <div className="px-5 pt-4">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[13px] text-ink-2">Очередь задач за прогон</span>
            <span className="meta">по событиям имитации</span>
          </div>
          <QueueChart points={points} t={bucket * 30} />
        </div>
      )}

      <div className="space-y-4 p-5">
        {bottleneck && bottleneck.resource_kind !== 'none' && (
          <section className="rounded-[12px] bg-surface-2 p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="h3">Узкое место</span>
              {bottleneck.utilization != null && (
                <Pill tone="warn">загрузка {formatPct(bottleneck.utilization, { share: true, digits: 0 })}</Pill>
              )}
            </div>
            <p className="text-[13.5px] leading-relaxed text-ink-2">{bottleneck.explanation}</p>
            {bottleneck.suggestion && (
              <p className="mt-1.5 text-[13px] text-ink-3">Что сделать: {bottleneck.suggestion}</p>
            )}
          </section>
        )}

        {va && (
          <section>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="h3">Расчёт против имитации</span>
              <Pill tone={va.verdict === 'confirmed' ? 'ok' : va.verdict === 'excess' ? 'accent' : 'warn'}>
                {va.verdict === 'confirmed' ? 'подтверждён' : va.verdict === 'excess' ? 'с запасом' : 'не хватает'}
              </Pill>
            </div>
            <p className="text-[13px] leading-relaxed text-ink-2">{va.text}</p>
          </section>
        )}

        {byState.length > 0 && (
          <Disclosure label="Чем заняты роботы">
            <div className="flex h-2 overflow-hidden rounded-full bg-black/[0.06]">
              {byState.map(([k, v]) => (
                <div key={k} className={STATE_COLOR[k] ?? 'bg-ink-4'} style={{ width: `${(v ?? 0) * 100}%` }} />
              ))}
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
              {byState.map(([k, v]) => (
                <li key={k} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <i className={`h-2 w-2 rounded-full ${STATE_COLOR[k] ?? 'bg-ink-4'}`} />
                    {STATE_LABEL[k] ?? k}
                  </span>
                  <span className="num">{formatPct(v ?? 0, { share: true, digits: 0 })}</span>
                </li>
              ))}
            </ul>
            {summary.congestion?.top_edges && summary.congestion.top_edges.length > 0 && (
              <div className="mt-3 text-[12.5px] text-ink-3">
                Больше всего ждут:{' '}
                {summary.congestion.top_edges
                  .slice(0, 3)
                  .map((e) => `${e.name} (${Math.round(e.wait_s ?? 0)} с)`)
                  .join(', ')}
              </div>
            )}
          </Disclosure>
        )}
      </div>
    </aside>
  )
}

function Kpi({ label, value, unit, tone = 'neutral' }: { label: string; value: number; unit: string; tone?: Tone }) {
  const c = tone === 'crit' ? 'text-crit' : tone === 'warn' ? 'text-warn' : 'text-ink'
  return (
    <div className="px-4 py-4">
      <div className="text-[12.5px] text-ink-3">{label}</div>
      <div className="mt-1 flex items-baseline gap-1 whitespace-nowrap">
        <KpiNumber value={value} className={`display text-[24px] ${c}`} duration={0.35} />
        <span className="text-[12px] text-ink-3">{unit}</span>
      </div>
    </div>
  )
}

function QueueChart({ points, t }: { points: TimelinePoint[]; t: number }) {
  const w = 320
  const h = 56
  const maxT = points[points.length - 1].t_min || 1
  const maxQ = Math.max(1, ...points.map((p) => p.queue))
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${(p.t_min / maxT) * w} ${h - (p.queue / maxQ) * (h - 4)}`).join('')
  const x = Math.min(w, (t / 60 / maxT) * w)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={`${d}L${w} ${h}L0 ${h}Z`} fill="#17171a" opacity={0.06} />
      <path d={d} fill="none" stroke="#17171a" strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
      <line x1={x} x2={x} y1={0} y2={h} stroke="#2f55d4" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

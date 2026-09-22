import type { SimEvent } from '../api'

/** Queue length over the simulated day, from backend simulation events. */
export function QueueSparkline({ events, mode }: { events: SimEvent[]; mode: 'normal' | 'peak' }) {
  if (!events.length) return null
  const W = 320
  const H = 64
  const tMax = Math.max(...events.map((e) => e.time))
  const qMax = Math.max(5, ...events.map((e) => e.queue))
  const pts = events.map((e) => [(e.time / tMax) * W, H - (e.queue / qMax) * (H - 8)] as const)
  const path = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const hours = mode === 'peak' ? 8 : 24
  const peakIdx = events.reduce((b, e, i) => (e.queue > events[b].queue ? i : b), 0)
  const peak = events[peakIdx]
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Очередь в течение дня">
        <path d={`${path} L${W},${H} L0,${H} Z`} fill="#2f55d4" opacity={0.08} />
        <path d={path} fill="none" stroke="#2f55d4" strokeWidth={1.4} />
        {peak.queue > 3 && (
          <g>
            <circle cx={(peak.time / tMax) * W} cy={H - (peak.queue / qMax) * (H - 8)} r={3} fill="#2f55d4" />
          </g>
        )}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-ink-4 num">
        <span>{mode === 'peak' ? 'пиковый режим · 8 ч' : '00:00'}</span>
        <span>
          максимум {Math.round(peak.queue)} паллет{mode === 'normal' ? ` в ${String(Math.floor(peak.time / 60) % hours).padStart(2, '0')}:00` : ''}
        </span>
        <span>{mode === 'peak' ? '' : '24:00'}</span>
      </div>
    </div>
  )
}

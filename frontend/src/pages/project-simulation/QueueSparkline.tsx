import type { SimulationTimeline } from '@/entities/simulation'

/* Длина очереди по таймлайну прогона: одна линия, один пик. */
export function QueueSparkline({
  points,
  cursorMin,
  height = 64,
}: {
  points: SimulationTimeline['points']
  cursorMin?: number
  height?: number
}) {
  if (!points.length) return null
  const W = 320
  const H = height
  const tMax = Math.max(...points.map((p) => p.t_min), 1)
  const qMax = Math.max(5, ...points.map((p) => p.queue))
  const pts = points.map((p) => [(p.t_min / tMax) * W, H - (p.queue / qMax) * (H - 8)] as const)
  const path = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const peak = points.reduce((best, p) => (p.queue > best.queue ? p : best), points[0])
  const hh = String(Math.floor(peak.t_min / 60)).padStart(2, '0')
  const mm = String(Math.round(peak.t_min % 60)).padStart(2, '0')
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Очередь в течение дня">
        <path d={`${path} L${W},${H} L0,${H} Z`} fill="#2f55d4" opacity={0.08} />
        <path d={path} fill="none" stroke="#2f55d4" strokeWidth={1.4} />
        {cursorMin != null && (
          <line
            x1={Math.min(W, (cursorMin / tMax) * W)}
            x2={Math.min(W, (cursorMin / tMax) * W)}
            y1={0}
            y2={H}
            stroke="#141413"
            strokeWidth={1}
            opacity={0.5}
          />
        )}
        {peak.queue > 3 && (
          <circle cx={(peak.t_min / tMax) * W} cy={H - (peak.queue / qMax) * (H - 8)} r={3} fill="#2f55d4" />
        )}
      </svg>
      <div className="num mt-1 flex justify-between text-[11px] text-ink-4">
        <span>00:00</span>
        <span>
          максимум {peak.queue} в {hh}:{mm}
        </span>
        <span>{Math.round(tMax / 60)}:00</span>
      </div>
    </div>
  )
}

/* Очередь как фон шкалы плеера: без подписей, на всю высоту; видно, где в прогоне был пик. */
export function QueueBackdrop({ points }: { points: SimulationTimeline['points'] }) {
  if (points.length < 2) return null
  const W = 1000
  const H = 100
  const tMax = Math.max(...points.map((p) => p.t_min), 1)
  const qMax = Math.max(5, ...points.map((p) => p.queue))
  const path = points
    .map(
      (p, i) => `${i === 0 ? 'M' : 'L'}${((p.t_min / tMax) * W).toFixed(1)},${(H - (p.queue / qMax) * H).toFixed(1)}`,
    )
    .join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full" aria-hidden>
      <path d={`${path} L${W},${H} L0,${H} Z`} fill="var(--info)" opacity={0.14} />
      <path
        d={path}
        fill="none"
        stroke="var(--info)"
        strokeWidth={1.5}
        opacity={0.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

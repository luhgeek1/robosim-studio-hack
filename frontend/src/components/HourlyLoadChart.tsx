import { useState } from 'react'
import { formatPct } from '@/lib/format'

const NORMAL = 'var(--color-ink-2)'
const PEAK = 'var(--color-warn)'

// One chart, one message: which hours of the day carry more than their even share of the work. Bars are the API's
// hourly profile (shares of the daily volume); the dashed line is the even share over the working hours.
export function HourlyLoadChart({ profile }: { profile: number[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 760
  const H = 300
  const padL = 44
  const padR = 16
  const padT = 24
  const padB = 30
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const hours = profile.map((share, hour) => ({ hour, pct: share * 100 }))
  const working = hours.filter((h) => h.pct > 0).length
  const average = working ? 100 / working : 0
  const isPeak = (pct: number) => pct > average * 1.001
  const peakHours = hours.filter((h) => isPeak(h.pct)).length
  const top = Math.max(average, ...hours.map((h) => h.pct)) * 1.18
  const step = top > 20 ? 10 : top > 8 ? 2 : 1
  const max = Math.max(step, Math.ceil(top / step) * step)
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step).filter(
    (_, i, all) => all.length <= 6 || i % 2 === 0,
  )
  const y = (v: number) => padT + innerH - (v / max) * innerH
  const bw = innerW / 24

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Доля суточного объёма по часам"
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--color-ink-4)" className="num">
              {v} %
            </text>
          </g>
        ))}
        {hours.map((h) => {
          const peak = isPeak(h.pct)
          const x = padL + h.hour * bw + 3
          const w = bw - 6
          const active = hover === h.hour
          return (
            <g key={h.hour} onMouseEnter={() => setHover(h.hour)} onMouseLeave={() => setHover(null)}>
              <rect x={x - 3} y={padT} width={bw} height={innerH} fill="transparent" />
              <rect
                x={x}
                y={y(h.pct)}
                width={w}
                height={Math.max(0, innerH - (y(h.pct) - padT))}
                rx={3}
                fill={peak ? PEAK : NORMAL}
                opacity={hover === null || active ? (peak ? 0.9 : 0.75) : 0.35}
                style={{ transition: 'opacity .15s' }}
              />
              {active && (
                <g>
                  <rect x={x + w / 2 - 46} y={y(h.pct) - 30} width={92} height={22} rx={6} fill="var(--color-ink)" />
                  <text x={x + w / 2} y={y(h.pct) - 15} textAnchor="middle" fontSize={11.5} fill="#fff" className="num">
                    {String(h.hour).padStart(2, '0')}:00 · {formatPct(h.pct)}
                  </text>
                </g>
              )}
              {h.hour % 3 === 0 && (
                <text
                  x={x + w / 2}
                  y={H - 10}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--color-ink-4)"
                  className="num"
                >
                  {String(h.hour).padStart(2, '0')}:00
                </text>
              )}
            </g>
          )
        })}
        {average > 0 && (
          <>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(average)}
              y2={y(average)}
              stroke="var(--color-ink)"
              strokeWidth={1.2}
              strokeDasharray="4 4"
            />
            <text
              x={W - padR}
              y={y(average) - 6}
              textAnchor="end"
              fontSize={11.5}
              fill="var(--color-ink)"
              fontWeight={500}
            >
              в среднем за рабочий час · {formatPct(average)}
            </text>
          </>
        )}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] text-ink-3">
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-[3px] bg-ink-2" /> обычные часы
        </span>
        {peakHours > 0 ? (
          <span className="flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-2.5 rounded-[3px] bg-warn" /> выше среднего — {peakHours} ч в сутки
          </span>
        ) : (
          <span>нагрузка распределена равномерно</span>
        )}
      </div>
    </div>
  )
}

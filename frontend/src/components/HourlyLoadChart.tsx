import { useState } from 'react'

/**
 * One chart, one message: which hours the manual process cannot keep up with.
 */
export function HourlyLoadChart({
  hourly,
  manualCapacity,
  required,
}: {
  hourly: { hour: number; value: number }[]
  manualCapacity: number
  required: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 760
  const H = 300
  const padL = 44
  const padR = 16
  const padT = 24
  const padB = 30
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const max = Math.max(140, Math.ceil((Math.max(required, ...hourly.map((h) => h.value)) * 1.12) / 20) * 20)
  const y = (v: number) => padT + innerH - (v / max) * innerH
  const bw = innerW / 24
  const over = hourly.filter((h) => h.value > manualCapacity).length
  const ticks = [0, 1, 2, 3].map((i) => Math.round((max / 4) * i))
  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Нагрузка по часам">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#ececE8" strokeWidth={1} />
            <text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#a0a0a5" className="num">
              {v}
            </text>
          </g>
        ))}
        {hourly.map((h) => {
          const overCap = h.value > manualCapacity
          const x = padL + h.hour * bw + 3
          const w = bw - 6
          const isHover = hover === h.hour
          return (
            <g key={h.hour} onMouseEnter={() => setHover(h.hour)} onMouseLeave={() => setHover(null)}>
              <rect x={x - 3} y={padT} width={bw} height={innerH} fill="transparent" />
              <rect
                x={x}
                y={y(h.value)}
                width={w}
                height={innerH - (y(h.value) - padT)}
                rx={3}
                fill={overCap ? '#d18a1f' : '#2a2a2f'}
                opacity={hover === null || isHover ? (overCap ? 0.9 : 0.75) : 0.35}
                style={{ transition: 'opacity .15s' }}
              />
              {overCap && (
                <rect
                  x={x}
                  y={y(h.value)}
                  width={w}
                  height={Math.max(0, y(manualCapacity) - y(h.value))}
                  rx={3}
                  fill="#d18a1f"
                />
              )}
              {isHover && (
                <g>
                  <rect x={x + w / 2 - 34} y={y(h.value) - 30} width={68} height={22} rx={6} fill="#17171a" />
                  <text
                    x={x + w / 2}
                    y={y(h.value) - 15}
                    textAnchor="middle"
                    fontSize={11.5}
                    fill="#fff"
                    className="num"
                  >
                    {Math.round(h.value)} паллет/ч
                  </text>
                </g>
              )}
              {h.hour % 3 === 0 && (
                <text x={x + w / 2} y={H - 10} textAnchor="middle" fontSize={11} fill="#a0a0a5" className="num">
                  {String(h.hour).padStart(2, '0')}:00
                </text>
              )}
            </g>
          )
        })}
        <line
          x1={padL}
          x2={W - padR}
          y1={y(manualCapacity)}
          y2={y(manualCapacity)}
          stroke="#17171a"
          strokeWidth={1.2}
          strokeDasharray="4 4"
        />
        <text x={W - padR} y={y(manualCapacity) - 6} textAnchor="end" fontSize={11.5} fill="#17171a" fontWeight={500}>
          ручная мощность · {Math.round(manualCapacity)} паллет/ч
        </text>
        <line
          x1={padL}
          x2={W - padR}
          y1={y(required)}
          y2={y(required)}
          stroke="#2f55d4"
          strokeWidth={1.2}
          strokeDasharray="4 4"
          opacity={0.8}
        />
        <text x={W - padR} y={y(required) - 6} textAnchor="end" fontSize={11.5} fill="#2f55d4" fontWeight={500}>
          пиковая · {Math.round(required)} паллет/ч
        </text>
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] text-ink-3">
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[#2a2a2f]" /> справляемся
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-[3px] bg-warn" /> выше ручной мощности — {over} ч в сутки
        </span>
      </div>
    </div>
  )
}

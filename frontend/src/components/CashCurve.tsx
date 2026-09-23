import { useMemo, useState } from 'react'
import { pluralRu } from '@/lib/format'

// points[i] — cumulative position against "as is" at the end of month i + 1, млн ₽.
export type Curve = { id: string; label: string; points: number[]; color: string; dashed?: boolean }

const STEPS = [1, 2, 5]

function niceStep(range: number, target = 6) {
  const raw = range / target
  const magnitude = 10 ** Math.floor(Math.log10(raw || 1))
  const step = STEPS.map((s) => s * magnitude).find((s) => s >= raw)
  return step ?? 10 * magnitude
}

const oneDecimal = (v: number) => v.toLocaleString('ru-RU', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

/**
 * Cumulative net position against "as is" over the horizon, month by month.
 * Zero line = doing nothing. The crossing point is the payback.
 */
export function CashCurve({
  curves,
  payback,
  paybackLabel,
}: {
  curves: Curve[]
  payback: number | null
  paybackLabel: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 860
  const H = 320
  const padL = 46
  const padR = 20
  const padT = 20
  const padB = 30
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const months = Math.max(12, ...curves.map((c) => c.points.length))
  const years = Math.ceil(months / 12)
  const all = curves.flatMap((c) => c.points)
  const step = niceStep(Math.max(0, ...all) - Math.min(0, ...all))
  const yMax = Math.ceil(Math.max(step / 2, ...all) / step) * step
  const yMin = Math.floor(Math.min(-step / 2, ...all) / step) * step
  const x = (m: number) => padL + (m / months) * innerW
  const y = (v: number) => padT + innerH - ((v - yMin) / (yMax - yMin)) * innerH
  const path = (pts: number[]) =>
    pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const ticks = useMemo(() => {
    const out: number[] = []
    for (let v = yMin; v <= yMax + step / 2; v += step) out.push(Math.round(v / step) * step)
    return out
  }, [yMin, yMax, step])
  const paybackX = payback !== null ? x(payback * 12) : null
  const labelW = paybackLabel.length * 6.9 + 20
  const labelLeft = paybackX !== null && paybackX + 10 + labelW > W - padR
  const tipW = 230
  const valueAt = (c: Curve, m: number) => c.points[Math.min(c.points.length, Math.max(1, m)) - 1]
  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Накопленный эффект по сценариям"
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const px = ((e.clientX - rect.left) / rect.width) * W
          const m = Math.round(((px - padL) / innerW) * months)
          setHover(m < 1 || m > months ? null : m)
        }}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(v)}
              y2={y(v)}
              stroke={v === 0 ? '#9a9aa0' : '#ececE8'}
              strokeWidth={v === 0 ? 1.2 : 1}
            />
            <text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#a0a0a5" className="num">
              {v > 0 ? `+${v}` : v}
            </text>
          </g>
        ))}
        {Array.from({ length: years + 1 }, (_, yr) => (
          <text
            key={yr}
            x={x(yr * 12)}
            y={H - 10}
            textAnchor={yr === 0 ? 'start' : yr === years ? 'end' : 'middle'}
            fontSize={11}
            fill="#a0a0a5"
            className="num"
          >
            {yr === 0 ? 'старт' : `${yr} ${pluralRu(yr, ['год', 'года', 'лет'])}`}
          </text>
        ))}
        {curves[0] && (
          <path
            d={`${path(curves[0].points)} L${x(curves[0].points.length)},${y(0)} L${x(1)},${y(0)} Z`}
            fill={curves[0].color}
            opacity={0.06}
          />
        )}
        {curves.map((c) => (
          <path
            key={c.id}
            d={path(c.points)}
            fill="none"
            stroke={c.color}
            strokeWidth={c.dashed ? 1.6 : 2.2}
            strokeDasharray={c.dashed ? '5 4' : undefined}
            strokeLinejoin="round"
          />
        ))}
        {paybackX !== null && payback !== null && payback * 12 <= months && (
          <g>
            <line
              x1={paybackX}
              x2={paybackX}
              y1={padT}
              y2={y(0)}
              stroke="#17171a"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
            <circle cx={paybackX} cy={y(0)} r={5} fill="#fff" stroke="#17171a" strokeWidth={2} />
            <rect
              x={labelLeft ? paybackX - 10 - labelW : paybackX + 10}
              y={padT + 2}
              width={labelW}
              height={24}
              rx={7}
              fill="#17171a"
            />
            <text
              x={labelLeft ? paybackX - labelW : paybackX + 20}
              y={padT + 18.5}
              fontSize={12}
              fill="#fff"
              fontWeight={500}
            >
              {paybackLabel}
            </text>
          </g>
        )}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} stroke="#c9c9c4" strokeWidth={1} />
            {curves.map((c) => (
              <circle
                key={c.id}
                cx={x(hover)}
                cy={y(valueAt(c, hover))}
                r={4}
                fill={c.color}
                stroke="#fff"
                strokeWidth={1.5}
              />
            ))}
            <g transform={`translate(${Math.min(x(hover) + 12, W - padR - tipW - 10)}, ${padT + 36})`}>
              <rect width={tipW} height={16 + curves.length * 18} rx={8} fill="#fff" stroke="#e7e7e3" />
              <text x={10} y={14} fontSize={11} fill="#7b7b82" className="num">
                месяц {hover}
              </text>
              {curves.map((c, i) => {
                const v = valueAt(c, hover)
                return (
                  <g key={c.id} transform={`translate(10, ${30 + i * 18})`}>
                    <circle cx={4} cy={-3} r={3.5} fill={c.color} />
                    <text x={14} y={0} fontSize={11.5} fill="#17171a">
                      {c.label}
                    </text>
                    <text
                      x={tipW - 20}
                      y={0}
                      fontSize={11.5}
                      textAnchor="end"
                      fill="#17171a"
                      fontWeight={500}
                      className="num"
                    >
                      {v >= 0 ? '+' : ''}
                      {oneDecimal(v)}
                    </text>
                  </g>
                )
              })}
            </g>
          </g>
        )}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] text-ink-3">
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-[2px] w-4 bg-[#9a9aa0]" /> как сейчас — точка отсчёта
        </span>
        {curves.map((c) => (
          <span key={c.id} className="flex items-center gap-1.5">
            <i className="inline-block h-[2px] w-4" style={{ background: c.color, opacity: c.dashed ? 0.7 : 1 }} />{' '}
            {c.label}
          </span>
        ))}
        <span className="ml-auto">млн ₽, накопленный эффект относительно текущего процесса</span>
      </div>
    </div>
  )
}

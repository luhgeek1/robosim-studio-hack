import { useMemo, useState } from 'react'

export type Curve = { id: string; label: string; points: number[]; color: string; dashed?: boolean }

/**
 * Cumulative net position against "as is" over 60 months.
 * Zero line = doing nothing. The crossing point is the payback.
 */
export function CashCurve({ curves, payback, paybackLabel }: { curves: Curve[]; payback: number | null; paybackLabel: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 860
  const H = 320
  const padL = 46
  const padR = 20
  const padT = 20
  const padB = 30
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const all = curves.flatMap((c) => c.points)
  const min = Math.min(-2, ...all)
  const max = Math.max(5, ...all)
  const nice = (v: number) => Math.ceil(v / 10) * 10
  const yMax = nice(max)
  const yMin = -nice(-min)
  const x = (m: number) => padL + (m / 60) * innerW
  const y = (v: number) => padT + innerH - ((v - yMin) / (yMax - yMin)) * innerH
  const path = (pts: number[]) => pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const ticks = useMemo(() => {
    const out: number[] = []
    const step = yMax - yMin > 60 ? 20 : 10
    for (let v = yMin; v <= yMax; v += step) out.push(v)
    return out
  }, [yMin, yMax])
  const hm = hover
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
          const m = Math.round(((px - padL) / innerW) * 60)
          setHover(m < 0 || m > 60 ? null : m)
        }}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#9a9aa0' : '#ececE8'} strokeWidth={v === 0 ? 1.2 : 1} />
            <text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#a0a0a5" className="num">
              {v > 0 ? `+${v}` : v}
            </text>
          </g>
        ))}
        {[0, 1, 2, 3, 4, 5].map((yr) => (
          <text key={yr} x={x(yr * 12)} y={H - 10} textAnchor={yr === 0 ? 'start' : 'middle'} fontSize={11} fill="#a0a0a5" className="num">
            {yr === 0 ? 'старт' : `${yr} год`}
          </text>
        ))}
        {/* negative area shading for the first curve */}
        {curves[0] && (
          <path
            d={`${path(curves[0].points)} L${x(60)},${y(0)} L${x(0)},${y(0)} Z`}
            fill={curves[0].color}
            opacity={0.06}
          />
        )}
        {curves.map((c) => (
          <path key={c.id} d={path(c.points)} fill="none" stroke={c.color} strokeWidth={c.dashed ? 1.6 : 2.2} strokeDasharray={c.dashed ? '5 4' : undefined} strokeLinejoin="round" />
        ))}
        {payback !== null && payback * 12 <= 60 && (
          <g>
            <line x1={x(payback * 12)} x2={x(payback * 12)} y1={padT} y2={y(0)} stroke="#17171a" strokeDasharray="3 3" strokeWidth={1} />
            <circle cx={x(payback * 12)} cy={y(0)} r={5} fill="#fff" stroke="#17171a" strokeWidth={2} />
            <rect x={x(payback * 12) + 10} y={padT + 2} width={168} height={24} rx={7} fill="#17171a" />
            <text x={x(payback * 12) + 20} y={padT + 18.5} fontSize={12} fill="#fff" fontWeight={500}>
              {paybackLabel}
            </text>
          </g>
        )}
        {hm !== null && (
          <g>
            <line x1={x(hm)} x2={x(hm)} y1={padT} y2={padT + innerH} stroke="#c9c9c4" strokeWidth={1} />
            {curves.map((c) => (
              <circle key={c.id} cx={x(hm)} cy={y(c.points[hm])} r={4} fill={c.color} stroke="#fff" strokeWidth={1.5} />
            ))}
            <g transform={`translate(${Math.min(x(hm) + 12, W - padR - 190)}, ${padT + 36})`}>
              <rect width={180} height={16 + curves.length * 18} rx={8} fill="#fff" stroke="#e7e7e3" />
              <text x={10} y={14} fontSize={11} fill="#7b7b82" className="num">
                {hm === 0 ? 'старт' : `месяц ${hm}`}
              </text>
              {curves.map((c, i) => (
                <g key={c.id} transform={`translate(10, ${30 + i * 18})`}>
                  <circle cx={4} cy={-3} r={3.5} fill={c.color} />
                  <text x={14} y={0} fontSize={11.5} fill="#17171a">
                    {c.label}
                  </text>
                  <text x={160} y={0} fontSize={11.5} textAnchor="end" fill="#17171a" fontWeight={500} className="num">
                    {c.points[hm] >= 0 ? '+' : ''}
                    {c.points[hm].toLocaleString('ru-RU', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}
                  </text>
                </g>
              ))}
            </g>
          </g>
        )}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] text-ink-3">
        <span className="flex items-center gap-1.5"><i className="inline-block h-[2px] w-4 bg-[#9a9aa0]" /> как сейчас — точка отсчёта</span>
        {curves.map((c) => (
          <span key={c.id} className="flex items-center gap-1.5">
            <i className="inline-block h-[2px] w-4" style={{ background: c.color, opacity: c.dashed ? 0.7 : 1 }} /> {c.label}
          </span>
        ))}
        <span className="ml-auto">млн ₽, накопленный эффект относительно текущего процесса</span>
      </div>
    </div>
  )
}

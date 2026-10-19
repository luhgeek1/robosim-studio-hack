import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import type { SensitivityResult } from '@/shared/api/types'
import { formatPct, isNum } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { COMPACT_UNIT, METRIC, formatCompact, type Metric } from './metrics'

const AXIS_FALLBACK: Record<string, string> = {
  labor_cost: 'Стоимость труда (ФОТ)',
  operations_volume: 'Объём операций',
}

type Cell = { background: string; color: string }

// A cell's colour is the site palette mixed into the card white: the stronger the mix, the further from neutral.
const mix = (token: 'ok' | 'warn' | 'crit', share: number): Cell => ({
  background: `color-mix(in oklab, var(--${token}) ${Math.round(share)}%, var(--card))`,
  color: share > 66 ? '#fff' : `color-mix(in oklab, var(--${token}) 55%, var(--foreground))`,
})
const NEUTRAL: Cell = { background: 'var(--surface-2)', color: 'var(--ink-2)' }

/* Payback follows the ТЗ 3.5.7 bands (до 3 / 3–5 / больше 5 лет) as one continuous scale: sage deepens as payback
   gets shorter than 3 years, orange grows towards 5, red past 5 or never. Money metrics: sage for gain, red for
   loss, the stronger the further from zero (TCO — from the current calculation). */
function cellOf(metric: Metric, v: number | null, base: number, spread: number): Cell {
  if (metric === 'payback_years') {
    if (!isNum(v) || v > 5) return mix('crit', 78)
    if (v < 3) return mix('ok', 22 + Math.min(1, (3 - v) / 1.5) * 63)
    return mix('warn', 18 + ((v - 3) / 2) * 67)
  }
  if (!isNum(v)) return NEUTRAL
  const delta = metric === 'tco_rub' ? base - v : v
  if (Math.abs(delta) < 1e-9 || !spread) return NEUTRAL
  return mix(delta > 0 ? 'ok' : 'crit', 18 + Math.min(1, Math.abs(delta) / spread) * 67)
}

const LEGEND: Record<Metric, { from: string; to: string; stops: string[] }> = {
  payback_years: {
    from: 'быстрее 3 лет',
    to: 'дольше 5 лет',
    stops: [
      mix('ok', 85).background,
      mix('ok', 22).background,
      mix('warn', 18).background,
      mix('warn', 85).background,
      mix('crit', 78).background,
    ],
  },
  npv_rub: {
    from: 'NPV < 0',
    to: 'NPV > 0',
    stops: [mix('crit', 85).background, NEUTRAL.background, mix('ok', 85).background],
  },
  roi_pct: {
    from: 'ROI < 0',
    to: 'ROI > 0',
    stops: [mix('crit', 85).background, NEUTRAL.background, mix('ok', 85).background],
  },
  effect_rub_year: {
    from: 'эффект < 0',
    to: 'эффект > 0',
    stops: [mix('crit', 85).background, NEUTRAL.background, mix('ok', 85).background],
  },
  tco_rub: {
    from: 'дороже текущего',
    to: 'дешевле текущего',
    stops: [mix('crit', 85).background, NEUTRAL.background, mix('ok', 85).background],
  },
}

const asPct = (v: number) => formatPct(v, { share: true, digits: 0 })
const isOne = (v: number) => Math.abs(v - 1) < 1e-9

export function Heatmap({ result, metric }: { result: SensitivityResult; metric: Metric }) {
  const hm = result.heatmap
  const xs = hm?.x_values ?? []
  const ys = hm?.y_values ?? []
  const z = hm?.z ?? []
  const viewport = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const [scrollable, setScrollable] = useState(false)

  useEffect(() => {
    const measure = () =>
      setScrollable(Boolean(viewport.current && viewport.current.scrollWidth > viewport.current.clientWidth + 1))
    const observer = new ResizeObserver(measure)
    if (viewport.current) observer.observe(viewport.current)
    if (content.current) observer.observe(content.current)
    measure()
    return () => observer.disconnect()
  }, [xs.length, ys.length])

  if (!hm || !xs.length || !ys.length) {
    return <div className="text-ink-3">Сервер не вернул сетку для этой пары параметров.</div>
  }
  const nameOf = (key?: string) =>
    result.items.find((i) => i.key === key)?.name ?? (key ? (AXIS_FALLBACK[key] ?? key) : '')
  const rows = ys.map((y, yi) => ({ y, yi })).reverse()
  const values = z.flat().filter(isNum)
  const spread = Math.max(...values.map((v) => Math.abs(metric === 'tco_rub' ? result.base_value - v : v)), 0)

  return (
    <div className="space-y-3">
      <div
        ref={viewport}
        className="scroll-thin max-w-full overflow-x-auto overscroll-x-contain pb-2"
        role={scrollable ? 'region' : undefined}
        tabIndex={scrollable ? 0 : undefined}
        aria-label={scrollable ? 'Тепловая карта с горизонтальной прокруткой' : undefined}
      >
        <div ref={content} className="flex w-max min-w-full">
          <div className="sticky left-0 z-10 flex w-8 shrink-0 items-center justify-center bg-card">
            <span className="-rotate-90 text-xs whitespace-nowrap text-ink-3">{nameOf(hm.y_key)}, % от текущего</span>
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="grid gap-0.5 [--y-axis:2.75rem] sm:[--y-axis:3.5rem]"
              style={{ gridTemplateColumns: `var(--y-axis) repeat(${xs.length}, minmax(max-content, 1fr))` }}
            >
              {rows.map(({ y, yi }) => (
                <Row key={yi} y={y}>
                  {xs.map((x, xi) => {
                    const v = z[yi]?.[xi] ?? null
                    const base = isOne(x) && isOne(y)
                    const cell = cellOf(metric, v, result.base_value, spread)
                    return (
                      <div
                        key={xi}
                        title={`${nameOf(hm.x_key)}: ${asPct(x)}; ${nameOf(hm.y_key)}: ${asPct(y)} → ${METRIC[metric].short}: ${METRIC[metric].format(v)}`}
                        style={cell}
                        className={cn(
                          'num flex h-10 min-w-11 items-center justify-center rounded-md px-1 text-[12px] font-semibold whitespace-nowrap transition-transform hover:scale-[1.04] sm:text-[13px]',
                          base && 'ring-2 ring-ink ring-offset-2 ring-offset-surface',
                        )}
                      >
                        {formatCompact(metric, v)}
                      </div>
                    )
                  })}
                </Row>
              ))}
              <div />
              {xs.map((x, xi) => (
                <div
                  key={xi}
                  className="num min-w-11 px-1 pt-1 text-center text-[10px] whitespace-nowrap text-ink-3 sm:text-xs"
                >
                  {asPct(x)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="text-center text-xs text-ink-3">{nameOf(hm.x_key)}, % от текущего</div>

      {scrollable && (
        <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
          <ArrowLeftRight size={13} aria-hidden="true" /> Листайте карту вбок
        </p>
      )}

      <div className="meta flex flex-wrap items-center gap-3">
        <span>
          В ячейках — {METRIC[metric].short}, {COMPACT_UNIT[metric]}
          {metric === 'payback_years' && ' (∞ — не окупается в горизонте)'}.
        </span>
        <span className="grid w-full grid-cols-2 gap-x-3 gap-y-1 sm:flex sm:w-auto sm:items-center sm:gap-2">
          <span>{LEGEND[metric].from}</span>
          <span
            className="col-span-2 row-start-2 inline-block h-2.5 w-full rounded-full sm:w-28"
            style={{ background: `linear-gradient(90deg, ${LEGEND[metric].stops.join(', ')})` }}
          />
          <span className="col-start-2 row-start-1 text-right sm:text-left">{LEGEND[metric].to}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-3 rounded-[4px] ring-2 ring-ink" />
          текущие значения
        </span>
      </div>
    </div>
  )
}

function Row({ y, children }: { y: number; children: ReactNode }) {
  return (
    <>
      <div className="num sticky left-8 z-10 flex items-center justify-end bg-card pr-1.5 text-[11px] whitespace-nowrap text-ink-3 sm:pr-2 sm:text-xs">
        {asPct(y)}
      </div>
      {children}
    </>
  )
}

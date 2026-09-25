import type { ReactNode } from 'react'
import type { SensitivityResult } from '@/shared/api/types'
import { formatPct, isNum } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { TONE_CLASS, type Tone } from '@/shared/ui/tone-classes'
import { COMPACT_UNIT, METRIC, formatCompact, type Metric } from './metrics'

const AXIS_FALLBACK: Record<string, string> = {
  labor_cost: 'Стоимость труда (ФОТ)',
  operations_volume: 'Объём операций',
}

const LEGEND: Record<Metric, { tone: Tone; text: string }[]> = {
  payback_years: [
    { tone: 'ok', text: 'до 3 лет' },
    { tone: 'warn', text: '3–5 лет' },
    { tone: 'crit', text: 'больше 5 лет или не окупается' },
  ],
  npv_rub: [
    { tone: 'ok', text: 'NPV > 0' },
    { tone: 'crit', text: 'NPV < 0' },
  ],
  roi_pct: [
    { tone: 'ok', text: 'ROI > 0' },
    { tone: 'crit', text: 'ROI < 0' },
  ],
  effect_rub_year: [
    { tone: 'ok', text: 'эффект > 0' },
    { tone: 'crit', text: 'эффект < 0' },
  ],
  tco_rub: [
    { tone: 'ok', text: 'ниже текущего расчёта' },
    { tone: 'crit', text: 'выше текущего расчёта' },
  ],
}

// Payback bands follow ТЗ 3.5.7 (до 3 / 3–5 / больше 5 лет); money metrics are coloured by sign.
function toneOf(metric: Metric, v: number | null, base: number): Tone {
  if (metric === 'payback_years') {
    if (!isNum(v) || v > 5) return 'crit'
    return v < 3 ? 'ok' : 'warn'
  }
  if (!isNum(v)) return 'muted'
  if (metric === 'tco_rub') return v < base ? 'ok' : v > base ? 'crit' : 'muted'
  return v > 0 ? 'ok' : v < 0 ? 'crit' : 'muted'
}

const asPct = (v: number) => formatPct(v, { share: true, digits: 0 })
const isOne = (v: number) => Math.abs(v - 1) < 1e-9

export function Heatmap({ result, metric }: { result: SensitivityResult; metric: Metric }) {
  const hm = result.heatmap
  const xs = hm?.x_values ?? []
  const ys = hm?.y_values ?? []
  const z = hm?.z ?? []
  if (!hm || !xs.length || !ys.length) {
    return <div className="text-ink-3">Сервер не вернул сетку для этой пары параметров.</div>
  }
  const nameOf = (key?: string) =>
    result.items.find((i) => i.key === key)?.name ?? (key ? (AXIS_FALLBACK[key] ?? key) : '')
  const rows = ys.map((y, yi) => ({ y, yi })).reverse()

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="flex w-6 shrink-0 items-center justify-center">
          <span className="-rotate-90 text-xs whitespace-nowrap text-ink-3">{nameOf(hm.y_key)}, % от текущего</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="grid gap-0.5" style={{ gridTemplateColumns: `3.5rem repeat(${xs.length}, minmax(0, 1fr))` }}>
            {rows.map(({ y, yi }) => (
              <Row key={yi} y={y}>
                {xs.map((x, xi) => {
                  const v = z[yi]?.[xi] ?? null
                  const base = isOne(x) && isOne(y)
                  return (
                    <div
                      key={xi}
                      title={`${nameOf(hm.x_key)}: ${asPct(x)}; ${nameOf(hm.y_key)}: ${asPct(y)} → ${METRIC[metric].short}: ${METRIC[metric].format(v)}`}
                      className={cn(
                        'num flex h-10 items-center justify-center rounded-md text-[13px] font-medium',
                        TONE_CLASS[toneOf(metric, v, result.base_value)],
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
              <div key={xi} className="num pt-1 text-center text-xs text-ink-3">
                {asPct(x)}
              </div>
            ))}
          </div>
          <div className="mt-1 pl-14 text-center text-xs text-ink-3">{nameOf(hm.x_key)}, % от текущего</div>
        </div>
      </div>

      <div className="meta flex flex-wrap items-center gap-3">
        <span>
          В ячейках — {METRIC[metric].short}, {COMPACT_UNIT[metric]}
          {metric === 'payback_years' && ' (∞ — не окупается в горизонте)'}.
        </span>
        {LEGEND[metric].map((l) => (
          <span key={l.text} className="flex items-center gap-1">
            <span className={cn('inline-block size-3 rounded-[4px]', TONE_CLASS[l.tone])} />
            {l.text}
          </span>
        ))}
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
      <div className="num flex items-center justify-end pr-2 text-xs text-ink-3">{asPct(y)}</div>
      {children}
    </>
  )
}

import { useState } from 'react'
import { useMonteCarlo, useSensitivity } from '@/api/scenarios'
import type { MonteCarloResult, SensitivityResult } from '@/api/types'
import { formatNumber, formatPct, formatYears, isNum } from '@/lib/format'
import { SCENARIO_KIND_LABEL } from '@/lib/labels'
import { SourceDot } from '../Provenance'
import { ErrorState, Skeleton } from '../States'
import { Segmented } from '../ui'
import { MC_REQUEST, SENSITIVITY_REQUEST, type ComparisonScenario } from './model'

const TORNADO_ROWS = 5

// ТЗ 3.5.6: sensitivity to at least three parameters for every robotization scenario — one scenario at a time.
export function Robustness({ scenarios, defaultId }: { scenarios: ComparisonScenario[]; defaultId: string | null }) {
  const [picked, setPicked] = useState<string | null>(null)
  const current =
    scenarios.find((s) => s.scenario_id === picked) ??
    scenarios.find((s) => s.scenario_id === defaultId) ??
    scenarios[0]
  if (!current) return null
  return (
    <div className="card p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[640px] text-[13.5px] leading-relaxed text-ink-2">
          Что сильнее всего сдвигает окупаемость и какова вероятность уложиться в срок, если допущения окажутся
          неточными.
        </p>
        {scenarios.length > 1 && (
          <Segmented
            size="sm"
            layoutId="robustness-scenario"
            value={current.scenario_id}
            onChange={setPicked}
            options={scenarios.map((s) => ({ value: s.scenario_id, label: SCENARIO_KIND_LABEL[s.kind], hint: s.name }))}
          />
        )}
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr_1fr]">
        <TornadoBlock scenarioId={current.scenario_id} />
        <MonteCarloBlock scenarioId={current.scenario_id} />
      </div>
    </div>
  )
}

function TornadoBlock({ scenarioId }: { scenarioId: string }) {
  const sensitivity = useSensitivity(scenarioId, SENSITIVITY_REQUEST)
  const [all, setAll] = useState(false)
  return (
    <section>
      <div className="h3 mb-1">Что двигает окупаемость</div>
      <p className="meta mb-4">
        Каждый параметр по очереди — к нижней и верхней границе диапазона, остальные как в расчёте.
      </p>
      {sensitivity.isPending && <Skeleton className="h-[220px]" />}
      {sensitivity.isError && <ErrorState error={sensitivity.error} onRetry={() => sensitivity.refetch()} />}
      {sensitivity.data && (
        <>
          <Tornado result={sensitivity.data} limit={all ? undefined : TORNADO_ROWS} />
          {sensitivity.data.items.length > TORNADO_ROWS && (
            <button
              type="button"
              onClick={() => setAll((v) => !v)}
              className="mt-2 text-[13px] font-medium text-accent hover:underline"
            >
              {all ? 'Показать главные' : `Ещё ${sensitivity.data.items.length - TORNADO_ROWS} параметров`}
            </button>
          )}
        </>
      )}
    </section>
  )
}

type Item = SensitivityResult['items'][number]

function rangeText(item: Item): string {
  const base = item.base_input
  const relative = item.kind === 'group' || item.kind === 'catalog' || (!item.unit && base === 1)
  if (relative && isNum(base) && base !== 0) {
    const pct = (v: number) => {
      const delta = Math.round((v / base - 1) * 100)
      return `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta)} %`
    }
    return `${pct(item.low_input)} … ${pct(item.high_input)}`
  }
  return `${formatNumber(item.low_input)} … ${formatNumber(item.high_input)}${item.unit ? ` ${item.unit}` : ''}`
}

// Payback: shorter is better, so the part of the bar left of the base reads green and the right part amber.
function Tornado({ result, limit }: { result: SensitivityResult; limit?: number }) {
  const items = [...result.items].sort((a, b) => a.rank - b.rank).slice(0, limit)
  const values = [result.base_value, ...items.flatMap((i) => [i.metric_at_low, i.metric_at_high])].filter(isNum)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const hasNull = items.some((i) => i.metric_at_low === null || i.metric_at_high === null)
  const edge = hasNull ? hi + (hi - lo || 1) * 0.2 : hi
  const pad = (edge - lo || 1) * 0.08
  const pos = (v: number | null) => (((isNum(v) ? v : edge) - (lo - pad)) / (edge + pad - (lo - pad))) * 100
  const base = pos(result.base_value)
  const label = (v: number | null) => (isNum(v) ? formatNumber(v, 1) : 'не окупается')

  return (
    <div>
      <div className="grid grid-cols-[minmax(0,210px)_1fr] gap-x-4">
        <div />
        <div className="relative mb-1 h-5">
          <span
            className="num absolute -translate-x-1/2 rounded-[6px] bg-ink px-1.5 text-[11.5px] whitespace-nowrap text-white"
            style={{ left: `${base}%` }}
          >
            база {formatYears(result.base_value)}
          </span>
        </div>
        {items.map((item) => {
          const values = [item.metric_at_low, item.metric_at_high]
          const ends = values.map(pos)
          const left = Math.min(...ends)
          const right = Math.max(...ends)
          const minValue = values[ends.indexOf(left)]
          const maxValue = values[ends.indexOf(right)]
          return (
            <div key={item.key} className="contents">
              <div className="min-w-0 border-t border-line py-2">
                <div className="flex items-center gap-1.5 text-[13px] leading-snug text-ink">
                  <span className="line-clamp-2" title={item.name}>
                    {item.name}
                  </span>
                  <SourceDot status={item.provenance_status} />
                </div>
                <div className="num text-[11.5px] text-ink-4">{rangeText(item)}</div>
              </div>
              <div className="relative border-t border-line">
                <div className="absolute inset-y-0 w-px bg-ink/60" style={{ left: `${base}%` }} />
                <div
                  className="absolute top-1/2 h-3 -translate-y-1/2"
                  style={{ left: `${left}%`, width: `${Math.max(0, base - left)}%` }}
                >
                  <div className="h-full rounded-l-[4px] bg-ok/70" />
                </div>
                <div
                  className="absolute top-1/2 h-3 -translate-y-1/2"
                  style={{ left: `${base}%`, width: `${Math.max(0, right - base)}%` }}
                >
                  <div className={`h-full rounded-r-[4px] bg-warn/70 ${maxValue === null ? 'opacity-50' : ''}`} />
                </div>
                <span
                  className="num absolute top-1/2 -translate-y-1/2 pr-1 text-[11px] text-ink-3"
                  style={{ right: `${100 - left}%` }}
                >
                  {label(minValue)}
                </span>
                <span
                  className="num absolute top-1/2 -translate-y-1/2 pl-1 text-[11px] whitespace-nowrap text-ink-3"
                  style={{ left: `${right}%` }}
                >
                  {label(maxValue)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-4 rounded-[3px] bg-ok/70" /> окупится быстрее
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-4 rounded-[3px] bg-warn/70" /> дольше
        </span>
        <span>годы окупаемости</span>
      </div>
    </div>
  )
}

const PROBABILITY_LABEL: [string, string][] = [
  ['payback_le_3y', 'окупится быстрее 3 лет'],
  ['payback_le_5y', 'окупится быстрее 5 лет'],
  ['npv_positive', 'NPV будет положительным'],
]

const METHOD_LABEL: Record<MonteCarloResult['method'], string> = {
  analytic: 'аналитический метод',
  surrogate: 'метамодель по имитации',
  des: 'дискретно-событийная имитация',
}

function MonteCarloBlock({ scenarioId }: { scenarioId: string }) {
  const mc = useMonteCarlo(scenarioId, MC_REQUEST)
  return (
    <section>
      <div className="h3 mb-1">Вероятность уложиться в срок</div>
      <p className="meta mb-4">
        {formatNumber(MC_REQUEST.n)} случайных сочетаний ключевых параметров в их диапазонах (Монте-Карло).
      </p>
      {mc.isPending && <Skeleton className="h-[220px]" />}
      {mc.isError && <ErrorState error={mc.error} onRetry={() => mc.refetch()} />}
      {mc.data && <MonteCarloSummary result={mc.data} />}
    </section>
  )
}

export function MonteCarloSummary({ result, compact = false }: { result: MonteCarloResult; compact?: boolean }) {
  const probability = result.probability ?? {}
  return (
    <div>
      <div className={`grid grid-cols-3 ${compact ? 'gap-3' : 'gap-4'}`}>
        {PROBABILITY_LABEL.filter(([key]) => isNum(probability[key])).map(([key, label]) => (
          <div key={key}>
            <div className={`display num ${compact ? 'text-[22px]' : 'text-[30px]'}`}>
              {formatPct(probability[key], { share: true, digits: 0 })}
            </div>
            <div className="meta mt-1 leading-snug">{label}</div>
          </div>
        ))}
      </div>
      <div className="hairline mt-4 grid grid-cols-3 gap-4 pt-3">
        {(
          [
            ['P10', result.p10, 'оптимистично'],
            ['P50', result.p50, 'медиана'],
            ['P90', result.p90, 'осторожно'],
          ] as const
        ).map(([key, value, hint]) => (
          <div key={key}>
            <div className="meta">{key}</div>
            <div className="num mt-0.5 text-[15px] font-medium">{formatYears(value)}</div>
            <div className="text-[11.5px] text-ink-4">{hint}</div>
          </div>
        ))}
      </div>
      <p className="meta mt-3">
        {formatNumber(result.n)} прогонов, {METHOD_LABEL[result.method]}; распределения — треугольные по диапазонам
        датасета.
      </p>
    </div>
  )
}

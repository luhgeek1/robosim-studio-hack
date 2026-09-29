import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useMonteCarlo } from '@/entities/scenario'
import type { MonteCarloRequest, MonteCarloResult } from '@/shared/api/types'
import { formatMln, formatNumber, formatPayback } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { Segmented } from '@/shared/ui/v0'
import { MC_REQUEST, METRIC } from './metrics'

type McMetric = MonteCarloRequest['metric']

const MC_METRICS: McMetric[] = ['payback_years', 'npv_rub', 'roi_pct']

const METHOD_LABEL: Record<MonteCarloResult['method'], string> = {
  analytic: 'аналитический метод',
  surrogate: 'метамодель по имитации',
  des: 'дискретно-событийная имитация',
}

const POS_COLOR = 'var(--foreground)'
const NEG_COLOR = 'var(--ink-4)'

export function MonteCarloPanel({ scenarioId, horizon }: { scenarioId: string; horizon: number }) {
  const [metric, setMetric] = useState<McMetric>('payback_years')
  const mc = useMonteCarlo(scenarioId, { ...MC_REQUEST, metric })

  return (
    <article className="card overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-4 px-6 pt-5 pb-4">
        <div className="min-w-0">
          <h2 className="h3 text-[18px]">Разброс результата</h2>
          <p className="meta mt-1">
            {formatNumber(MC_REQUEST.n)} случайных сочетаний ключевых параметров в пределах их диапазонов
          </p>
        </div>
        <Segmented
          size="sm"
          value={metric}
          onChange={setMetric}
          options={MC_METRICS.map((m) => ({ value: m, label: METRIC[m].short, hint: METRIC[m].label }))}
        />
      </header>
      {mc.isPending && <LoadingBlock rows={3} className="px-6 pb-6" />}
      {mc.isError && (
        <div className="px-6 pb-6">
          <ErrorBlock error={mc.error} onRetry={() => mc.refetch()} />
        </div>
      )}
      {mc.data && <MonteCarloBody result={mc.data} metric={metric} horizon={horizon} />}
    </article>
  )
}

function MonteCarloBody({ result, metric, horizon }: { result: MonteCarloResult; metric: McMetric; horizon: number }) {
  const fmt =
    metric === 'payback_years' ? (v: number | null | undefined) => formatPayback(v, horizon) : METRIC[metric].format
  const lowerBetter = metric === 'payback_years'

  return (
    <div className="hairline grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="px-6 py-5">
        <dl className="grid grid-cols-3 gap-6">
          <Figure value={fmt(result.p10)} label={`P10 · ${lowerBetter ? 'удачный' : 'осторожный'} исход`} />
          <Figure value={fmt(result.p50)} label="P50 · медиана" strong />
          <Figure value={fmt(result.p90)} label={`P90 · ${lowerBetter ? 'осторожный' : 'удачный'} исход`} />
        </dl>
        <div className="mt-4">
          <Histogram result={result} metric={metric} />
        </div>
        <p className="meta mt-1">
          {formatNumber(result.n)} прогонов, {METHOD_LABEL[result.method]}; среднее — {fmt(result.mean)}
        </p>
      </div>

      <div className="border-t border-line bg-surface-2/60 px-6 py-5 lg:border-t-0 lg:border-l">
        <div className="text-[13px] text-ink-2">Что двигает результат</div>
        <p className="meta mt-1 mb-4">
          Связь параметра с показателем по прогонам: вправо — рост параметра увеличивает показатель, влево — уменьшает
        </p>
        <Drivers result={result} />
      </div>
    </div>
  )
}

function Figure({ value, label, strong }: { value: string; label: string; strong?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="mt-0.5 truncate text-[12.5px] text-ink-3">{label}</dt>
      <dd
        className={cn(
          'num leading-tight font-semibold tracking-[-0.01em]',
          strong ? 'text-[22px]' : 'text-[19px] text-ink-2',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function Histogram({ result, metric }: { result: MonteCarloResult; metric: McMetric }) {
  const { bins, counts } = result.histogram
  const money = metric === 'npv_rub'
  const tick = (v: number) => (money ? formatMln(v) : formatNumber(v, 1))
  const data = counts.map((count, i) => ({ mid: (bins[i] + bins[i + 1]) / 2, lo: bins[i], hi: bins[i + 1], count }))
  const fmt = METRIC[metric].format
  const axisUnit = { payback_years: 'лет', npv_rub: 'млн ₽', roi_pct: '%' }[metric]

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 12, left: 0, bottom: 16 }} barCategoryGap={1}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="mid"
            type="number"
            domain={[bins[0], bins[bins.length - 1]]}
            tickFormatter={tick}
            tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
            stroke="var(--border)"
            label={{
              value: axisUnit,
              position: 'insideBottomRight',
              offset: -10,
              fontSize: 12,
              fill: 'var(--muted-foreground)',
            }}
          />
          <YAxis
            allowDecimals={false}
            width={44}
            tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
            stroke="var(--border)"
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)' }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as (typeof data)[number] | undefined
              if (!active || !row) return null
              return (
                <div className="rounded-[10px] bg-ink px-3 py-2 text-[12px] text-white shadow-float">
                  <div className="num font-medium">
                    {fmt(row.lo)} — {fmt(row.hi)}
                  </div>
                  <div className="num text-white/70">прогонов: {formatNumber(row.count)}</div>
                </div>
              )
            }}
          />
          <Bar dataKey="count" fill="var(--ink-4)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          {(['p10', 'p50', 'p90'] as const).map((k) => (
            <ReferenceLine
              key={k}
              x={result[k]}
              stroke="var(--foreground)"
              strokeDasharray={k === 'p50' ? undefined : '4 3'}
              label={{ value: k.toUpperCase(), position: 'top', fontSize: 11, fill: 'var(--foreground)' }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function Drivers({ result }: { result: MonteCarloResult }) {
  const drivers = result.top_drivers ?? []
  if (!drivers.length) return <div className="meta">Сервер не вернул факторы.</div>
  return (
    <ul className="space-y-2.5">
      {drivers.map((d, i) => {
        const c = d.correlation ?? 0
        const width = Math.min(Math.abs(c), 1) * 50
        return (
          <li key={d.key ?? i} className="grid grid-cols-[minmax(0,1fr)_6rem_2.5rem] items-center gap-3">
            <span className="truncate text-[13px] text-ink-2" title={d.name}>
              {d.name ?? d.key}
            </span>
            <span className="relative h-1.5 rounded-full bg-black/5">
              <span className="absolute -inset-y-1 left-1/2 w-px bg-ink-4" />
              <span
                className="absolute inset-y-0"
                style={{
                  left: c >= 0 ? '50%' : `${50 - width}%`,
                  width: `${width}%`,
                  background: c >= 0 ? POS_COLOR : NEG_COLOR,
                  borderRadius: c >= 0 ? '0 999px 999px 0' : '999px 0 0 999px',
                }}
              />
            </span>
            <span className="num text-right text-[12px] text-ink-3">
              {c > 0 ? '+' : c < 0 ? '−' : ''}
              {formatNumber(Math.abs(c), 2)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

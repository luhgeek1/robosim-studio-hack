import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useMonteCarlo } from '@/entities/scenario'
import type { MonteCarloRequest, MonteCarloResult } from '@/shared/api/types'
import { formatMln, formatNumber, formatPct } from '@/shared/lib/format'
import { Section, Stat, StatStrip } from '@/shared/ui/page'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group'
import { METRIC } from './metrics'

type McMetric = MonteCarloRequest['metric']

const MC_METRICS: McMetric[] = ['payback_years', 'npv_rub', 'roi_pct']
const RUNS = 2000

const PROBABILITY_LABEL: Record<string, string> = {
  payback_le_3y: 'окупится быстрее 3 лет',
  payback_le_5y: 'окупится быстрее 5 лет',
  npv_positive: 'NPV будет положительным',
}

const METHOD_LABEL: Record<MonteCarloResult['method'], string> = {
  analytic: 'аналитический метод',
  surrogate: 'метамодель по имитации',
  des: 'дискретно-событийная имитация',
}

const POS_COLOR = 'var(--chart-3)'
const NEG_COLOR = 'var(--chart-1)'

export function MonteCarloPanel({ scenarioId }: { scenarioId: string }) {
  const [metric, setMetric] = useState<McMetric>('payback_years')
  const mc = useMonteCarlo(scenarioId, { n: RUNS, metric, method: 'analytic' })

  return (
    <Section
      title="Монте-Карло: разброс результата"
      description={`${formatNumber(RUNS)} случайных сочетаний ключевых параметров в их диапазонах`}
      actions={
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={metric}
          onValueChange={(v) => v && setMetric(v as McMetric)}
        >
          {MC_METRICS.map((m) => (
            <ToggleGroupItem key={m} value={m}>
              {METRIC[m].label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      }
    >
      {mc.isPending && <LoadingBlock rows={3} />}
      {mc.isError && <ErrorBlock error={mc.error} onRetry={() => mc.refetch()} />}
      {mc.data && <MonteCarloBody result={mc.data} metric={metric} />}
    </Section>
  )
}

function MonteCarloBody({ result, metric }: { result: MonteCarloResult; metric: McMetric }) {
  const fmt = METRIC[metric].format
  const probabilities = Object.entries(result.probability ?? {})
  const lowerBetter = metric === 'payback_years'

  return (
    <div className="space-y-5">
      {probabilities.length > 0 && (
        <div className="grid grid-cols-3 gap-6">
          {probabilities.map(([key, p]) => (
            <div key={key} className="border-l-2 border-l-primary pl-4">
              <div className="num text-3xl leading-none font-semibold tracking-tight">
                {formatPct(p, { share: true, digits: 0 })}
              </div>
              <div className="mt-1.5 text-muted-foreground">вероятность, что {PROBABILITY_LABEL[key] ?? key}</div>
            </div>
          ))}
        </div>
      )}

      <StatStrip columns={4}>
        <Stat
          label={`P10 — ${lowerBetter ? 'оптимистично' : 'осторожно'}`}
          value={fmt(result.p10)}
          hint="10 % прогонов ниже"
        />
        <Stat label="P50 — медиана" value={fmt(result.p50)} hint="половина прогонов ниже" />
        <Stat
          label={`P90 — ${lowerBetter ? 'осторожно' : 'оптимистично'}`}
          value={fmt(result.p90)}
          hint="10 % прогонов выше"
        />
        <Stat
          label="Среднее"
          value={fmt(result.mean)}
          hint={`${formatNumber(result.n)} прогонов, ${METHOD_LABEL[result.method]}`}
        />
      </StatStrip>

      <div className="grid grid-cols-[1.4fr_1fr] gap-6">
        <div>
          <div className="mb-2 text-sm font-medium">Распределение: {METRIC[metric].label}</div>
          <Histogram result={result} metric={metric} />
        </div>
        <div>
          <div className="mb-1 text-sm font-medium">Что сильнее всего двигает результат</div>
          <p className="mb-3 text-xs text-muted-foreground">
            Корреляция параметра с результатом по прогонам: справа — рост параметра увеличивает показатель, слева —
            уменьшает.
          </p>
          <Drivers result={result} />
        </div>
      </div>
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
    <div className="h-64">
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
                <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                  <div className="font-medium">
                    {fmt(row.lo)} — {fmt(row.hi)}
                  </div>
                  <div className="num text-muted-foreground">прогонов: {formatNumber(row.count)}</div>
                </div>
              )
            }}
          />
          <Bar dataKey="count" fill="var(--chart-1)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
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
  if (!drivers.length) return <div className="text-muted-foreground">Сервер не вернул факторы.</div>
  return (
    <ul className="space-y-2">
      {drivers.map((d, i) => {
        const c = d.correlation ?? 0
        const width = Math.min(Math.abs(c), 1) * 50
        return (
          <li key={d.key ?? i} className="grid grid-cols-[minmax(0,1fr)_7rem_3rem] items-center gap-2">
            <span className="truncate text-sm" title={d.name}>
              {d.name ?? d.key}
            </span>
            <span className="relative h-2.5 rounded-sm bg-muted">
              <span className="absolute inset-y-0 left-1/2 w-px bg-foreground/50" />
              <span
                className="absolute inset-y-0"
                style={{
                  left: c >= 0 ? '50%' : `${50 - width}%`,
                  width: `${width}%`,
                  background: c >= 0 ? POS_COLOR : NEG_COLOR,
                  borderRadius: c >= 0 ? '0 3px 3px 0' : '3px 0 0 3px',
                }}
              />
            </span>
            <span className="num text-right text-xs">
              {c > 0 ? '+' : c < 0 ? '−' : ''}
              {formatNumber(Math.abs(c), 2)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

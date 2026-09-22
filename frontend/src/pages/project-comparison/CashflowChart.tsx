import { useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ComparisonTable } from '@/shared/api/types'
import { formatMln, formatRub } from '@/shared/lib/format'
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group'

type Mode = 'cumulative_rub' | 'discounted_cumulative_rub'
type Row = { period: number } & Record<string, number | null>

// The baseline is the reference line (neutral, dashed); robotization scenarios take categorical hues in fixed order.
const SERIES_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)']
const BASELINE_COLOR = 'var(--chart-5)'

export function CashflowChart({ table }: { table: ComparisonTable }) {
  const overlay = table.cashflow_overlay ?? {}
  const scenarios = table.scenarios.filter((s) => overlay[s.scenario_id]?.length)
  const hasDiscounted = scenarios.some((s) =>
    overlay[s.scenario_id].some(
      (p) => p.discounted_cumulative_rub !== null && p.discounted_cumulative_rub !== undefined,
    ),
  )
  const [mode, setMode] = useState<Mode>('cumulative_rub')
  const active: Mode = hasDiscounted ? mode : 'cumulative_rub'

  if (!scenarios.length) return <div className="text-muted-foreground">Денежные потоки не переданы в расчёте.</div>

  const byPeriod = new Map<number, Row>()
  for (const s of scenarios) {
    for (const p of overlay[s.scenario_id]) {
      const row = byPeriod.get(p.period) ?? { period: p.period }
      row[s.scenario_id] = p[active] ?? null
      byPeriod.set(p.period, row)
    }
  }
  const data = [...byPeriod.values()].sort((a, b) => a.period - b.period)
  const maxPeriod = data.at(-1)?.period ?? 0
  const horizon = table.scenarios[0]?.metrics.horizon_years ?? maxPeriod
  const unit = maxPeriod > horizon ? 'месяц' : 'год'

  let colorIndex = 0
  const series = scenarios.map((s) => ({
    id: s.scenario_id,
    name: s.name,
    baseline: s.kind === 'baseline',
    color: s.kind === 'baseline' ? BASELINE_COLOR : SERIES_COLORS[colorIndex++ % SERIES_COLORS.length],
  }))

  return (
    <div className="space-y-3">
      {hasDiscounted && (
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={active}
          onValueChange={(v) => v && setMode(v as Mode)}
        >
          <ToggleGroupItem value="cumulative_rub">Номинальный</ToggleGroupItem>
          <ToggleGroupItem value="discounted_cumulative_rub">Дисконтированный</ToggleGroupItem>
        </ToggleGroup>
      )}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 16 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="period"
              type="number"
              domain={['dataMin', 'dataMax']}
              allowDecimals={false}
              tickCount={Math.min(data.length, 13)}
              tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
              stroke="var(--border)"
              label={{
                value: unit === 'год' ? 'год расчёта' : 'месяц расчёта',
                position: 'insideBottom',
                offset: -10,
                fontSize: 12,
                fill: 'var(--muted-foreground)',
              }}
            />
            <YAxis
              tickFormatter={(v: number) => formatMln(v)}
              tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
              stroke="var(--border)"
              width={72}
              label={{
                value: 'млн ₽',
                angle: -90,
                position: 'insideLeft',
                fontSize: 12,
                fill: 'var(--muted-foreground)',
              }}
            />
            <ReferenceLine y={0} stroke="var(--foreground)" strokeOpacity={0.5} />
            <Tooltip
              content={({ active, payload, label }) => (
                <CashflowTooltip active={active} payload={payload} label={label} unit={unit} series={series} />
              )}
            />
            <Legend
              verticalAlign="top"
              align="right"
              height={28}
              iconType="plainline"
              wrapperStyle={{ fontSize: 12 }}
            />
            {series.map((s) => (
              <Line
                key={s.id}
                dataKey={s.id}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.baseline ? '6 4' : undefined}
                dot={{ r: 3, strokeWidth: 0, fill: s.color }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function CashflowTooltip({
  active,
  payload,
  label,
  unit,
  series,
}: {
  active?: boolean
  payload?: ReadonlyArray<{ dataKey?: unknown; value?: unknown }>
  label?: unknown
  unit: string
  series: { id: string; name: string; color: string }[]
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium">
        {unit === 'год' ? 'Год' : 'Месяц'} {String(label)}
      </div>
      {series.map((s) => {
        const item = payload.find((p) => p.dataKey === s.id)
        if (!item) return null
        return (
          <div key={s.id} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3" style={{ background: s.color }} />
              {s.name}
            </span>
            <span className="num font-medium">{formatRub(typeof item.value === 'number' ? item.value : null)}</span>
          </div>
        )
      })}
    </div>
  )
}

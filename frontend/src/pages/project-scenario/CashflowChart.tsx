import { useState, useSyncExternalStore } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { CashflowPoint } from '@/shared/api/types'
import { formatMln } from '@/shared/lib/format'
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group'

type Grain = 'yearly' | 'monthly'

const SERIES = {
  savings: 'Экономия',
  capex: 'CAPEX',
  opex: 'OPEX',
  financing: 'Платежи (кредит, лизинг, RaaS)',
  cumulative: 'Накопленный поток',
  discounted: 'Дисконтированный',
} as const

// Узкий экран (телефон): у графика меньше подписей и легенда сама выбирает высоту.
const NARROW_QUERY = '(max-width: 639px)'
function useNarrow() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(NARROW_QUERY)
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    },
    () => window.matchMedia(NARROW_QUERY).matches,
  )
}

export function CashflowChart({ yearly, monthly }: { yearly: CashflowPoint[]; monthly: CashflowPoint[] }) {
  const [grain, setGrain] = useState<Grain>('yearly')
  const narrow = useNarrow()
  const points = grain === 'yearly' ? yearly : monthly
  // Outflows are drawn below zero so the bars read as a cash-flow waterfall per period.
  const data = points.map((p) => ({
    period: p.period,
    savings: p.savings_rub / 1e6,
    capex: -p.capex_rub / 1e6,
    opex: -p.opex_rub / 1e6,
    financing: -(p.financing_rub ?? 0) / 1e6,
    cumulative: p.cumulative_rub / 1e6,
    discounted: p.discounted_cumulative_rub == null ? null : p.discounted_cumulative_rub / 1e6,
  }))
  const hasFinancing = points.some((p) => (p.financing_rub ?? 0) !== 0)

  return (
    <div className="space-y-3">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={grain}
        onValueChange={(v) => v && setGrain(v as Grain)}
      >
        <ToggleGroupItem value="yearly">По годам</ToggleGroupItem>
        <ToggleGroupItem value="monthly">По месяцам</ToggleGroupItem>
      </ToggleGroup>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} stackOffset="sign" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="period"
            tickLine={false}
            axisLine={false}
            fontSize={12}
            tickFormatter={(v: number) => (grain === 'yearly' ? `${v} г.` : String(v))}
            interval={grain === 'monthly' ? (narrow ? 11 : 5) : 0}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            fontSize={12}
            width={narrow ? 48 : 56}
            tickFormatter={(v: number) => formatMln(v * 1e6)}
            label={{
              value: 'млн ₽',
              angle: -90,
              position: 'insideLeft',
              fontSize: 11,
              fill: 'var(--muted-foreground)',
            }}
          />
          <Tooltip
            formatter={(value, name) => [
              `${formatMln(Number(value) * 1e6)} млн ₽`,
              SERIES[name as keyof typeof SERIES] ?? name,
            ]}
            labelFormatter={(label) => (grain === 'yearly' ? `Год ${label}` : `Месяц ${label}`)}
            contentStyle={{ borderRadius: 8, borderColor: 'var(--border)', fontSize: 12 }}
          />
          <Legend
            formatter={(name: string) => SERIES[name as keyof typeof SERIES] ?? name}
            wrapperStyle={{ fontSize: 12 }}
          />
          <ReferenceLine y={0} stroke="var(--foreground)" strokeOpacity={0.4} />
          <Bar dataKey="savings" stackId="flow" fill="var(--chart-2)" />
          <Bar dataKey="capex" stackId="flow" fill="var(--chart-4)" />
          <Bar dataKey="opex" stackId="flow" fill="var(--chart-3)" />
          {hasFinancing && <Bar dataKey="financing" stackId="flow" fill="var(--chart-5)" />}
          <Line dataKey="cumulative" type="monotone" stroke="var(--foreground)" strokeWidth={2} dot={false} />
          <Line
            dataKey="discounted"
            type="monotone"
            stroke="var(--foreground)"
            strokeDasharray="4 4"
            strokeWidth={1.5}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

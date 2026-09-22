import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ProcessDemand } from '@/shared/api/types'
import { formatMln, formatRub } from '@/shared/lib/format'

type Row = { name: string; cost: number }

export function LaborCostChart({ processes }: { processes: ProcessDemand[] }) {
  const data: Row[] = processes.map((p) => ({ name: p.name, cost: p.current?.cost_rub_year ?? 0 }))
  const height = Math.max(160, data.length * 44 + 40)

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis
            type="number"
            tickFormatter={(value: number) => formatMln(value)}
            tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            unit=" млн ₽"
          />
          <YAxis
            type="category"
            dataKey="name"
            width={260}
            tick={{ fontSize: 12, fill: 'var(--foreground)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)' }}
            formatter={(value) => [formatRub(Number(value)), 'ФОТ в год']}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="cost" fill="var(--chart-1)" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

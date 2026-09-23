import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ProcessDemand } from '@/shared/api/types'
import { formatMln, formatPct, formatRub } from '@/shared/lib/format'

type Row = { key: string; name: string; cost: number; share?: number }

export function LaborCostChart({ processes }: { processes: ProcessDemand[] }) {
  const data: Row[] = processes.map((p) => ({
    key: p.process_key,
    name: p.name,
    cost: p.current?.cost_rub_year ?? 0,
    share: p.share_of_labor_cost,
  }))
  const height = Math.max(160, data.length * 44 + 40)
  // Клик по столбику ведёт к карточке процесса ниже.
  const open = (row?: Row) =>
    row && document.getElementById(`process-${row.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

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
            tick={{ fontSize: 12, fill: 'var(--ink-2)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'rgba(0,0,0,0.035)' }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as Row | undefined
              if (!active || !row) return null
              return (
                <div className="rounded-[10px] bg-ink px-3 py-2 text-[12px] text-white shadow-float">
                  <div className="font-medium">{row.name}</div>
                  <div className="num text-white/80">
                    {formatRub(row.cost)} в год
                    {row.share !== undefined && ` · ${formatPct(row.share, { share: true })} ФОТ`}
                  </div>
                </div>
              )
            }}
          />
          <Bar
            dataKey="cost"
            fill="var(--warn)"
            radius={[0, 4, 4, 0]}
            barSize={18}
            isAnimationActive={false}
            cursor="pointer"
            onClick={(entry) => open(entry?.payload as Row | undefined)}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

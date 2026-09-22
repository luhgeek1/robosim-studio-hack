import { Bar, BarChart, Rectangle, ResponsiveContainer, Tooltip, XAxis, type BarShapeProps } from 'recharts'
import { formatPct } from '@/shared/lib/format'

type Row = { hour: string; share: number; aboveAverage: boolean }

// Bars above the flat 1/24 share are the hours that load the process more than an even day would.
const FLAT_SHARE = 1 / 24

function HourBar(props: BarShapeProps) {
  const row = props.payload as Row
  return <Rectangle {...props} fill={row.aboveAverage ? 'var(--chart-3)' : 'var(--chart-5)'} />
}

export function HourlyProfileChart({ profile }: { profile: number[] }) {
  const data: Row[] = profile.map((share, hour) => ({
    hour: String(hour).padStart(2, '0'),
    share,
    aboveAverage: share > FLAT_SHARE,
  }))

  return (
    <div className="h-28">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap={2}>
          <XAxis
            dataKey="hour"
            interval={2}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)' }}
            labelFormatter={(hour) => `${hour}:00–${hour}:59`}
            formatter={(value) => [formatPct(Number(value), { share: true }), 'доля суточного объёма']}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="share" shape={HourBar} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

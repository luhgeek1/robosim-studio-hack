import { useState, type ReactNode } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatNumber } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

export type Slice = { key: string; name: string; value: number }

// Категориальная палитра сайта: чернила и акценты темы, без случайных цветов.
const PALETTE = ['var(--info)', 'var(--ok)', 'var(--warn)', 'var(--crit)', 'var(--chart-5)', 'var(--ink-2)']

function ChartTooltip({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-ink px-3 py-2 text-[12px] text-white shadow-float">
      <div className="font-medium">{title}</div>
      <div className="num text-white/80">{children}</div>
    </div>
  )
}

/* Кольцо с итогом в центре и легендой справа: доли читаются и по дуге, и по числам. */
export function Donut({
  data,
  unit,
  centerLabel,
}: {
  data: Slice[]
  unit: (n: number) => string
  centerLabel: string
}) {
  const [active, setActive] = useState<number | null>(null)
  const total = data.reduce((sum, s) => sum + s.value, 0)
  const shown = active !== null ? data[active] : null
  return (
    <div className="flex items-center gap-6">
      <div className="relative size-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={54}
              outerRadius={76}
              paddingAngle={data.length > 1 ? 2 : 0}
              cornerRadius={4}
              stroke="none"
              animationDuration={800}
              animationEasing="ease-out"
              onMouseEnter={(_, index) => setActive(index)}
              onMouseLeave={() => setActive(null)}
            >
              {data.map((slice, i) => (
                <Cell
                  key={slice.key}
                  fill={PALETTE[i % PALETTE.length]}
                  opacity={active === null || active === i ? 1 : 0.35}
                  style={{ transition: 'opacity 150ms' }}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="display num text-[26px] leading-none">{formatNumber(shown ? shown.value : total)}</span>
          <span className="mt-1 max-w-24 truncate text-[11.5px] text-ink-3">{shown ? shown.name : centerLabel}</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2">
        {data.map((slice, i) => (
          <li
            key={slice.key}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            className={cn(
              'flex items-center gap-2.5 text-[13px] transition-opacity',
              active !== null && active !== i && 'opacity-45',
            )}
          >
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="min-w-0 flex-1 truncate text-ink-2">{slice.name}</span>
            <span className="num shrink-0 font-medium">{unit(slice.value)}</span>
            <span className="num w-10 shrink-0 text-right text-[12px] text-ink-4">
              {total ? Math.round((slice.value / total) * 100) : 0} %
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const ROW = 34

function NameTick({ x, y, payload, width }: { x?: number; y?: number; payload?: { value: string }; width: number }) {
  const text = payload?.value ?? ''
  const limit = Math.floor(width / 7.2)
  const short = text.length > limit ? `${text.slice(0, limit - 1)}…` : text
  return (
    <text x={(x ?? 0) - width + 8} y={y} dy={4} fontSize={12.5} fill="var(--ink-2)" textAnchor="start">
      <title>{text}</title>
      {short}
    </text>
  )
}

/* Горизонтальные столбцы одной толщины на общей шкале от нуля; подпись значения у конца столбца. */
export function HBars({
  data,
  color = 'var(--ink)',
  format,
  domainMax,
  marks = [],
  onClick,
  nameWidth = 210,
}: {
  data: Slice[]
  color?: string | ((slice: Slice) => string)
  format: (n: number) => string
  domainMax?: number
  marks?: { value: number; label: string }[]
  onClick?: (slice: Slice) => void
  nameWidth?: number
}) {
  const max = domainMax ?? Math.max(...data.map((d) => d.value), 1)
  const fill = (slice: Slice) => (typeof color === 'function' ? color(slice) : color)
  return (
    <div style={{ height: data.length * ROW + (marks.length ? 26 : 6) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 2, right: 72, bottom: marks.length ? 20 : 2, left: 0 }}
          barCategoryGap={10}
        >
          <XAxis type="number" hide domain={[0, max]} />
          <YAxis
            type="category"
            dataKey="name"
            width={nameWidth}
            axisLine={false}
            tickLine={false}
            tick={<NameTick width={nameWidth} />}
          />
          {marks.map((mark) => (
            <ReferenceLine
              key={mark.value}
              x={mark.value}
              stroke="var(--ink-4)"
              strokeDasharray="3 3"
              label={{ value: mark.label, position: 'bottom', fontSize: 11, fill: 'var(--ink-4)', offset: 6 }}
            />
          ))}
          <Tooltip
            cursor={{ fill: 'rgba(0,0,0,0.03)' }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as Slice | undefined
              if (!active || !row) return null
              return <ChartTooltip title={row.name}>{format(row.value)}</ChartTooltip>
            }}
          />
          <Bar
            dataKey="value"
            radius={3}
            barSize={14}
            background={{ fill: 'rgba(0,0,0,0.04)', radius: 3 }}
            animationDuration={700}
            animationEasing="ease-out"
            cursor={onClick ? 'pointer' : undefined}
            onClick={(entry) => onClick?.(entry?.payload as Slice)}
          >
            {data.map((slice) => (
              <Cell key={slice.key} fill={fill(slice)} />
            ))}
            <LabelList
              dataKey="value"
              content={({ x, y, width, height, index }) => {
                const row = index !== undefined ? data[index] : undefined
                if (!row) return null
                return (
                  <text
                    x={Number(x ?? 0) + Number(width ?? 0) + 10}
                    y={Number(y ?? 0) + Number(height ?? 0) / 2 + 4}
                    fontSize={12.5}
                    fontWeight={600}
                    fill="var(--foreground)"
                    className="num"
                  >
                    {format(row.value)}
                  </text>
                )
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* Столбцы на оси лет с горизонтальными линиями порогов: высота столбца сравнима с отметками 3 / 5 / 7. */
export function VBars({
  data,
  color,
  format,
  domainMax,
  marks = [],
}: {
  data: Slice[]
  color: (slice: Slice) => string
  format: (n: number) => string
  domainMax: number
  marks?: { value: number; label: string }[]
}) {
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 22, right: 44, bottom: 0, left: 0 }} barCategoryGap="30%">
          <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12.5} tick={{ fill: 'var(--ink-2)' }} />
          <YAxis hide domain={[0, domainMax]} />
          {marks.map((mark) => (
            <ReferenceLine
              key={mark.value}
              y={mark.value}
              stroke="var(--ink-4)"
              strokeDasharray="3 3"
              label={{ value: mark.label, position: 'right', fontSize: 11, fill: 'var(--ink-4)' }}
            />
          ))}
          <Tooltip
            cursor={{ fill: 'rgba(0,0,0,0.03)' }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as Slice | undefined
              if (!active || !row) return null
              return <ChartTooltip title={row.name}>{format(row.value)}</ChartTooltip>
            }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={56} animationDuration={700} animationEasing="ease-out">
            {data.map((slice) => (
              <Cell key={slice.key} fill={color(slice)} />
            ))}
            <LabelList
              dataKey="value"
              content={({ x, y, width, index }) => {
                const row = index !== undefined ? data[index] : undefined
                if (!row) return null
                return (
                  <text
                    x={Number(x ?? 0) + Number(width ?? 0) / 2}
                    y={Number(y ?? 0) - 8}
                    textAnchor="middle"
                    stroke="var(--card)"
                    strokeWidth={4}
                    paintOrder="stroke"
                    fontSize={12.5}
                    fontWeight={600}
                    fill="var(--foreground)"
                    className="num"
                  >
                    {format(row.value)}
                  </text>
                )
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

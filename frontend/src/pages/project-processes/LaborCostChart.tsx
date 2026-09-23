import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ProcessDemand } from '@/shared/api/types'
import { formatPct, formatRub } from '@/shared/lib/format'

type Row = { key: string; name: string; cost: number; share?: number }

const NAME_WIDTH = 250
const ROW = 46

/* Название процесса слева, в одну строку: длинное обрезается, полное видно в подсказке. */
function NameTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const text = payload?.value ?? ''
  const short = text.length > 34 ? `${text.slice(0, 33)}…` : text
  return (
    <text x={(x ?? 0) - NAME_WIDTH + 4} y={y} dy={4} fontSize={13} fill="var(--ink-2)" textAnchor="start">
      <title>{text}</title>
      {short}
    </text>
  )
}

export function LaborCostChart({ processes }: { processes: ProcessDemand[] }) {
  const data: Row[] = processes.map((p) => ({
    key: p.process_key,
    name: p.name,
    cost: p.current?.cost_rub_year ?? 0,
    share: p.share_of_labor_cost,
  }))
  const max = Math.max(...data.map((row) => row.cost), 1)
  // Клик по столбику ведёт к карточке процесса ниже.
  const open = (row?: Row) =>
    row && document.getElementById(`process-${row.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div style={{ height: data.length * ROW + 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 150, bottom: 4, left: 0 }} barCategoryGap={16}>
          <defs>
            <linearGradient id="labor-bar" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#e9b25c" />
              <stop offset="100%" stopColor="var(--warn)" />
            </linearGradient>
            <linearGradient id="labor-bar-active" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#d99a3c" />
              <stop offset="100%" stopColor="#b8740f" />
            </linearGradient>
          </defs>
          <XAxis type="number" hide domain={[0, max]} />
          <YAxis
            type="category"
            dataKey="name"
            width={NAME_WIDTH}
            axisLine={false}
            tickLine={false}
            tick={<NameTick />}
          />
          <Tooltip
            cursor={false}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as Row | undefined
              if (!active || !row) return null
              return (
                <div className="rounded-lg bg-ink px-3 py-2 text-[12px] text-white shadow-float">
                  <div className="font-medium">{row.name}</div>
                  <div className="num text-white/80">
                    {formatRub(row.cost)} в год
                    {row.share !== undefined && ` · ${formatPct(row.share, { share: true })} ФОТ`}
                  </div>
                  <div className="mt-0.5 text-white/50">нажмите, чтобы открыть процесс</div>
                </div>
              )
            }}
          />
          <Bar
            dataKey="cost"
            fill="url(#labor-bar)"
            radius={999}
            barSize={14}
            background={{ fill: 'rgba(0,0,0,0.045)', radius: 999 }}
            activeBar={{ fill: 'url(#labor-bar-active)' }}
            animationDuration={700}
            animationEasing="ease-out"
            cursor="pointer"
            onClick={(entry) => open(entry?.payload as Row | undefined)}
          >
            <LabelList
              dataKey="cost"
              position="right"
              offset={14}
              content={({ x, y, width, height, index }) => {
                const row = index !== undefined ? data[index] : undefined
                if (!row) return null
                const cx = Number(x ?? 0) + Number(width ?? 0) + 14
                const cy = Number(y ?? 0) + Number(height ?? 0) / 2 + 4
                return (
                  <text x={cx} y={cy} fontSize={13} className="num">
                    <tspan fill="var(--foreground)" fontWeight={600}>
                      {row.cost ? formatRub(row.cost) : '—'}
                    </tspan>
                    {row.cost > 0 && row.share !== undefined && (
                      <tspan fill="var(--muted-foreground)" dx={6}>
                        {formatPct(row.share, { share: true, digits: 0 })}
                      </tspan>
                    )}
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

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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
    <text x={(x ?? 0) - NAME_WIDTH + 2} y={y} dy={4} fontSize={13} fill="var(--ink-2)" textAnchor="start">
      <title>{text}</title>
      {short}
    </text>
  )
}

export function LaborCostChart({ processes }: { processes: ProcessDemand[] }) {
  const rows: Row[] = processes.map((p) => ({
    key: p.process_key,
    name: p.name,
    cost: p.current?.cost_rub_year ?? 0,
    share: p.share_of_labor_cost,
  }))
  // Процессы без затрат на персонал не рисуем пустой строкой — перечисляем их сноской под графиком.
  const data = rows.filter((row) => row.cost > 0)
  const empty = rows.filter((row) => row.cost <= 0)
  const max = Math.max(...data.map((row) => row.cost), 1)
  // Клик по столбику ведёт к карточке процесса ниже.
  const open = (row?: Row) =>
    row && document.getElementById(`process-${row.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div>
      <div style={{ height: data.length * ROW + 8 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 150, bottom: 4, left: 6 }}
            barCategoryGap={16}
          >
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
              radius={3}
              barSize={18}
              background={{ fill: 'rgba(0,0,0,0.045)', radius: 3 }}
              activeBar={{ opacity: 0.85 }}
              animationDuration={700}
              animationEasing="ease-out"
              cursor="pointer"
              onClick={(entry) => open(entry?.payload as Row | undefined)}
            >
              {/* Как в кадре шоурила: столбцы чернилами, самый дорогой процесс — единственный сигнальный. */}
              {data.map((row) => (
                <Cell key={row.key} fill={row.cost === max ? 'var(--signal)' : 'var(--foreground)'} />
              ))}
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
      {empty.length > 0 && (
        <p className="meta mt-2">
          Без затрат на персонал: {empty.map((row) => row.name.toLowerCase()).join(', ')} — персонал процесса не задан.
        </p>
      )}
    </div>
  )
}

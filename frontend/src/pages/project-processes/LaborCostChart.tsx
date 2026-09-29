import { motion } from 'framer-motion'
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ProcessDemand } from '@/shared/api/types'
import { formatPct, formatRub } from '@/shared/lib/format'

type Row = { key: string; name: string; cost: number; share?: number }

const NAME_WIDTH = 250
const ROW = 46
// Уже этой ширины колонке названий и подписям справа не хватает места на столбец: рисуем строки списком.
const COMPACT_BELOW = 560

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

  const ref = useRef<HTMLDivElement>(null)
  const width = useWidth(ref)
  const compact = width !== null && width < COMPACT_BELOW

  return (
    <div ref={ref}>
      {/* До первого замера ширины не рисуем ничего: иначе график успел бы смонтироваться и тут же смениться списком. */}
      {width === null ? null : compact ? (
        <CompactBars data={data} max={max} onOpen={open} />
      ) : (
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
      )}
      {empty.length > 0 && (
        <p className="meta mt-2">
          Без затрат на персонал: {empty.map((row) => row.name.toLowerCase()).join(', ')} — персонал процесса не задан.
        </p>
      )}
    </div>
  )
}

/* Узкий экран: название и сумма строкой, под ними столбец во всю ширину — та же шкала от нуля и один сигнальный. */
function CompactBars({ data, max, onOpen }: { data: Row[]; max: number; onOpen: (row: Row) => void }) {
  return (
    <ul className="space-y-1">
      {data.map((row, index) => (
        <li key={row.key}>
          <button type="button" onClick={() => onOpen(row)} className="block w-full py-1.5 text-left">
            <span className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="line-clamp-2 min-w-0 text-ink-2">{row.name}</span>
              <span className="num shrink-0 whitespace-nowrap">
                <span className="font-semibold">{formatRub(row.cost)}</span>
                {row.share !== undefined && (
                  <span className="ml-1.5 text-muted-foreground">
                    {formatPct(row.share, { share: true, digits: 0 })}
                  </span>
                )}
              </span>
            </span>
            <span className="mt-1.5 block h-2.5 overflow-hidden rounded-[3px] bg-black/4.5">
              <motion.span
                className="block h-full rounded-[3px]"
                style={{ background: row.cost === max ? 'var(--signal)' : 'var(--foreground)' }}
                initial={{ width: 0 }}
                animate={{ width: `${(row.cost / max) * 100}%` }}
                transition={{ type: 'spring', stiffness: 320, damping: 24, delay: index * 0.04 }}
              />
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function useWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState<number | null>(null)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    setWidth(node.clientWidth)
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref])
  return width
}

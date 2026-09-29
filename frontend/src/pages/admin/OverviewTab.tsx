import { motion } from 'framer-motion'
import { CircleCheck, HeartPulse, Plane, Warehouse } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useAdminAnalytics, useAdminUsers } from '@/entities/admin'
import { useProducts } from '@/entities/catalog'
import { OBJECT_TYPE_LABEL } from '@/entities/project'
import { useObjectTypes } from '@/entities/reference'
import type { ObjectTypeKey } from '@/shared/api/types'
import { formatNumber, formatYears, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { KpiNumber } from '@/shared/ui/v0'
import { SOFT, stagger } from './motion'

const ICON: Record<string, ReactNode> = {
  warehouse: <Warehouse size={15} />,
  airport: <Plane size={15} />,
  hospital: <HeartPulse size={15} />,
}
// Интервалы вердикта ТЗ 3.5.7: до 3 лет — выгодно, 3–5 — приемлемо, 5–7 — на грани.
const PAYBACK_MARKS = [3, 5, 7]

const typeLabel = (key: string) => OBJECT_TYPE_LABEL[key as ObjectTypeKey] ?? key
const sortedEntries = (record: Record<string, number> | undefined) =>
  Object.entries(record ?? {}).sort((a, b) => b[1] - a[1])

export function OverviewTab() {
  const analytics = useAdminAnalytics()
  const products = useProducts({ page_size: 1 })
  const users = useAdminUsers({ page_size: 1 })
  const objectTypes = useObjectTypes()
  const processNames = new Map<string, string>(
    (objectTypes.data ?? []).flatMap((t) => t.processes.map((p) => [`${t.key}/${p.key}`, p.name] as const)),
  )
  const processName = (objectType?: string, key?: string) => processNames.get(`${objectType}/${key}`) ?? key

  if (analytics.isPending) return <LoadingBlock label="Собираем аналитику…" />
  if (analytics.isError) return <ErrorBlock error={analytics.error} onRetry={() => analytics.refetch()} />

  const data = analytics.data
  const byType = sortedEntries(data.projects_by_object_type)
  const payback = sortedEntries(data.avg_payback_years_by_object_type).sort((a, b) => a[1] - b[1])
  const industries = sortedEntries(data.demand_by_industry)
  const top = data.top_products_in_scenarios ?? []
  const gaps = [...(data.catalog_gaps ?? [])].sort((a, b) => (b.no_fit_count ?? 0) - (a.no_fit_count ?? 0))
  const projectsTotal = byType.reduce((sum, [, n]) => sum + n, 0)

  return (
    <div className="space-y-5">
      <div className="card grid grid-cols-2 divide-line overflow-hidden md:grid-cols-4 md:divide-x">
        <Kpi label="Проектов" value={projectsTotal} />
        <Kpi label="Расчётов сценариев" value={data.calculations_count ?? 0} />
        <Kpi label="Решений в каталоге" value={products.data?.total} />
        <Kpi label="Пользователей" value={users.data?.total} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Проекты по типам объектов" note="Какие объекты оценивают чаще">
          <BarList
            empty="Проектов пока нет"
            items={byType.map(([key, n]) => ({
              key,
              icon: ICON[key],
              label: typeLabel(key),
              value: n,
              display: `${formatNumber(n)} ${pluralRu(n, ['проект', 'проекта', 'проектов'])}`,
            }))}
          />
        </Panel>

        <Panel title="Средняя окупаемость" note="По последним расчётам проектов; отметки — интервалы вердикта">
          <PaybackScale items={payback} />
        </Panel>

        <Panel title="Чаще всего в сценариях" note="Решения, которые пользователи берут в расчёт">
          <BarList
            empty="Сценариев с роботами пока нет"
            numbered
            items={top.map((item) => ({
              key: item.product_id ?? item.name ?? '',
              label: item.product_id ? (
                <Link to={`/catalog/${item.product_id}`} className="hover:underline">
                  {item.name}
                </Link>
              ) : (
                item.name
              ),
              value: item.count ?? 0,
              display: `${formatNumber(item.count ?? 0)} ${pluralRu(item.count ?? 0, ['сценарий', 'сценария', 'сценариев'])}`,
            }))}
          />
        </Panel>

        <Panel title="Пробелы каталога" note="Процессы, где подбор не нашёл подходящих решений — сигнал для ФЦ БАС">
          {gaps.length === 0 ? (
            <div className="flex items-center gap-2 rounded-[10px] bg-ok-soft/60 px-3.5 py-3 text-[13.5px] text-ok">
              <CircleCheck size={16} /> Для всех процессов в проектах нашлись подходящие решения
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {gaps.slice(0, 8).map((gap, i) => (
                <motion.li
                  key={`${gap.object_type}-${gap.process_key}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={stagger(i)}
                  className="flex items-center gap-3 py-2.5"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-black/5 text-ink-3">
                    {ICON[gap.object_type ?? '']}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">
                      {processName(gap.object_type, gap.process_key)}
                    </span>
                    <span className="block text-[12px] text-ink-3">{typeLabel(gap.object_type ?? '')}</span>
                  </span>
                  <span className="num shrink-0 text-[13px] text-crit">
                    {formatNumber(gap.no_fit_count ?? 0)}{' '}
                    {pluralRu(gap.no_fit_count ?? 0, ['проект', 'проекта', 'проектов'])}
                  </span>
                </motion.li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {industries.length > 0 && (
        <Panel title="Спрос по отраслям" note="Проекты по отрасли объекта">
          <BarList
            items={industries.map(([name, n]) => ({
              key: name,
              label: name,
              value: n,
              display: `${formatNumber(n)} ${pluralRu(n, ['проект', 'проекта', 'проектов'])}`,
            }))}
          />
        </Panel>
      )}
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="min-w-0 px-5 py-4">
      <div className="truncate text-[13px] text-ink-3">{label}</div>
      <div className="display mt-1.5 text-[28px] leading-none">
        {value === undefined ? <span className="text-ink-4">—</span> : <KpiNumber value={value} />}
      </div>
    </div>
  )
}

export function Panel({
  title,
  note,
  children,
  className,
}: {
  title: string
  note?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('card px-5 pt-4.5 pb-5', className)}>
      <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
      {note && <p className="meta mt-0.5">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

type BarItem = { key: string; label: ReactNode; value: number; display: string; icon?: ReactNode }

/* Полосы на общей шкале от нуля до максимума: длины сравнимы между собой, высота у всех одна. */
function BarList({ items, empty, numbered = false }: { items: BarItem[]; empty?: string; numbered?: boolean }) {
  if (items.length === 0) return <p className="text-[13.5px] text-ink-3">{empty ?? 'Данных пока нет'}</p>
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li key={item.key}>
          <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
            <span className="flex min-w-0 items-center gap-2">
              {numbered && <span className="num w-4 shrink-0 text-[12px] text-ink-4">{i + 1}</span>}
              {item.icon && <span className="shrink-0 text-ink-3">{item.icon}</span>}
              <span className="truncate">{item.label}</span>
            </span>
            <span className="num shrink-0 text-[13px] text-ink-2">{item.display}</span>
          </div>
          <div className={cn('mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/5', numbered && 'ml-6')}>
            <motion.div
              className={cn('h-full rounded-full', i === 0 ? 'bg-ink' : 'bg-ink/35')}
              initial={{ width: 0 }}
              animate={{ width: `${(item.value / max) * 100}%` }}
              transition={{ ...SOFT, delay: Math.min(i, 8) * 0.04 }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

/* Окупаемость на шкале лет с отметками 3 / 5 / 7: сразу видно, в какой интервал вердикта попадает тип объекта. */
function PaybackScale({ items }: { items: [string, number][] }) {
  if (items.length === 0) return <p className="text-[13.5px] text-ink-3">Расчётов с окупаемостью пока нет</p>
  const scale = Math.max(PAYBACK_MARKS[PAYBACK_MARKS.length - 1] + 1, ...items.map(([, v]) => Math.ceil(v)))
  const tone = (v: number) => (v <= 3 ? 'bg-ok' : v <= 5 ? 'bg-ink' : v <= 7 ? 'bg-warn' : 'bg-crit')
  return (
    <div>
      <ul className="space-y-3">
        {items.map(([key, years], i) => (
          <li key={key}>
            <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
              <span className="flex items-center gap-2">
                <span className="text-ink-3">{ICON[key]}</span>
                {typeLabel(key)}
              </span>
              <span className="num text-[13px] font-medium">{formatYears(years)}</span>
            </div>
            <div className="relative mt-1.5 h-1.5 rounded-full bg-black/5">
              <motion.div
                className={cn('h-full rounded-full', tone(years))}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(years / scale, 1) * 100}%` }}
                transition={{ ...SOFT, delay: i * 0.05 }}
              />
              {PAYBACK_MARKS.map((mark) => (
                <span
                  key={mark}
                  className="absolute -top-0.5 h-2.5 w-px bg-ink-4/70"
                  style={{ left: `${(mark / scale) * 100}%` }}
                />
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="relative mt-2 h-4 text-[11px] text-ink-4">
        {PAYBACK_MARKS.map((mark) => (
          <span key={mark} className="num absolute -translate-x-1/2" style={{ left: `${(mark / scale) * 100}%` }}>
            {mark} {pluralRu(mark, ['год', 'года', 'лет'])}
          </span>
        ))}
      </div>
    </div>
  )
}

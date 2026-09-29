import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useAdminAnalytics, useAdminUsers } from '@/entities/admin'
import { PRODUCT_STATUS_LABEL, useCatalogFacets, useProducts } from '@/entities/catalog'
import { OBJECT_TYPE_LABEL } from '@/entities/project'
import { useObjectTypes } from '@/entities/reference'
import type { ObjectTypeKey, ProductStatus } from '@/shared/api/types'
import { formatNumber, formatYears, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { KpiNumber } from '@/shared/ui/v0'
import { Donut, HBars, type Slice } from './charts'
import { PaybackScale } from './PaybackScale'
import { stagger } from './motion'

const TOP_TYPES = 8

const typeLabel = (key: string) => OBJECT_TYPE_LABEL[key as ObjectTypeKey] ?? key
const toSlices = (record: Record<string, number> | undefined, label: (k: string) => string): Slice[] =>
  Object.entries(record ?? {})
    .map(([key, value]) => ({ key, name: label(key), value }))
    .sort((a, b) => b.value - a.value)
const paybackTone = (years: number) =>
  years <= 3 ? 'var(--ok)' : years <= 5 ? 'var(--ink)' : years <= 7 ? 'var(--warn)' : 'var(--crit)'
const paybackWord = (years: number) =>
  years <= 3 ? 'выгодно' : years <= 5 ? 'приемлемо' : years <= 7 ? 'на грани' : 'долго'
const projects = (n: number) => `${formatNumber(n)} ${pluralRu(n, ['проект', 'проекта', 'проектов'])}`

export function OverviewTab() {
  const navigate = useNavigate()
  const analytics = useAdminAnalytics()
  const products = useProducts({ page_size: 1 })
  const users = useAdminUsers({ page_size: 1 })
  const facets = useCatalogFacets()
  const objectTypes = useObjectTypes()

  if (analytics.isPending) return <LoadingBlock label="Собираем аналитику…" />
  if (analytics.isError) return <ErrorBlock error={analytics.error} onRetry={() => analytics.refetch()} />

  const data = analytics.data
  const byType = toSlices(data.projects_by_object_type, typeLabel)
  const payback = toSlices(data.avg_payback_years_by_object_type, typeLabel).sort((a, b) => a.value - b.value)
  const top: Slice[] = (data.top_products_in_scenarios ?? []).map((p) => ({
    key: p.product_id ?? p.name ?? '',
    name: p.name ?? '—',
    value: p.count ?? 0,
  }))
  const gaps = [...(data.catalog_gaps ?? [])].sort((a, b) => (b.no_fit_count ?? 0) - (a.no_fit_count ?? 0))
  const projectsTotal = byType.reduce((sum, s) => sum + s.value, 0)
  // Средняя по платформе — взвешенная числом проектов каждого типа объекта.
  const weighted = payback.reduce(
    (acc, s) => {
      const weight = data.projects_by_object_type?.[s.key] ?? 1
      return { sum: acc.sum + s.value * weight, n: acc.n + weight }
    },
    { sum: 0, n: 0 },
  )
  const avgPayback = weighted.n ? weighted.sum / weighted.n : null
  const catalogTypes = (facets.data?.solution_types ?? []).map((f) => ({ key: f.key, name: f.name, value: f.count }))
  const otherTypes = catalogTypes.slice(TOP_TYPES).reduce((sum, t) => sum + t.value, 0)
  const typeBars = catalogTypes.slice(0, TOP_TYPES)
  const otherCount = catalogTypes.length - typeBars.length
  const statuses: Slice[] = (facets.data?.statuses ?? []).map((f) => ({
    key: f.key,
    name: PRODUCT_STATUS_LABEL[f.key as ProductStatus] ?? f.name,
    value: f.count,
  }))
  const coverage: Slice[] = (facets.data?.object_types ?? []).map((f) => ({
    key: f.key,
    name: typeLabel(f.key),
    value: f.count,
  }))
  const processNames = new Map<string, string>(
    (objectTypes.data ?? []).flatMap((t) => t.processes.map((p) => [`${t.key}/${p.key}`, p.name] as const)),
  )

  return (
    <div className="space-y-5">
      <div className="card grid grid-cols-2 overflow-hidden sm:grid-cols-3 lg:grid-cols-6 lg:divide-x lg:divide-line">
        <Kpi
          label="Проектов"
          value={projectsTotal}
          hint={`${byType.length} ${pluralRu(byType.length, ['тип', 'типа', 'типов'])} объектов`}
        />
        <Kpi label="Расчётов сценариев" value={data.calculations_count ?? 0} hint="сохранённые прогоны" />
        <Kpi
          label="Средняя окупаемость"
          value={avgPayback}
          format={(v) => formatYears(v)}
          tone={avgPayback !== null ? paybackTone(avgPayback) : undefined}
          hint={avgPayback === null ? 'расчётов нет' : paybackWord(avgPayback)}
        />
        <Kpi label="Решений в каталоге" value={products.data?.total} hint={`${catalogTypes.length} типов решений`} />
        <Kpi label="Пользователей" value={users.data?.total} hint="с доступом к платформе" />
        <Kpi
          label="Пробелы каталога"
          value={gaps.length}
          tone={gaps.length ? 'var(--crit)' : 'var(--ok)'}
          hint={gaps.length ? 'процессов без решений' : 'решения есть везде'}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Panel title="Каталог по типам решений" note="Крупнейшие типы; клик по столбцу открывает каталог с фильтром">
          {facets.isPending ? (
            <LoadingBlock label="Загружаем каталог…" />
          ) : (
            <>
              <HBars
                data={typeBars}
                format={(n) => formatNumber(n)}
                color="var(--info)"
                nameWidth={230}
                onClick={(s) => navigate(`/catalog?solution_type=${s.key}`)}
              />
              {otherCount > 0 && (
                <p className="meta mt-2">
                  Ещё {otherCount} {pluralRu(otherCount, ['тип', 'типа', 'типов'])} — {formatNumber(otherTypes)}{' '}
                  {pluralRu(otherTypes, ['решение', 'решения', 'решений'])}
                </p>
              )}
            </>
          )}
        </Panel>
        <Panel title="Готовность каталога" note="Стадия решений по данным организатора">
          {statuses.length > 0 ? (
            <Donut data={statuses} centerLabel="решений" unit={(n) => formatNumber(n)} />
          ) : (
            <LoadingBlock label="Загружаем каталог…" />
          )}
          {coverage.length > 0 && (
            <div className="hairline mt-5 pt-4">
              <div className="mb-2 text-[13px] font-medium">Решения по типам объектов</div>
              <HBars data={coverage} format={(n) => formatNumber(n)} color="var(--ok)" nameWidth={130} />
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Проекты по объектам" note="Какие объекты оценивают">
          {byType.length ? (
            <Donut data={byType} centerLabel="проектов" unit={(n) => formatNumber(n)} />
          ) : (
            <Empty>Проектов пока нет</Empty>
          )}
        </Panel>
        <Panel title="Окупаемость по объектам" note="Средняя по последним расчётам на шкале вердикта">
          {payback.length ? <PaybackScale data={payback} /> : <Empty>Расчётов с окупаемостью пока нет</Empty>}
        </Panel>
        <Panel title="Чаще всего в сценариях" note="Решения в расчётах пользователей, сценариев">
          {top.length ? (
            <HBars
              data={top.slice(0, 6)}
              format={(n) => formatNumber(n)}
              nameWidth={170}
              onClick={(s) => navigate(`/catalog/${s.key}`)}
            />
          ) : (
            <Empty>Сценариев с роботами пока нет</Empty>
          )}
        </Panel>
      </div>

      {gaps.length > 0 && (
        <Panel title="Пробелы каталога" note="Процессы, где подбор не находит решений — сигнал для ФЦ БАС">
          <ul className="grid gap-x-8 divide-line sm:grid-cols-2">
            {gaps.slice(0, 10).map((gap, i) => (
              <motion.li
                key={`${gap.object_type}-${gap.process_key}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={stagger(i)}
                className="flex items-center justify-between gap-3 border-b border-line py-2.5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium">
                    {processNames.get(`${gap.object_type}/${gap.process_key}`) ?? gap.process_key}
                  </span>
                  <span className="block text-[12px] text-ink-3">{typeLabel(gap.object_type ?? '')}</span>
                </span>
                <span className="num shrink-0 text-[13px] text-crit">{projects(gap.no_fit_count ?? 0)}</span>
              </motion.li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}

function Kpi({
  label,
  value,
  hint,
  tone,
  format,
}: {
  label: string
  value: number | null | undefined
  hint?: string
  tone?: string
  format?: (v: number) => string
}) {
  return (
    <div className="min-w-0 px-4 py-4 sm:px-5">
      <div className="truncate text-[12.5px] text-ink-3">{label}</div>
      <div className="display mt-1.5 text-[30px] leading-none" style={tone ? { color: tone } : undefined}>
        {value === undefined || value === null ? (
          <span className="text-ink-4">—</span>
        ) : (
          <KpiNumber value={value} format={format} />
        )}
      </div>
      {hint && <div className="mt-1.5 truncate text-[12px] text-ink-3">{hint}</div>}
    </div>
  )
}

function Panel({
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
    <section className={cn('card px-4 pt-4.5 pb-5 sm:px-5', className)}>
      <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
      {note && <p className="meta mt-0.5">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-[13.5px] text-ink-3">{children}</p>
}

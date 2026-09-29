import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useSolutionTypes } from '@/entities/admin'
import { OBJECT_TYPE_LABEL } from '@/entities/project'
import { useVendorOverview } from '@/entities/vendor'
import type { ObjectTypeKey } from '@/shared/api/types'
import { formatNumber, pluralRu } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { KpiNumber } from '@/shared/ui/v0'
import { Donut, HBars, type Slice } from '@/pages/admin/charts'
import { stagger } from '@/pages/admin/motion'
import { Empty, Kpi, Panel } from '@/pages/admin/panels'

const typeLabel = (key: string) => OBJECT_TYPE_LABEL[key as ObjectTypeKey] ?? key
const projects = (n: number) => `${formatNumber(n)} ${pluralRu(n, ['проект', 'проекта', 'проектов'])}`

export function VendorOverviewTab() {
  const navigate = useNavigate()
  const overview = useVendorOverview()
  const solutionTypes = useSolutionTypes()
  if (!overview.data) return null

  const data = overview.data
  const products = data.products
  const completeness = products.length
    ? products.reduce((sum, p) => sum + p.product.completeness, 0) / products.length
    : 0
  const gaps = products.reduce((sum, p) => sum + p.missing_key_specs.length, 0)
  const withGaps = products.filter((p) => p.missing_key_specs.length > 0).length
  const manualAdds = products.reduce((sum, p) => sum + p.manual_adds, 0)
  const byType: Slice[] = Object.entries(data.projects_by_object_type)
    .map(([key, value]) => ({ key, name: typeLabel(key), value }))
    .sort((a, b) => b.value - a.value)
  const inScenarios: Slice[] = products
    .filter((p) => p.scenarios_count > 0)
    .map((p) => ({ key: p.product.id, name: p.product.name, value: p.scenarios_count }))
    .sort((a, b) => b.value - a.value)
  const typeName = (key: string) => solutionTypes.data?.find((t) => t.key === key)?.name ?? key

  return (
    <div className="space-y-5">
      <section className="card grid items-center gap-6 px-6 py-6 md:grid-cols-[auto_minmax(0,1fr)_auto]">
        <div>
          <div className="hud mb-2">Полнота карточек</div>
          <div className="display text-[64px] text-signal">
            <KpiNumber value={completeness * 100} suffix=" %" />
          </div>
        </div>
        <p className="max-w-130 text-[15px] leading-relaxed text-ink-2">
          {gaps > 0 ? (
            <>
              У {withGaps} {pluralRu(withGaps, ['продукта', 'продуктов', 'продуктов'])} не заполнено{' '}
              <span className="num font-semibold text-ink">{gaps}</span>{' '}
              {pluralRu(gaps, ['ключевая характеристика', 'ключевые характеристики', 'ключевых характеристик'])}. Без
              них подбор не может проверить продукт под объект и ставит «требует проверки» — заказчик видит сомнение
              там, где могли бы быть факты.
            </>
          ) : (
            <>Все ключевые характеристики заполнены: подбор проверяет ваши продукты по данным, а не по допущениям.</>
          )}
        </p>
        {gaps > 0 && (
          <Button onClick={() => navigate('/vendor/products?gaps=1')}>
            Заполнить пробелы <ArrowRight />
          </Button>
        )}
      </section>

      <div className="card grid grid-cols-2 overflow-hidden sm:grid-cols-3 lg:grid-cols-5 lg:divide-x lg:divide-line">
        <Kpi label="Продуктов в каталоге" value={products.length} hint="видны покупателям" />
        <Kpi label="Проектов с вашими объектами" value={data.projects_total} hint="оценивают роботизацию" />
        <Kpi label="Сценариев с продуктами" value={data.scenarios_with_products} hint="считают экономику" />
        <Kpi label="Добавлений вручную" value={manualAdds} hint="вне автоматической подборки" />
        <Kpi
          label="Заявок на модерации"
          value={data.proposals_by_status.pending ?? 0}
          hint={`принято ${data.proposals_by_status.approved ?? 0}`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Спрос по объектам" note="Проекты платформы с объектами, для которых есть ваши продукты">
          {byType.length ? (
            <Donut data={byType} centerLabel="проектов" unit={(n) => formatNumber(n)} />
          ) : (
            <Empty>Проектов с вашими объектами пока нет</Empty>
          )}
        </Panel>
        <Panel title="Продукты в сценариях" note="Сколько сценариев пользователей считают экономику с продуктом">
          {inScenarios.length ? (
            <HBars
              data={inScenarios.slice(0, 6)}
              format={(n) => formatNumber(n)}
              nameWidth={190}
              onClick={(s) => navigate(`/catalog/${s.key}`)}
            />
          ) : (
            <Empty>Ваших продуктов пока нет в сценариях</Empty>
          )}
        </Panel>
      </div>

      <Panel
        title="Свободные ниши"
        note="Процессы, которые оценивают на платформе, а продуктов в каталоге для них нет — там работают ваши типы решений"
      >
        {data.gaps.length ? (
          <ul className="grid gap-x-8 sm:grid-cols-2">
            {data.gaps.slice(0, 10).map((gap, i) => (
              <motion.li
                key={`${gap.object_type}-${gap.process_key}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={stagger(i)}
                className="flex items-center justify-between gap-3 border-b border-line py-2.5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-medium">{gap.process_name}</span>
                  <span className="block truncate text-[12px] text-ink-3">
                    {typeLabel(gap.object_type)} · {gap.solution_types.map(typeName).join(', ')}
                  </span>
                </span>
                <span className="num shrink-0 text-[13px] text-ink-2">{projects(gap.no_fit_count)}</span>
              </motion.li>
            ))}
          </ul>
        ) : (
          <Empty>Для ваших типов решений ниш без продуктов нет</Empty>
        )}
      </Panel>
    </div>
  )
}

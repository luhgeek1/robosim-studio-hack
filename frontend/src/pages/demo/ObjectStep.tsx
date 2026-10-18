import { lazy, Suspense } from 'react'
import type { DemoChanges, DemoSnapshot } from '@/entities/demo/api'
import { formatNumber, formatValue } from '@/shared/lib/format'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Section, Stat, StatStrip } from '@/shared/ui/page'
import { LoadingBlock } from '@/shared/ui/states'
import { DemoField } from './DemoField'
import { GuestScreen } from './GuestScreen'
const Twin = lazy(() => import('@/widgets/twin').then((m) => ({ default: m.Twin })))
const UNITS: Record<string, string> = {
  pallet: 'паллет',
  line: 'строк',
  item: 'шт.',
  m2: 'м²',
  trip: 'рейсов',
  kg: 'кг',
  bag: 'ед. багажа',
  portion: 'порций',
  container: 'контейнеров',
}

export function ObjectStep({
  demo,
  value,
  onChange,
}: {
  demo: DemoSnapshot
  value: DemoChanges
  onChange: (value: DemoChanges) => void
}) {
  const base = demo.calculations.find((c) => c.scenario_id === demo.primary_scenario_id)!
  const tasks = demo.processes.filter((p) => base.sizing.some((s) => s.process_key === p.process_key))
  const param = (key: string) => demo.params.find((p) => p.key === key)
  const area = param('area_m2')
  const shifts = param('shifts_per_day')
  const summary = [
    { label: 'Процессов в расчёте', value: String(tasks.length), hint: 'выбрано для роботизации' },
    { label: 'Рабочих смен в сутки', value: formatValue(shifts?.value), hint: 'режим работы объекта' },
    {
      label: 'Нагрузка в демо',
      value: `${Math.round((value.volume_multiplier ?? 1) * 100)}%`,
      hint: 'от исходного объёма задач',
    },
  ]
  return (
    <GuestScreen
      title={demo.demo.name}
      lead="Параметры уже заполнены. Измените условия или сразу перейдите к подбору и расчёту."
    >
      <div className="card overflow-hidden">
        <div className="grid lg:grid-cols-2">
          <section className="space-y-6 p-5 sm:p-7" aria-labelledby="demo-object-params">
            <div>
              <h2 className="h3" id="demo-object-params">
                Основные параметры
              </h2>
              <p className="meta mt-1">В демо — готовый объект и два изменяемых параметра.</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="demo-object-type">Тип объекта</Label>
                <Input
                  id="demo-object-type"
                  readOnly
                  value={
                    demo.demo.object_type === 'warehouse'
                      ? 'Склад'
                      : demo.demo.object_type === 'hospital'
                        ? 'Больница'
                        : 'Аэропорт'
                  }
                  className="bg-surface-2"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="demo-object-area">{area?.name ?? 'Режим работы'}</Label>
                <Input
                  id="demo-object-area"
                  readOnly
                  value={area ? formatValue(area.value, area.unit) : demo.demo.name}
                  className="bg-surface-2"
                />
              </div>
            </div>
            <DemoField
              id="demo-volume"
              label="Нагрузка относительно примера"
              value={value.volume_multiplier ?? 1}
              onChange={(volume_multiplier) => onChange({ ...value, volume_multiplier })}
            />
            <DemoField
              id="demo-salary"
              label="Уровень зарплат относительно примера"
              value={value.salary_multiplier ?? 1}
              onChange={(salary_multiplier) => onChange({ ...value, salary_multiplier })}
            />
            <p className="meta border-t border-line pt-4">
              Площадь и планировка фиксированы для этого примера. В своём проекте вы сможете задать их самостоятельно.
            </p>
          </section>
          <div
            className="relative min-h-80 border-t border-line bg-surface-2 lg:border-t-0 lg:border-l"
            aria-label="План демонстрационного объекта"
          >
            {demo.layout ? (
              <Suspense
                fallback={
                  <div className="p-6">
                    <LoadingBlock label="Открываем план объекта…" />
                  </div>
                }
              >
                <div className="absolute inset-0">
                  <Twin layout={demo.layout} controls="basic" />
                </div>
              </Suspense>
            ) : (
              <div className="grid h-full place-items-center p-8 text-[14px] text-ink-3">
                План объекта появится после подготовки примера.
              </div>
            )}
          </div>
        </div>
        <div className="border-t border-line">
          <StatStrip columns={3} className="rounded-none border-0">
            {summary.map((stat) => (
              <Stat
                key={stat.label}
                {...stat}
                className="px-5 py-5 sm:px-7 sm:py-5 [&>div:last-child]:mt-2"
                valueClassName="mt-2 text-[30px] leading-none tracking-[-0.035em] sm:text-[30px]"
              />
            ))}
          </StatStrip>
        </div>
      </div>
      <Section
        title="Какие задачи передаём роботам"
        className="mt-6"
        description="Параметры объекта и процессы объединены в один шаг."
      >
        <div className="divide-y divide-line">
          {tasks.map((p) => (
            <div
              key={p.process_key}
              className="flex flex-wrap items-baseline justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <span className="text-[14px] font-medium">{p.name}</span>
              <span className="num text-[13px] text-ink-3">
                {formatNumber(p.demand_per_day == null ? null : p.demand_per_day * (value.volume_multiplier ?? 1))}{' '}
                {UNITS[p.demand_unit] ?? p.demand_unit} / сутки
              </span>
            </div>
          ))}
        </div>
        <p className="meta mt-4 border-t border-line pt-4">{demo.demo.scope}</p>
      </Section>
    </GuestScreen>
  )
}

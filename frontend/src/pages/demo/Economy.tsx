import { Check, ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-react'
import type { DemoChanges } from '@/entities/demo/api'
import type { CalculationRun } from '@/shared/api/types'
import { formatRub, formatYears } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Section } from '@/shared/ui/page'
import { Spinner } from '@/shared/ui/states'
import { DemoField } from './DemoField'
import { INITIAL } from './defaults'

const METHODS = [
  { value: 'purchase', label: 'Покупка', description: 'Оборудование в собственности' },
  { value: 'raas', label: 'Робот как услуга', description: 'Регулярная оплата использования' },
  { value: 'lease', label: 'Лизинг', description: 'Аванс и платежи по графику' },
] as const

export function Economy({
  metrics,
  value,
  pending,
  failed,
  onChange,
}: {
  metrics: CalculationRun['metrics']
  value: DemoChanges
  pending: boolean
  failed: string | null
  onChange: (value: DemoChanges) => void
}) {
  return (
    <Section
      title="Способ внедрения и экономика"
      description="Выберите вариант — посмотрим, как изменятся вложения и эффект."
      className="overflow-hidden"
      bodyClassName="px-0 pb-0 sm:px-0 sm:pb-0"
    >
      <fieldset className="mx-auto grid min-w-0 grid-cols-1 gap-2 px-4 pt-2 pb-5 sm:px-5 sm:pb-6 md:grid-cols-3 md:gap-3">
        <legend className="sr-only">Способ внедрения</legend>
        {METHODS.map((method) => (
          <label key={method.value} className="relative min-w-0 cursor-pointer">
            <input
              type="radio"
              name="demo-financing"
              value={method.value}
              checked={(value.scenario_kind ?? 'purchase') === method.value}
              onChange={() => onChange({ ...value, scenario_kind: method.value })}
              className="peer sr-only"
              aria-label={method.label}
            />
            <span className="flex h-full items-start justify-between gap-3 rounded-xl border border-line px-4 py-3.5 transition-colors hover:border-line-2 hover:bg-surface-2 peer-checked:border-[#293831] peer-checked:bg-[#293831] peer-checked:text-white peer-checked:hover:border-[#293831] peer-checked:hover:bg-[#293831] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-signal sm:px-5 sm:py-4">
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold tracking-[-0.015em]">{method.label}</span>
                <span
                  className={cn(
                    'mt-1 block text-[12px] leading-relaxed',
                    (value.scenario_kind ?? 'purchase') === method.value ? 'text-[#c8d2c9]' : 'text-ink-3',
                  )}
                >
                  {method.description}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                  (value.scenario_kind ?? 'purchase') === method.value
                    ? 'border-[#ff986e] bg-[#ff986e] text-[#293831]'
                    : 'border-line-2',
                )}
              >
                {(value.scenario_kind ?? 'purchase') === method.value && <Check size={11} strokeWidth={3} />}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="border-t border-line bg-surface-2 px-4 py-4 sm:px-5 sm:py-5" aria-busy={pending}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] font-medium text-ink-2">При выбранных условиях</p>
          <span className="flex items-center gap-1.5 text-[12px] text-ink-3" role="status">
            {pending ? (
              <>
                <Spinner />
                Пересчитываем…
              </>
            ) : failed ? (
              'Показан предыдущий расчёт'
            ) : (
              <>
                <Check size={13} className="text-ok" />
                Расчёт готов
              </>
            )}
          </span>
        </div>
        <dl className="grid gap-4 md:grid-cols-[1.05fr_1fr_1fr] md:gap-0">
          {[
            {
              label: 'Окупаемость',
              amount: formatYears(metrics.payback_years),
              hint: 'срок возврата вложений',
            },
            {
              label: 'Вложения на старте',
              amount: formatRub(metrics.owner_upfront_rub ?? metrics.capex_rub),
              hint: 'первоначальные расходы',
            },
            {
              label: 'Денежный эффект в год',
              amount: formatRub(metrics.effect_rub_year),
              hint: 'после расходов на роботизацию',
            },
          ].map((stat, index) => (
            <div
              key={stat.label}
              className={cn(
                'flex min-w-0 items-center justify-between gap-4 border-line md:block',
                index > 0 && 'border-t pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-6',
                index < 2 && 'md:pr-5',
              )}
            >
              <dt className="max-w-[42%] text-[12px] text-ink-3 md:max-w-none">{stat.label}</dt>
              <dd className="min-w-0 text-right md:mt-2 md:text-left">
                <span
                  className={cn(
                    'num block text-[24px] leading-tight font-semibold tracking-[-0.04em] sm:text-[28px] md:text-[32px]',
                    pending && 'opacity-40',
                  )}
                >
                  {stat.amount}
                </span>
                <span className="mt-1 block text-[11px] leading-relaxed text-ink-3 sm:text-[12px]">{stat.hint}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid items-start gap-x-4 gap-y-1 border-t border-line px-4 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5">
        <details className="group min-w-0 text-[12px]">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-sm py-2 text-ink-2 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal size={14} className="text-ink-3" />
            Стоимость оборудования
            <ChevronDown size={13} className="text-ink-3 transition-transform group-open:rotate-180" />
          </summary>
          <div className="max-w-96 pt-2 pb-4">
            <DemoField
              id="demo-price"
              label="Стоимость роботов относительно каталога"
              value={value.robot_price_multiplier ?? 1}
              onChange={(robot_price_multiplier) => onChange({ ...value, robot_price_multiplier })}
            />
          </div>
        </details>
        <Button
          variant="ghost"
          size="sm"
          className="my-0.5 justify-self-start px-0 text-[12px] text-ink-3 hover:bg-transparent sm:justify-self-end"
          onClick={() => onChange(INITIAL)}
        >
          <RotateCcw />
          Сбросить условия
        </Button>
      </div>
    </Section>
  )
}

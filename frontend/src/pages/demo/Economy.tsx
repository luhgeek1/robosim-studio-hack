import { Check, CircleAlert, RotateCcw } from 'lucide-react'
import type { DemoChanges } from '@/entities/demo/api'
import type { CalculationRun } from '@/shared/api/types'
import { formatNumber, formatRub, formatYears } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Spinner } from '@/shared/ui/states'
import { DemoField } from './DemoField'
import { INITIAL } from './defaults'

const METHODS = [
  { value: 'purchase', label: 'Покупка' },
  { value: 'raas', label: 'Робот как услуга' },
  { value: 'lease', label: 'Лизинг' },
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
    <section aria-label="Условия и результат расчёта" className="rounded-lg border border-line bg-card">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line px-4 py-3">
        <fieldset className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <legend className="sr-only">Способ внедрения</legend>
          <span aria-hidden="true" className="text-[12px] text-ink-3">
            Внедрение
          </span>
          <div className="flex rounded-md border border-line bg-surface-2 p-0.5">
            {METHODS.map((method) => (
              <label key={method.value} className="cursor-pointer">
                <input
                  type="radio"
                  name="demo-financing"
                  value={method.value}
                  checked={(value.scenario_kind ?? 'purchase') === method.value}
                  onChange={() => onChange({ ...value, scenario_kind: method.value })}
                  className="peer sr-only"
                  aria-label={method.label}
                />
                <span className="block rounded border border-transparent px-2.5 py-1 text-[12px] text-ink-3 transition-colors hover:text-ink peer-checked:border-line peer-checked:bg-card peer-checked:font-medium peer-checked:text-ink peer-checked:shadow-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
                  {method.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <DemoField
          compact
          id="demo-price"
          label="Цена роботов"
          value={value.robot_price_multiplier ?? 1}
          onChange={(robot_price_multiplier) => onChange({ ...value, robot_price_multiplier })}
        />
        <Button variant="ghost" size="sm" className="text-ink-3" onClick={() => onChange(INITIAL)}>
          <RotateCcw /> Сбросить
        </Button>
        <span className="flex items-center gap-1.5 text-[11px] text-ink-3 sm:ml-auto" role="status">
          {pending ? (
            <>
              <Spinner /> Пересчёт…
            </>
          ) : failed ? (
            <>
              <CircleAlert size={13} className="text-warn" /> Предыдущий расчёт
            </>
          ) : (
            <>
              <Check size={13} className="text-ok" /> Рассчитано
            </>
          )}
        </span>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4" aria-busy={pending}>
        {[
          { label: 'Роботов', amount: formatNumber(metrics.robots_total), hint: 'включая резерв' },
          {
            label: 'Вложения на старте',
            amount: formatRub(metrics.owner_upfront_rub ?? metrics.capex_rub),
            hint: 'собственные средства',
          },
          { label: 'Эффект в год', amount: formatRub(metrics.effect_rub_year), hint: 'после расходов и процентов' },
          { label: 'Окупаемость', amount: formatYears(metrics.payback_years), hint: 'возврат вложений' },
        ].map((stat, index) => (
          <div
            key={stat.label}
            className={cn(
              'min-w-0 px-4 py-4',
              index % 2 !== 0 && 'border-l border-line',
              index > 1 && 'border-t border-line sm:border-t-0 sm:border-l',
            )}
          >
            <dt className="text-[12px] text-ink-3">{stat.label}</dt>
            <dd className="mt-1.5">
              <span
                className={cn(
                  'num block text-[23px] leading-tight font-semibold tracking-[-0.03em] sm:text-[25px]',
                  pending && 'opacity-40',
                )}
              >
                {stat.amount}
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed text-ink-3">{stat.hint}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

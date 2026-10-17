import {
  Check,
  ChevronDown,
  CircleAlert,
  Landmark,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react'
import type { DemoChanges } from '@/entities/demo/api'
import type { CalculationRun } from '@/shared/api/types'
import { formatRub, formatYears } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Spinner } from '@/shared/ui/states'
import { DemoField } from './DemoField'
import { INITIAL } from './defaults'

const METHODS = [
  { value: 'purchase', label: 'Покупка', description: 'Роботы в собственности', icon: PackageCheck },
  { value: 'raas', label: 'Робот как услуга', description: 'Оплата использования', icon: RefreshCw },
  { value: 'lease', label: 'Лизинг', description: 'Аванс и платежи по графику', icon: Landmark },
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
    <section
      aria-label="Способ внедрения и экономика"
      className="overflow-hidden rounded-2xl border border-line bg-card shadow-[0_2px_8px_-4px_#29383112]"
    >
      <div className="grid lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="border-b border-line bg-surface-2 p-5 sm:p-6 lg:border-r lg:border-b-0">
          <p className="hud text-ink-3">Модель внедрения</p>
          <h2 className="mt-2 text-[19px] font-semibold tracking-[-0.025em]">Как будем внедрять?</h2>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">
            Выберите способ — экономика пересчитается автоматически.
          </p>
          <fieldset className="mt-5 grid min-w-0 gap-2 sm:grid-cols-3 lg:grid-cols-1">
            <legend className="sr-only">Способ внедрения</legend>
            {METHODS.map((method) => {
              const selected = (value.scenario_kind ?? 'purchase') === method.value
              const Icon = method.icon
              return (
                <label key={method.value} className="relative min-w-0 cursor-pointer">
                  <input
                    type="radio"
                    name="demo-financing"
                    value={method.value}
                    checked={selected}
                    onChange={() => onChange({ ...value, scenario_kind: method.value })}
                    className="peer sr-only"
                    aria-label={method.label}
                  />
                  <span
                    className={cn(
                      'flex h-full items-center gap-3 rounded-xl border p-3 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-ring sm:items-start lg:items-center',
                      selected
                        ? 'border-signal/50 bg-card shadow-[0_0_0_1px_var(--signal-soft)]'
                        : 'border-transparent hover:border-line hover:bg-card',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-lg max-lg:max-sm:size-8 sm:max-lg:hidden',
                        selected ? 'bg-signal-soft text-signal' : 'bg-muted text-ink-3',
                      )}
                    >
                      <Icon size={17} strokeWidth={1.7} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold">{method.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-3">{method.description}</span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                        selected ? 'border-signal bg-signal text-white' : 'border-line-2',
                      )}
                    >
                      {selected && <Check size={10} strokeWidth={3} />}
                    </span>
                  </span>
                </label>
              )
            })}
          </fieldset>
        </div>

        <div className="min-w-0 p-5 sm:p-6 lg:px-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[15px] font-semibold tracking-[-0.015em]">Экономика проекта</h3>
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px]',
                pending ? 'bg-muted text-ink-3' : failed ? 'bg-warn-soft text-ink-2' : 'bg-ok-soft text-ok',
              )}
              role="status"
            >
              {pending ? (
                <>
                  <Spinner />
                  Пересчитываем…
                </>
              ) : failed ? (
                <>
                  <CircleAlert size={12} />
                  Предыдущий расчёт
                </>
              ) : (
                <>
                  <Check size={12} />
                  Расчёт готов
                </>
              )}
            </span>
          </div>
          <div aria-busy={pending}>
            <dl className="rounded-xl bg-[#293831] px-5 py-5 text-[#f5f5ed] sm:px-6">
              <dt className="flex items-center gap-2 text-[12px] text-[#c8d2c9]">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-[#ff986e]" />
                Окупаемость
              </dt>
              <dd className="mt-2">
                <span
                  className={cn(
                    'num block text-[36px] leading-tight font-semibold tracking-[-0.045em] sm:text-[44px]',
                    pending && 'opacity-40',
                  )}
                >
                  {formatYears(metrics.payback_years)}
                </span>
                <span className="mt-2 block text-[11px] text-[#c8d2c9]">Срок возврата первоначальных вложений</span>
              </dd>
            </dl>
            <dl className="mt-5 grid gap-4 min-[400px]:grid-cols-2 min-[400px]:gap-5 sm:gap-8">
              {[
                {
                  label: 'Вложения на старте',
                  amount: formatRub(metrics.owner_upfront_rub ?? metrics.capex_rub),
                  hint: 'первоначальные расходы',
                },
                {
                  label: 'Эффект в год',
                  amount: formatRub(metrics.effect_rub_year),
                  hint: 'после расходов на роботизацию',
                },
              ].map((stat, index) => (
                <div
                  key={stat.label}
                  className={cn(
                    'min-w-0',
                    index > 0 &&
                      'border-t border-line pt-4 min-[400px]:border-t-0 min-[400px]:border-l min-[400px]:pt-0 min-[400px]:pl-5 sm:pl-8',
                  )}
                >
                  <dt className="text-[12px] text-ink-3">{stat.label}</dt>
                  <dd className="mt-1.5">
                    <span
                      className={cn(
                        'num block text-[24px] leading-tight font-semibold tracking-[-0.035em] sm:text-[28px]',
                        pending && 'opacity-40',
                      )}
                    >
                      {stat.amount}
                    </span>
                    <span className="mt-1.5 block text-[11px] leading-relaxed text-ink-3">{stat.hint}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      <div className="grid items-start gap-x-4 border-t border-line px-5 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-6">
        <details className="group min-w-0 text-[12px]">
          <summary className="flex min-h-10 w-fit cursor-pointer list-none items-center gap-2 rounded-sm text-ink-2 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal size={14} className="text-ink-3" />
            Стоимость оборудования
            <span className="num rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-3">
              {Math.round((value.robot_price_multiplier ?? 1) * 100)}%
            </span>
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
          className="min-h-10 justify-self-start px-0 text-[12px] text-ink-3 hover:bg-transparent sm:justify-self-end"
          onClick={() => onChange(INITIAL)}
        >
          <RotateCcw />
          Сбросить условия
        </Button>
      </div>
    </section>
  )
}

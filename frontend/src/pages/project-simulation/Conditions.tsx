import { SlidersHorizontal } from 'lucide-react'
import type { SizingResult } from '@/shared/api/types'
import { COUNT_HINT, type RunConfig } from './runConfig'
import { formatNumber } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { Toggle } from '@/shared/ui/toggle'
import { Segmented } from '@/shared/ui/v0'

/* Условия прогона за одной кнопкой: подпись кнопки — текущие условия, а если они отличаются от расчёта, кнопка
   синяя и внутри сказано, что это проверка «что если», сценарий она не меняет. */
export function Conditions({
  config,
  counts,
  working,
  sizing,
  whatIf,
  onChange,
}: {
  config: RunConfig
  counts: number[]
  working: number
  sizing: SizingResult
  whatIf: string | null
  onChange: (next: Partial<RunConfig>) => void
}) {
  const summary = [
    `${config.count} роб.`,
    config.mode === 'peak' ? 'пик' : 'сутки',
    config.volume ? '+20 %' : null,
    config.failure ? 'отказ 2 ч' : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('shrink-0', whatIf && 'border-info/50 bg-info-soft text-info hover:bg-info-soft/80')}
          title={whatIf ?? 'Условия прогона: как в расчёте'}
        >
          <SlidersHorizontal /> Условия: {summary}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" sideOffset={10} className="w-[22rem] space-y-4 p-4">
        <div>
          <div className="text-[14px] font-semibold">Условия прогона</div>
          <p className={cn('mt-1 text-[12.5px] leading-relaxed', whatIf ? 'text-info' : 'text-ink-3')}>
            {whatIf ??
              `Как в расчёте: ${working} роботов, пиковые часы. Смена условий сразу запускает новый прогон — это проверка «что если», сценарий она не меняет.`}
          </p>
        </div>
        <Field label="Роботов в работе">
          <Segmented
            size="sm"
            value={config.count}
            onChange={(count) => onChange({ count })}
            options={counts.map((n) => ({
              value: n,
              label: n === working ? `${n} ●` : String(n),
              hint: n === working ? COUNT_HINT[sizing.count.source] : undefined,
            }))}
          />
        </Field>
        <Field label="Режим">
          <Segmented
            size="sm"
            value={config.mode}
            onChange={(mode) => onChange({ mode })}
            options={[
              {
                value: 'peak',
                label: 'Пиковые часы',
                hint: `${formatNumber(sizing.demand_peak_per_hour)} ед/ч без передышки, как в переборе флота`,
              },
              {
                value: 'normal',
                label: 'Обычный день',
                hint: `Сутки: ${formatNumber(sizing.demand_avg_per_hour)} ед/ч в среднем, пик в середине смены`,
              },
            ]}
          />
        </Field>
        <Field label="Стресс-тест">
          <div className="flex gap-1.5">
            <Toggle
              size="sm"
              variant="outline"
              pressed={config.volume}
              onPressedChange={(volume) => onChange({ volume })}
              title="Объём задач на 20 % больше"
            >
              +20 % объёма
            </Toggle>
            <Toggle
              size="sm"
              variant="outline"
              pressed={config.failure}
              onPressedChange={(failure) => onChange({ failure })}
              title="Один робот выходит из строя на 2 часа"
            >
              Отказ робота на 2 ч
            </Toggle>
          </div>
        </Field>
      </PopoverContent>
    </Popover>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="hud mb-1.5">{label}</div>
      {children}
    </div>
  )
}

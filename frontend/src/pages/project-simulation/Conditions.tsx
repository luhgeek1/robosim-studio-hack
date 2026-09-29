import type { ReactNode } from 'react'
import type { SizingResult } from '@/shared/api/types'
import { COUNT_HINT, type RunConfig } from './runConfig'
import { formatNumber } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Toggle } from '@/shared/ui/toggle'
import { Segmented } from '@/shared/ui/v0'

/* Песочница — первая строка экрана: число роботов, режим и стресс-тесты видны сразу, любая смена запускает прогон.
   Если условия отличаются от расчёта, строка говорит, что это проверка «что если» и сценарий она не меняет. */
export function Conditions({
  config,
  counts,
  working,
  sizing,
  whatIf,
  processes,
  onProcess,
  onChange,
}: {
  config: RunConfig
  counts: number[]
  working: number
  sizing: SizingResult
  whatIf: string | null
  processes: { key: string; label: string }[]
  onProcess: (key: string) => void
  onChange: (next: Partial<RunConfig>) => void
}) {
  return (
    <section className={cn('border-b border-line px-4 py-3 sm:px-5', whatIf && 'bg-info-soft/40')}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {processes.length > 1 && (
          <Field label="Процесс">
            <Segmented
              size="sm"
              value={sizing.process_key}
              onChange={onProcess}
              options={processes.map((p) => ({ value: p.key, label: p.label }))}
            />
          </Field>
        )}
        <Field label="Роботов">
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
                label: 'Пик',
                hint: `${formatNumber(sizing.demand_peak_per_hour)} ед/ч без передышки, как в переборе флота`,
              },
              {
                value: 'normal',
                label: 'Сутки',
                hint: `Сутки: ${formatNumber(sizing.demand_avg_per_hour)} ед/ч в среднем, пик в середине смены`,
              },
            ]}
          />
        </Field>
        <Field label="Стресс">
          <div className="flex flex-wrap gap-1.5">
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
      </div>
      <p className={cn('mt-2 text-[12.5px] leading-relaxed', whatIf ? 'text-info' : 'text-ink-3')}>
        {whatIf ??
          `Как в расчёте: ${working} ${working === 1 ? 'робот' : 'роботов'} в работе, пиковые часы. Меняйте условия — прогон запустится сразу; сценарий меняет только перебор флота ниже.`}
      </p>
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="hud shrink-0">{label}</span>
      {children}
    </div>
  )
}

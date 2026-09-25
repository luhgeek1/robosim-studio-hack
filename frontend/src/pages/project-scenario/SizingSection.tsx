import { Bot, Timer } from 'lucide-react'
import type { SizingResult } from '@/shared/api/types'
import { formatNumber, formatPct, isNum } from '@/shared/lib/format'
import { Section } from '@/shared/ui/page'
import { cn } from '@/shared/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'

const COUNT_SOURCE_LABEL = {
  analytic: 'по циклу',
  simulated: 'по имитации',
  manual: 'задано вручную',
} as const

export function SizingSection({ sizing, onTrace }: { sizing: SizingResult[]; onTrace: (query: string) => void }) {
  if (sizing.length === 0) return null
  return (
    <Section
      title="Сколько роботов нужно: паспорт против физики"
      description="Производительность считается из времени цикла на планировке объекта, а не из паспорта"
    >
      <div className="space-y-4">
        {sizing.map((s) => (
          <SizingCard key={`${s.process_key}-${s.product_id}`} sizing={s} onTrace={onTrace} />
        ))}
      </div>
    </Section>
  )
}

function SizingCard({ sizing, onTrace }: { sizing: SizingResult; onTrace: (query: string) => void }) {
  const { robot, count } = sizing
  const cycleTotal = robot.cycle_components?.reduce((sum, c) => sum + c.seconds, 0) ?? 0

  return (
    <div className="rounded-md border bg-raised/40 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-medium">{sizing.product_name}</div>
          <div className="text-xs text-muted-foreground">
            Спрос в пик {formatNumber(sizing.demand_peak_per_hour)} ед/ч
            {isNum(sizing.demand_avg_per_hour) && `, в среднем ${formatNumber(sizing.demand_avg_per_hour)} ед/ч`}
          </div>
        </div>
        <button
          type="button"
          className="text-xs font-medium text-ink-3 transition-colors hover:text-ink"
          onClick={() => onTrace(sizing.process_key)}
        >
          Трасса расчёта процесса
        </button>
      </div>

      <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Timer className="size-3.5" /> Цикл робота
          </div>
          {robot.cycle_components && robot.cycle_components.length > 0 ? (
            <>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                {robot.cycle_components.map((c, i) => (
                  <div
                    key={c.key}
                    className={['bg-ink', 'bg-warn', 'bg-ok', 'bg-ink-4', 'bg-crit'][i % 5]}
                    style={{ width: `${(c.seconds / (cycleTotal || 1)) * 100}%` }}
                  />
                ))}
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {robot.cycle_components.map((c) => (
                    <tr key={c.key}>
                      <td className="py-0.5 text-muted-foreground">{c.name}</td>
                      <td className="num py-0.5 text-right">{formatNumber(c.seconds, 1)} с</td>
                    </tr>
                  ))}
                  <tr className="border-t font-medium">
                    <td className="py-0.5">Время цикла</td>
                    <td className="num py-0.5 text-right">{formatNumber(robot.cycle_time_s, 1)} с</td>
                  </tr>
                </tbody>
              </table>
            </>
          ) : (
            <div className="text-xs text-muted-foreground">
              У модели нет цикла (площадь или станция) либо количество задано вручную.
            </div>
          )}
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="text-muted-foreground">Производительность одного робота</div>
          <Row label="По циклу (3600 / цикл)" value={robot.nominal_throughput_per_hour} unit="ед/ч" />
          <Row label="Доступность (зарядка, простои)" value={robot.availability} share />
          <Row label="Целевая загрузка" value={robot.utilization_target} share />
          <Row label="Эффективная" value={robot.effective_throughput_per_hour} unit="ед/ч" strong />
          {isNum(robot.vendor_claim_per_hour) && (
            <Row label="Заявлено производителем" value={robot.vendor_claim_per_hour} unit="ед/ч" muted />
          )}
          <Row label="Покрытие пика парком" value={sizing.coverage_of_peak} share />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Bot className="size-3.5" /> Количество
          </div>
          <div className="flex items-end gap-4">
            <CountCell label="по циклу" value={count.analytic} />
            <CountCell label="имитация" value={count.simulated} />
            <CountCell label="резерв" value={count.reserve} prefix="+" />
            <div className="ml-auto text-right">
              <div className="num text-3xl leading-none font-semibold">{count.final}</div>
              <div className="text-xs text-muted-foreground">итого</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
            <span className="flex items-center gap-1.5 font-medium text-ink-2">
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  count.source === 'simulated' ? 'bg-ok' : count.source === 'manual' ? 'bg-warn' : 'bg-ink',
                )}
              />
              {COUNT_SOURCE_LABEL[count.source]}
            </span>
            <span className="num">зарядок: {sizing.chargers_count}</span>
            {isNum(sizing.stations_count) && <span className="num">станций: {sizing.stations_count}</span>}
          </div>
          {count.explanation && <p className="text-xs text-muted-foreground">{count.explanation}</p>}
        </div>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  unit,
  share,
  strong,
  muted,
}: {
  label: string
  value: number | null | undefined
  unit?: string
  share?: boolean
  strong?: boolean
  muted?: boolean
}) {
  const text = share ? formatPct(value, { share: true, digits: 0 }) : `${formatNumber(value)} ${unit ?? ''}`
  return (
    <div className={`flex justify-between gap-2 ${muted ? 'text-muted-foreground' : ''}`}>
      <span className={muted ? '' : 'text-muted-foreground'}>{label}</span>
      <span className={`num ${strong ? 'font-semibold' : ''}`}>{isNum(value) ? text : '—'}</span>
    </div>
  )
}

function CountCell({ label, value, prefix }: { label: string; value: number | null | undefined; prefix?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="text-center">
          <div className="num text-lg leading-none font-medium">{isNum(value) ? `${prefix ?? ''}${value}` : '—'}</div>
          <div className="text-[11px] text-muted-foreground">{label}</div>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {label === 'имитация' && !isNum(value)
          ? 'Имитация ещё не запускалась'
          : `${label}: ${isNum(value) ? value : '—'}`}
      </TooltipContent>
    </Tooltip>
  )
}

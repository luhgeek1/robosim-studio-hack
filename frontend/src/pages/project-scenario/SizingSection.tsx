import { Bot, Timer } from 'lucide-react'
import type { SizingResult } from '@/shared/api/types'
import { formatNumber, formatPct, isNum } from '@/shared/lib/format'
import { Section } from '@/shared/ui/page'
import { ToneBadge } from '@/shared/ui/tone'
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
      title="Сколько роботов нужно — паспорт против физики"
      description="Производительность считается из времени цикла на планировке этого объекта, а не из паспорта. Итоговое N берётся из имитации, когда она есть."
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
    <div className="rounded-lg border p-4">
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
          className="text-xs text-primary hover:underline"
          onClick={() => onTrace(sizing.process_key)}
        >
          Трасса расчёта процесса →
        </button>
      </div>

      <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Timer className="size-3.5" /> Цикл робота
          </div>
          {robot.cycle_components && robot.cycle_components.length > 0 ? (
            <>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                {robot.cycle_components.map((c, i) => (
                  <div
                    key={c.key}
                    className={['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5'][i % 5]}
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
          <div className="font-medium text-muted-foreground">Производительность одного робота</div>
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
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
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
          <div className="flex flex-wrap gap-1.5">
            <ToneBadge tone={count.source === 'simulated' ? 'ok' : count.source === 'manual' ? 'warn' : 'info'}>
              {COUNT_SOURCE_LABEL[count.source]}
            </ToneBadge>
            <ToneBadge tone="muted">зарядок: {sizing.chargers_count}</ToneBadge>
            {isNum(sizing.stations_count) && <ToneBadge tone="muted">станций: {sizing.stations_count}</ToneBadge>}
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
          ? 'Имитация ещё не запускалась — появится с движком DES'
          : `${label}: ${isNum(value) ? value : '—'}`}
      </TooltipContent>
    </Tooltip>
  )
}

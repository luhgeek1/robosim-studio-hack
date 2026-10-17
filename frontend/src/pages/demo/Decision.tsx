import { useState } from 'react'
import { Info } from 'lucide-react'
import type { DemoChanges, DemoResult, DemoSnapshot } from '@/entities/demo/api'
import type { CalculationRun } from '@/shared/api/types'
import { formatNumber, formatRub, formatYears } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Section } from '@/shared/ui/page'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { GuestScreen } from './GuestScreen'
import { Evidence } from './Evidence'
import { Economy } from './Economy'
import { FleetCheckTeaser, type FleetCheckState } from './FleetCheck'

export function Decision({
  demo,
  current,
  result,
  pending,
  failed,
  value,
  onChange,
  onRetry,
  fleet,
}: {
  demo: DemoSnapshot
  current: CalculationRun
  result?: DemoResult
  pending: boolean
  failed: string | null
  value: DemoChanges
  onChange: (v: DemoChanges) => void
  onRetry: () => void
  fleet: FleetCheckState
}) {
  const [comparing, setComparing] = useState(false)
  const m = current.metrics
  return (
    <GuestScreen
      title="Подбор роботов и расчёт эффекта"
      lead="Подобранный парк, стоимость и окупаемость — в одном месте."
    >
      <div className="space-y-6">
        {failed && (
          <div className="rounded-lg border border-crit/20 bg-crit-soft p-4 text-[13px] text-crit" role="alert">
            Новые условия не рассчитаны: {failed}. Показан последний успешный результат.{' '}
            <Button variant="outline" size="sm" onClick={onRetry}>
              Повторить
            </Button>
          </div>
        )}
        <Economy metrics={m} value={value} pending={pending} failed={failed} onChange={onChange} />
        <div className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-2">
          <Info size={16} className="mt-0.5 shrink-0 text-ink-3" />
          <p>
            {current.interpretation.headline}
            {result && !result.simulation_valid && fleet.changedVolume && (
              <span className="mt-1 block text-warn">
                Нагрузка изменилась: этот парк нужно заново проверить имитацией.
              </span>
            )}
          </p>
        </div>
        <FleetCheckTeaser demo={demo} fleet={fleet} />
        <Evidence demo={demo} calculation={current} />
        <Section
          title="Сравнение способов внедрения"
          actions={
            <Button variant="outline" size="sm" onClick={() => setComparing(!comparing)} aria-expanded={comparing}>
              {comparing ? 'Свернуть' : 'Показать сравнение'}
            </Button>
          }
          description="Подготовленное сравнение покупки, услуги, лизинга и работы без роботов. После проверки имитацией, без пробных изменений."
        >
          {comparing ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Вариант</TableHead>
                  <TableHead>Вложения на старте</TableHead>
                  <TableHead>Эффект в год</TableHead>
                  <TableHead>Окупаемость</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {demo.comparison.scenarios.map((s) => (
                  <TableRow key={s.scenario_id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{formatRub(s.metrics.owner_upfront_rub ?? s.metrics.capex_rub)}</TableCell>
                    <TableCell>{s.kind === 'baseline' ? '—' : formatRub(s.metrics.effect_rub_year)}</TableCell>
                    <TableCell>{s.kind === 'baseline' ? '—' : formatYears(s.metrics.payback_years)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-[13px] text-ink-3">
              Для первого расчёта достаточно выбрать способ внедрения выше. Подробное сравнение можно раскрыть отдельно.
            </p>
          )}
        </Section>
        <span className="sr-only" role="status">
          {pending
            ? 'Расчёт обновляется'
            : `Парк ${formatNumber(m.robots_total)} роботов, окупаемость ${formatYears(m.payback_years)}`}
        </span>
      </div>
    </GuestScreen>
  )
}

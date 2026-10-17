import { useState } from 'react'
import { Check, Info, RotateCcw } from 'lucide-react'
import type { DemoChanges, DemoResult, DemoSnapshot } from '@/entities/demo/api'
import type { CalculationRun } from '@/shared/api/types'
import { formatNumber, formatRub, formatYears } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Section, Stat, StatStrip } from '@/shared/ui/page'
import { Spinner } from '@/shared/ui/states'
import { Segmented } from '@/shared/ui/v0'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { GuestScreen } from './GuestScreen'
import { Evidence } from './Evidence'
import { DemoField } from './DemoField'
import { INITIAL } from './defaults'

export function Decision({
  demo,
  current,
  result,
  pending,
  failed,
  value,
  onChange,
  onRetry,
}: {
  demo: DemoSnapshot
  current: CalculationRun
  result?: DemoResult
  pending: boolean
  failed: string | null
  value: DemoChanges
  onChange: (v: DemoChanges) => void
  onRetry: () => void
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
            Новые условия не рассчитаны: {failed}. Ниже — исходный пример.{' '}
            <Button variant="outline" size="sm" onClick={onRetry}>
              Повторить
            </Button>
          </div>
        )}
        <Section
          title="Способ внедрения"
          actions={
            <span className="flex items-center gap-2 text-[12px] text-ink-3" role="status">
              {pending ? (
                <>
                  <Spinner />
                  Пересчитываем…
                </>
              ) : failed ? (
                'Не рассчитано'
              ) : (
                <>
                  <Check size={14} className="text-ok" />
                  Расчёт готов
                </>
              )}
            </span>
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Segmented
              value={value.scenario_kind ?? 'purchase'}
              onChange={(scenario_kind) => onChange({ ...value, scenario_kind })}
              options={[
                { value: 'purchase', label: 'Покупка' },
                { value: 'raas', label: 'Робот как услуга' },
                { value: 'lease', label: 'Лизинг' },
              ]}
            />
            <Button variant="ghost" size="sm" onClick={() => onChange(INITIAL)}>
              <RotateCcw />
              Исходные условия
            </Button>
          </div>
          <details className="mt-4 border-t border-line pt-3 text-[13px] text-ink-3">
            <summary className="cursor-pointer">Изменить стоимость оборудования</summary>
            <div className="mt-4">
              {' '}
              <div className="max-w-96">
                <DemoField
                  id="demo-price"
                  label="Стоимость роботов относительно каталога"
                  value={value.robot_price_multiplier ?? 1}
                  onChange={(robot_price_multiplier) => onChange({ ...value, robot_price_multiplier })}
                />
              </div>
            </div>
          </details>
        </Section>
        <div aria-busy={pending}>
          <StatStrip columns={3}>
            <Stat label="Окупаемость" value={formatYears(m.payback_years)} hint="при выбранных условиях" />
            <Stat label="Вложения на старте" value={formatRub(m.owner_upfront_rub ?? m.capex_rub)} />
            <Stat
              label="Денежный эффект в год"
              value={formatRub(m.effect_rub_year)}
              hint="после расходов на роботизацию"
            />
          </StatStrip>
        </div>
        <div className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-2">
          <Info size={16} className="mt-0.5 shrink-0 text-ink-3" />
          <p>
            {current.interpretation.headline}
            {result && !result.simulation_valid && (
              <span className="mt-1 block text-warn">
                Нагрузка изменилась: этот парк нужно заново проверить имитацией.
              </span>
            )}
          </p>
        </div>
        <Evidence demo={demo} calculation={current} />
        <Section
          title="Сравнение способов внедрения"
          actions={
            <Button variant="outline" size="sm" onClick={() => setComparing(!comparing)} aria-expanded={comparing}>
              {comparing ? 'Свернуть' : 'Показать сравнение'}
            </Button>
          }
          description="Покупка, услуга, лизинг и работа без роботов. Исходные условия примера."
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

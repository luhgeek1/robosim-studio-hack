import { useState } from 'react'
import type { CalculationRun } from '@/shared/api/types'
import { formatNumber, formatPct, formatRub, formatYears } from '@/shared/lib/format'
import { Section, Stat, StatStrip } from '@/shared/ui/page'
import { Segmented } from '@/shared/ui/v0'
import { CashflowChart } from './CashflowChart'

export function FinancialFlows({ run }: { run: CalculationRun }) {
  const [perspective, setPerspective] = useState<'project' | 'owner'>('project')
  const owner = perspective === 'owner' && run.owner_cashflow != null
  const flow = owner ? run.owner_cashflow! : run.cashflow
  const m = run.metrics
  return (
    <Section
      title="Денежный поток"
      description="Проект и собственные средства оцениваются отдельно, каждый со своей ставкой"
    >
      <div className="space-y-4">
        {run.owner_cashflow && (
          <Segmented
            size="sm"
            value={perspective}
            onChange={setPerspective}
            options={[
              { value: 'project', label: 'Проект' },
              { value: 'owner', label: 'Собственные средства' },
            ]}
          />
        )}
        <p className="text-sm text-ink-3">
          {owner
            ? 'Собственный взнос и все платежи по кредиту или лизингу. Остаток долга на конце горизонта погашается в последнем периоде.'
            : 'Полные вложения в момент 0 и операционный эффект. Кредит и его обслуживание исключены; платежи за услугу RaaS учтены.'}{' '}
          Цены оборудования и облагаемых услуг — с НДС, его вычет не моделируется. Потоки — до налога на прибыль.
          Номинальный и дисконтированный потоки начинаются с одинаковых вложений.
        </p>
        <StatStrip columns={4}>
          <Stat
            label={owner ? 'NPV собственных средств' : 'NPV проекта'}
            value={formatRub(owner ? m.owner_npv_rub : m.npv_rub)}
            hint={`ставка ${formatPct(owner ? m.owner_discount_rate_pct : m.discount_rate_pct)}`}
          />
          <Stat label="IRR, годовая" value={formatPct(owner ? m.owner_irr_pct : m.irr_pct)} />
          <Stat
            label="ROI за горизонт"
            value={formatPct(owner ? m.owner_roi_pct : m.roi_pct)}
            hint={flow.upfront_rub === 0 ? 'Не определён при нулевых вложениях' : 'Вложения уже вычтены из потока'}
          />
          <Stat
            label="Окупаемость с дисконтом"
            value={formatYears(owner ? m.owner_discounted_payback_years : m.discounted_payback_years)}
          />
        </StatStrip>
        <CashflowChart yearly={flow.yearly} monthly={flow.monthly} upfront={flow.upfront_rub ?? 0} />
        <p className="text-xs text-ink-3">
          Внедрение и разгон: {flow.ramp_up_months ?? 0} мес. Индексация, замены и остаточная стоимость учтены
          помесячно. Ставки меняются в параметрах сценария и нормативе «Ставка дисконтирования собственных средств до
          налога».
        </p>
      </div>
    </Section>
  )
}

export function LaborEffect({ run }: { run: CalculationRun }) {
  const m = run.metrics
  if (m.labor_cash_realization_pct == null) return null
  return (
    <Section
      title="Трудоёмкость и денежная экономия"
      description="Ручной процесс считается независимо от скорости и грузоподъёмности выбранного робота"
    >
      <StatStrip columns={4}>
        <Stat
          label="Высвобождаемая трудоёмкость"
          value={`${formatNumber(m.fte_released, 1)} FTE`}
          hint={`${formatNumber(m.labor_hours_released_year, 0)} человеко-часов в год`}
        />
        <Stat
          label="Стоимость высвобождения"
          value={formatRub(m.labor_potential_savings_rub_year)}
          hint="потенциал ФОТ в год"
        />
        <Stat
          label="Денежная реализация"
          value={formatPct(m.labor_cash_realization_pct)}
          hint="редактируемое допущение сценария"
        />
        <Stat
          label="Ожидаемая экономия ФОТ"
          value={formatRub(m.labor_savings_rub_year)}
          hint="в год; входит в денежный поток"
        />
      </StatStrip>
      <p className="mt-3 text-sm text-ink-3">
        FTE показывает объём высвобождаемой работы. Для снижения затрат нужен план сокращения сверхурочных, замещения
        вакансий или изменения численности. Если сотрудники остаются на других задачах без сокращения затрат, установите
        «Долю высвобождённого труда, превращающуюся в денежную экономию» в 0. Значение 100% — оптимистичное допущение.
      </p>
    </Section>
  )
}

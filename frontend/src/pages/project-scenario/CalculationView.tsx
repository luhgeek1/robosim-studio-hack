import { ChevronDown, ShieldAlert, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { SOURCE_KIND_LABEL, SourceLink } from '@/entities/provenance'
import { BAND_LABEL, RISK_SEVERITY_LABEL, VERDICT_LABEL, useNarrative, type Verdict } from '@/entities/scenario'
import type { CalculationRun, CostBreakdown } from '@/shared/api/types'
import {
  formatDateTime,
  formatNumber,
  formatPct,
  formatRub,
  formatValue,
  formatYears,
  pluralRu,
} from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible'
import { Section, Stat, StatStrip } from '@/shared/ui/page'
import { Segmented } from '@/shared/ui/v0'
import { CashflowChart } from './CashflowChart'
import { CostTable, type CostRow } from './CostTable'
import { SizingSection } from './SizingSection'

const toRows = (breakdown: CostBreakdown | undefined): CostRow[] =>
  (breakdown?.items ?? []).map((item) => ({
    key: item.key,
    name: item.name,
    amount: item.amount_rub,
    formula: item.formula,
    formulaRendered: item.formula_rendered,
    inputs: item.inputs,
    note: item.note,
    normKey: item.norm_key,
  }))

const SEVERITY_DOT: Record<'low' | 'medium' | 'high', string> = { low: 'bg-ink-4', medium: 'bg-warn', high: 'bg-crit' }

export function CalculationView({
  run,
  isBaseline,
  onTrace,
  locked = false,
}: {
  run: CalculationRun
  isBaseline: boolean
  onTrace: (query: string) => void
  locked?: boolean
}) {
  const m = run.metrics
  const effectRows: CostRow[] = run.effect_year.items.map((item) => ({
    key: item.key,
    name: item.name,
    amount: item.amount_rub_year,
    formula: item.formula,
    formulaRendered: item.formula_rendered,
    inputs: item.inputs,
    hint: item.fte_released ? `высвобождается ${formatNumber(item.fte_released, 1)} ставки` : null,
  }))

  return (
    <div className="space-y-6">
      {!isBaseline && <VerdictBlock run={run} />}

      {isBaseline ? (
        <StatStrip columns={3}>
          <Stat label="Затраты «как сейчас»" value={formatRub(m.baseline_cost_rub_year)} hint="в год" />
          <Stat
            label="TCO за горизонт"
            value={formatRub(m.tco_baseline_rub)}
            hint={`${m.horizon_years} ${pluralRu(m.horizon_years, ['год', 'года', 'лет'])} с индексацией`}
          />
          <Stat label="Ставка дисконтирования" value={formatPct(m.discount_rate_pct)} />
        </StatStrip>
      ) : (
        <StatStrip columns={4}>
          <Stat label="CAPEX" value={formatRub(m.capex_rub)} hint="с НДС" />
          <Stat label="OPEX роботизации" value={formatRub(m.opex_rub_year)} hint="в год" />
          <Stat
            label="Чистый эффект"
            value={formatRub(m.effect_rub_year)}
            valueClassName="text-ok"
            hint="в год, после OPEX"
          />
          <Stat
            label="NPV"
            value={formatRub(m.npv_rub)}
            valueClassName={(m.npv_rub ?? 0) < 0 ? 'text-crit' : undefined}
            hint={`ставка ${formatPct(m.discount_rate_pct)}, ${m.horizon_years} ${pluralRu(m.horizon_years, ['год', 'года', 'лет'])}`}
          />
          <Stat label="IRR" value={formatPct(m.irr_pct)} />
          <Stat label="ROI за горизонт" value={formatPct(m.roi_pct)} />
          <Stat
            label="TCO за горизонт"
            value={formatRub(m.tco_rub)}
            hint={`как сейчас: ${formatRub(m.tco_baseline_rub)}`}
          />
          <Stat
            label="Роботов / высвобождается ставок"
            value={`${m.robots_total ?? '—'} / ${formatNumber(m.fte_released, 1)}`}
          />
        </StatStrip>
      )}

      {!isBaseline && (
        <SizingSection scenarioId={run.scenario_id} sizing={run.sizing} onTrace={onTrace} locked={locked} />
      )}

      <Section
        title="Из чего складываются деньги"
        description="Строка раскрывается в формулу, подставленные значения и источники входов"
        actions={
          <button
            type="button"
            className="text-[13px] font-medium text-ink-3 transition-colors hover:text-ink"
            onClick={() => onTrace('')}
          >
            Полная трасса расчёта
          </button>
        }
      >
        <CostTabs run={run} isBaseline={isBaseline} effectRows={effectRows} />
      </Section>

      {!isBaseline && (
        <Section
          title="Денежный поток"
          description={
            run.cashflow.ramp_up_months
              ? `Разгон до полного эффекта ${run.cashflow.ramp_up_months} мес.; индексация и замены АКБ учтены помесячно`
              : undefined
          }
        >
          <CashflowChart yearly={run.cashflow.yearly} monthly={run.cashflow.monthly} />
        </Section>
      )}

      {(run.risks.length > 0 || (run.warnings?.length ?? 0) > 0) && (
        <div className="grid grid-cols-2 gap-6">
          <Section title="Риски">
            {run.risks.length === 0 ? (
              <p className="text-muted-foreground">Существенных рисков не найдено.</p>
            ) : (
              <ul className="space-y-3">
                {run.risks.map((risk) => (
                  <li key={risk.code} className="flex gap-3">
                    <ShieldAlert
                      className={cn('mt-0.5 size-4 shrink-0', risk.severity === 'high' ? 'text-crit' : 'text-warn')}
                    />
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2 font-medium">
                        {risk.title}
                        <span className="flex items-center gap-1.5 text-[12px] font-normal text-ink-3">
                          <span className={cn('size-1.5 rounded-full', SEVERITY_DOT[risk.severity])} />
                          {RISK_SEVERITY_LABEL[risk.severity]}
                        </span>
                      </div>
                      <div className="text-muted-foreground">{risk.description}</div>
                      {risk.mitigation && <div className="text-xs">Что сделать: {risk.mitigation}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Предупреждения расчёта">
            <ul className="space-y-2">
              {(run.warnings ?? []).map((w) => (
                <li key={w} className="flex gap-2 text-muted-foreground">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
                  {w}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      {!isBaseline && run.calibration && <Calibration calibration={run.calibration} />}

      {run.assumptions_used && run.assumptions_used.length > 0 && <Assumptions norms={run.assumptions_used} />}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Рассчитано {formatDateTime(run.versions.computed_at)}</span>
        <span>за {run.duration_ms ?? '—'} мс</span>
        <span>данные объекта v{run.versions.project_version}</span>
        {run.versions.layout_version != null && <span>планировка v{run.versions.layout_version}</span>}
        <span>каталог {run.versions.catalog_version}</span>
        <span>нормативы {run.versions.norm_set_version}</span>
      </div>
    </div>
  )
}

const VERDICT_DOT: Record<Verdict, string> = {
  attractive: 'bg-ok',
  reasonable: 'bg-ink',
  questionable: 'bg-warn',
  not_recommended: 'bg-crit',
  insufficient_data: 'bg-ink-4',
  baseline: 'bg-ink-4',
}

/* Вердикт и заключение говорят одно и то же; из заключения берём только следующие шаги. */
function VerdictBlock({ run }: { run: CalculationRun }) {
  const interpretation = run.interpretation
  const narrative = useNarrative(run.id)
  const nextSteps = narrative.data?.next_steps ?? []
  const verdict = interpretation.verdict as Verdict
  const m = run.metrics
  const columns = [
    interpretation.key_drivers?.length ? (
      <List key="drivers" title="Что определяет результат" items={interpretation.key_drivers} dot="bg-ink" />
    ) : null,
    interpretation.caveats?.length ? (
      <List key="caveats" title="Оговорки" items={interpretation.caveats} dot="bg-ink-4" muted />
    ) : null,
    nextSteps.length ? <List key="next" title="Следующие шаги" items={nextSteps} dot="bg-warn" /> : null,
  ].filter(Boolean)
  return (
    <section className="card overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 px-7 py-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
            <span className="flex items-center gap-1.5 font-medium text-ink">
              <span className={cn('size-2 rounded-full', VERDICT_DOT[verdict] ?? 'bg-ink-4')} />
              {VERDICT_LABEL[verdict] ?? interpretation.verdict}
            </span>
            {BAND_LABEL[interpretation.band] && <span className="text-ink-3">{BAND_LABEL[interpretation.band]}</span>}
          </div>
          <h2 className="h2 mt-3">{interpretation.headline}</h2>
          <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-ink-3">{interpretation.summary}</p>
        </div>
        <div className="flex flex-col justify-center border-t border-line bg-surface-2 px-7 py-6 lg:border-t-0 lg:border-l">
          <div className="display num text-[44px]">{formatYears(m.payback_years)}</div>
          <div className="meta mt-1.5">до окупаемости</div>
          <div className="mt-4 text-[13px] text-ink-2">
            дисконтированная <span className="num font-medium text-ink">{formatYears(m.discounted_payback_years)}</span>
          </div>
        </div>
      </div>
      {columns.length > 0 && (
        <div
          className="grid gap-8 border-t border-line px-7 py-6"
          style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
        >
          {columns}
        </div>
      )}
    </section>
  )
}

function List({ title, items, dot, muted }: { title: string; items: string[]; dot: string; muted?: boolean }) {
  return (
    <div>
      <div className="mb-2.5 text-[13px] text-ink-2">{title}</div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item} className={cn('flex gap-2.5 text-[13.5px] leading-snug', muted ? 'text-ink-3' : 'text-ink')}>
            <span className={cn('mt-1.75 size-1.5 shrink-0 rounded-full', dot)} />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

type CostTab = 'capex' | 'opex' | 'effect' | 'baseline' | 'after'

function CostTabs({
  run,
  isBaseline,
  effectRows,
}: {
  run: CalculationRun
  isBaseline: boolean
  effectRows: CostRow[]
}) {
  const [tab, setTab] = useState<CostTab>(isBaseline ? 'baseline' : 'capex')
  const options: { value: CostTab; label: string }[] = [
    ...(isBaseline
      ? []
      : ([
          { value: 'capex', label: 'CAPEX' },
          { value: 'opex', label: 'OPEX в год' },
          { value: 'effect', label: 'Эффект в год' },
        ] as const)),
    { value: 'baseline', label: 'Как сейчас' },
    ...(!isBaseline && run.scenario_cost_year ? [{ value: 'after' as const, label: 'После роботизации' }] : []),
  ]
  return (
    <div className="space-y-3">
      <Segmented size="sm" value={tab} onChange={setTab} options={options} />
      {tab === 'capex' && <CostTable rows={toRows(run.capex)} total={run.capex.total_rub} totalLabel="CAPEX, с НДС" />}
      {tab === 'opex' && (
        <CostTable
          rows={toRows(run.opex_year)}
          total={run.opex_year.total_rub}
          totalLabel="OPEX роботизации"
          unitSuffix="/год"
        />
      )}
      {tab === 'effect' && (
        <CostTable
          rows={effectRows}
          total={run.effect_year.total_rub_year}
          totalLabel="Чистый эффект"
          unitSuffix="/год"
        />
      )}
      {tab === 'baseline' && (
        <CostTable
          rows={toRows(run.baseline_cost_year)}
          total={run.baseline_cost_year.total_rub}
          totalLabel="Затраты «как сейчас»"
          unitSuffix="/год"
        />
      )}
      {tab === 'after' && run.scenario_cost_year && (
        <CostTable
          rows={toRows(run.scenario_cost_year)}
          total={run.scenario_cost_year.total_rub}
          totalLabel="Затраты после роботизации"
          unitSuffix="/год"
        />
      )}
    </div>
  )
}

function Calibration({ calibration }: { calibration: NonNullable<CalculationRun['calibration']> }) {
  const ok = calibration.within_tolerance
  return (
    <Section
      title="Сверка с методикой ФЦ БАС"
      description={calibration.reference}
      actions={
        ok == null ? null : (
          <span className={cn('flex items-center gap-1.5 text-[12.5px] font-medium', ok ? 'text-ok' : 'text-warn')}>
            <span className={cn('size-1.5 rounded-full', ok ? 'bg-ok' : 'bg-warn')} />
            {ok ? 'в допуске' : 'расхождение разложено по статьям'}
          </span>
        )
      }
    >
      {calibration.checks && calibration.checks.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-normal">Показатель модельного кейса</th>
              <th className="py-1 text-right font-normal">Наш расчёт</th>
              <th className="py-1 text-right font-normal">ФЦ БАС</th>
              <th className="py-1 text-right font-normal">Отклонение</th>
            </tr>
          </thead>
          <tbody>
            {calibration.checks.map((check) => {
              const within = check.tolerance_pct == null || Math.abs(check.deviation_pct) <= check.tolerance_pct
              return (
                <tr key={check.key} className="border-t">
                  <td className="py-1.5">{check.name}</td>
                  <td className="num py-1.5 text-right">{formatValue(check.ours, check.unit)}</td>
                  <td className="num py-1.5 text-right">{formatValue(check.reference, check.unit)}</td>
                  <td className={cn('num py-1.5 text-right', within ? 'text-ok' : 'text-warn')}>
                    {formatPct(check.deviation_pct)}
                    {check.tolerance_pct != null && (
                      <span className="text-muted-foreground">
                        {' '}
                        (допуск {formatPct(check.tolerance_pct, { digits: 0 })})
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {calibration.note && <p className="mt-3 text-muted-foreground">{calibration.note}</p>}
    </Section>
  )
}

function Assumptions({ norms }: { norms: NonNullable<CalculationRun['assumptions_used']> }) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border bg-surface">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-5 py-3 text-left">
        <div>
          <div className="text-[15px] font-semibold">Нормативы и допущения расчёта</div>
          <div className="text-xs text-muted-foreground">{norms.length} значений: у каждого источник и обоснование</div>
        </div>
        <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t px-5 pb-5">
        <table className="w-full text-sm">
          <tbody>
            {norms.map((norm) => (
              <tr key={norm.key} className="border-t align-top">
                <td className="py-2 pr-3">
                  <div>{norm.name}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{norm.key}</div>
                </td>
                <td className="num py-2 pr-3 whitespace-nowrap">
                  {formatValue(norm.value, norm.unit)}
                  {norm.range && (
                    <div className="text-xs text-muted-foreground">
                      {formatNumber(norm.range.min)}–{formatNumber(norm.range.max)}
                    </div>
                  )}
                </td>
                <td className="py-2 text-xs">
                  <div>
                    {SOURCE_KIND_LABEL[norm.source.kind]}:{' '}
                    <SourceLink title={norm.source.title} url={norm.source.url} />
                  </div>
                  {norm.rationale && <div className="mt-0.5 text-muted-foreground">{norm.rationale}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CollapsibleContent>
    </Collapsible>
  )
}

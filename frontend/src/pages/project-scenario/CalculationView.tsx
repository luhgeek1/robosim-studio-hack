import { BadgeCheck, ChevronDown, ShieldAlert, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { SOURCE_KIND_LABEL, SourceLink } from '@/entities/provenance'
import { BAND_LABEL, RISK_SEVERITY_LABEL, VerdictBadge, useNarrative } from '@/entities/scenario'
import type { CalculationRun, CostBreakdown } from '@/shared/api/types'
import { formatDateTime, formatNumber, formatPct, formatRub, formatValue, formatYears } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible'
import { Section, Stat, StatStrip } from '@/shared/ui/page'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { ToneBadge, type Tone } from '@/shared/ui/tone'
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

const SEVERITY_TONE: Record<'low' | 'medium' | 'high', Tone> = { low: 'muted', medium: 'warn', high: 'crit' }

export function CalculationView({
  run,
  isBaseline,
  onTrace,
}: {
  run: CalculationRun
  isBaseline: boolean
  onTrace: (query: string) => void
}) {
  const m = run.metrics
  const effectRows: CostRow[] = run.effect_year.items.map((item) => ({
    key: item.key,
    name: item.name,
    amount: item.amount_rub_year,
    formula: item.formula,
    formulaRendered: item.formula_rendered,
    inputs: item.inputs,
    hint: item.fte_released ? `высвобождается ${formatNumber(item.fte_released, 1)} FTE` : null,
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
            hint={`${m.horizon_years} лет с индексацией`}
          />
          <Stat label="Ставка дисконтирования" value={formatPct(m.discount_rate_pct)} />
        </StatStrip>
      ) : (
        <StatStrip
          columns={4}
          className="md:divide-x-0 md:[&>*:nth-child(-n+4)]:border-b md:[&>*:not(:nth-child(4n+1))]:border-l"
        >
          <Stat
            label="Окупаемость простая"
            value={formatYears(m.payback_years)}
            hint={`дисконтированная: ${formatYears(m.discounted_payback_years)}`}
          />
          <Stat label="CAPEX" value={formatRub(m.capex_rub)} hint="с НДС" />
          <Stat
            label="Чистый эффект"
            value={formatRub(m.effect_rub_year)}
            hint={`OPEX роботизации ${formatRub(m.opex_rub_year)} в год`}
          />
          <Stat
            label="NPV"
            value={formatRub(m.npv_rub)}
            valueClassName={(m.npv_rub ?? 0) < 0 ? 'text-crit' : undefined}
            hint={`ставка ${formatPct(m.discount_rate_pct)}, ${m.horizon_years} лет`}
          />
          <Stat label="IRR" value={formatPct(m.irr_pct)} />
          <Stat label="ROI за горизонт" value={formatPct(m.roi_pct)} />
          <Stat
            label="TCO за горизонт"
            value={formatRub(m.tco_rub)}
            hint={`как сейчас: ${formatRub(m.tco_baseline_rub)}`}
          />
          <Stat
            label="Роботов / высвобождено"
            value={`${m.robots_total ?? '—'} / ${formatNumber(m.fte_released, 1)} FTE`}
          />
        </StatStrip>
      )}

      {!isBaseline && <SizingSection sizing={run.sizing} onTrace={onTrace} />}

      <Section
        title="Из чего складываются деньги"
        description="Строка раскрывается в формулу, подставленные значения и источники входов"
        actions={
          <button type="button" className="text-sm text-primary hover:underline" onClick={() => onTrace('')}>
            Полная трасса расчёта
          </button>
        }
      >
        <Tabs defaultValue={isBaseline ? 'baseline' : 'capex'}>
          <TabsList>
            {!isBaseline && <TabsTrigger value="capex">CAPEX</TabsTrigger>}
            {!isBaseline && <TabsTrigger value="opex">OPEX в год</TabsTrigger>}
            {!isBaseline && <TabsTrigger value="effect">Эффект в год</TabsTrigger>}
            <TabsTrigger value="baseline">Как сейчас</TabsTrigger>
            {!isBaseline && run.scenario_cost_year && <TabsTrigger value="after">После роботизации</TabsTrigger>}
          </TabsList>
          <TabsContent value="capex">
            <CostTable rows={toRows(run.capex)} total={run.capex.total_rub} totalLabel="CAPEX, с НДС" />
          </TabsContent>
          <TabsContent value="opex">
            <CostTable
              rows={toRows(run.opex_year)}
              total={run.opex_year.total_rub}
              totalLabel="OPEX роботизации"
              unitSuffix="/год"
            />
          </TabsContent>
          <TabsContent value="effect">
            <CostTable
              rows={effectRows}
              total={run.effect_year.total_rub_year}
              totalLabel="Чистый эффект"
              unitSuffix="/год"
            />
          </TabsContent>
          <TabsContent value="baseline">
            <CostTable
              rows={toRows(run.baseline_cost_year)}
              total={run.baseline_cost_year.total_rub}
              totalLabel="Затраты «как сейчас»"
              unitSuffix="/год"
            />
          </TabsContent>
          {run.scenario_cost_year && (
            <TabsContent value="after">
              <CostTable
                rows={toRows(run.scenario_cost_year)}
                total={run.scenario_cost_year.total_rub}
                totalLabel="Затраты после роботизации"
                unitSuffix="/год"
              />
            </TabsContent>
          )}
        </Tabs>
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
                        <ToneBadge tone={SEVERITY_TONE[risk.severity]}>{RISK_SEVERITY_LABEL[risk.severity]}</ToneBadge>
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

/* Вердикт и заключение говорят одно и то же; из заключения берём только следующие шаги. */
function VerdictBlock({ run }: { run: CalculationRun }) {
  const interpretation = run.interpretation
  const narrative = useNarrative(run.id)
  const nextSteps = narrative.data?.next_steps ?? []
  const columns = [
    interpretation.key_drivers?.length ? (
      <List key="drivers" title="Что определяет результат" items={interpretation.key_drivers} />
    ) : null,
    interpretation.caveats?.length ? (
      <List key="caveats" title="Оговорки" items={interpretation.caveats} muted />
    ) : null,
    nextSteps.length ? <List key="next" title="Следующие шаги" items={nextSteps} /> : null,
  ].filter(Boolean)
  return (
    <div className="rounded-lg border border-l-2 border-l-primary bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <VerdictBadge verdict={interpretation.verdict} className="h-6 px-2.5 text-sm" />
        {BAND_LABEL[interpretation.band] && (
          <span className="text-sm text-muted-foreground">{BAND_LABEL[interpretation.band]}</span>
        )}
      </div>
      <h2 className="mt-2 text-xl font-semibold tracking-tight">{interpretation.headline}</h2>
      <p className="mt-1 max-w-4xl text-muted-foreground">{interpretation.summary}</p>
      {columns.length > 0 && (
        <div className="mt-4 grid gap-6" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
          {columns}
        </div>
      )}
    </div>
  )
}

function List({ title, items, muted }: { title: string; items: string[]; muted?: boolean }) {
  return (
    <div>
      <div className="mb-1.5 text-xs text-muted-foreground">{title}</div>
      <ul className={cn('list-disc space-y-1 pl-4', muted && 'text-muted-foreground')}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
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
          <ToneBadge tone={ok ? 'ok' : 'warn'}>
            <BadgeCheck /> {ok ? 'в допуске' : 'расхождение разложено по статьям'}
          </ToneBadge>
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

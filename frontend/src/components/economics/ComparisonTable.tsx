import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { CalculationRun } from '@/api/types'
import { formatPct, formatYears, isNum } from '@/lib/format'
import { SCENARIO_KIND_LABEL } from '@/lib/labels'
import { Hint, Pill } from '../ui'
import { KIND_WORDS, fleetFinal, isRobotized, yearsWord, type ComparisonScenario } from './model'

type Row = { key: string; label: string; hint?: string; render: (s: ComparisonScenario) => ReactNode }

const LABEL_COL = 220

// One decimal everywhere in the table so the columns line up: «0,0», «11,0», «50,2».
const mln = (value: number | null | undefined) =>
  isNum(value) ? (value / 1e6).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'

function Money({
  value,
  prefix = '',
  strong = false,
  crit = false,
}: {
  value: number | null | undefined
  prefix?: string
  strong?: boolean
  crit?: boolean
}) {
  return (
    <span className={`num text-[15px] ${strong ? 'font-semibold' : 'font-medium'} ${crit ? 'text-crit' : ''}`}>
      {prefix}
      {mln(value)} <span className="font-normal text-ink-3">млн ₽</span>
    </span>
  )
}

const None = () => <span className="text-ink-4">—</span>

function buildRows(scenarios: ComparisonScenario[], recommendedId: string | null): Row[] {
  const reference = scenarios.find((s) => s.scenario_id === recommendedId) ?? scenarios.find(isRobotized)
  const horizon = reference?.metrics.horizon_years ?? scenarios[0]?.metrics.horizon_years ?? 5
  const rate = reference?.metrics.discount_rate_pct
  const maxTco = Math.max(1, ...scenarios.map((s) => s.metrics.tco_rub))
  return [
    { key: 'capex', label: 'Инвестиции · CAPEX', render: (s) => <Money value={s.metrics.capex_rub} /> },
    {
      key: 'opex',
      label: 'Расходы в год · OPEX',
      hint: 'ФОТ и эксплуатация роботов',
      render: (s) => (
        <div>
          <Money value={s.metrics.scenario_cost_rub_year ?? s.metrics.baseline_cost_rub_year} />
          {isRobotized(s) && (
            <div className="num mt-0.5 text-[12px] text-ink-3">роботы — {mln(s.metrics.opex_rub_year)} млн ₽</div>
          )}
        </div>
      ),
    },
    {
      key: 'effect',
      label: 'Чистый эффект в год',
      hint: 'экономия минус расходы на роботов',
      render: (s) =>
        isRobotized(s) ? (
          <Money
            value={s.metrics.effect_rub_year}
            prefix={s.metrics.effect_rub_year > 0 ? '+' : ''}
            strong
            crit={s.metrics.effect_rub_year < 0}
          />
        ) : (
          <None />
        ),
    },
    {
      key: 'payback',
      label: 'Окупаемость',
      hint: 'простая; дисконтированная — при наведении',
      render: (s) =>
        isRobotized(s) ? (
          <Hint
            content={`Дисконтированная окупаемость при ставке ${formatPct(s.metrics.discount_rate_pct, { digits: 0 })}: ${formatYears(s.metrics.discounted_payback_years)}`}
          >
            <span
              className={`w-fit cursor-help border-b border-dotted border-ink-4 text-[15px] ${isNum(s.metrics.payback_years) ? 'font-medium' : 'text-crit'}`}
            >
              {formatYears(s.metrics.payback_years)}
            </span>
          </Hint>
        ) : (
          <None />
        ),
    },
    {
      key: 'npv',
      label: 'NPV',
      hint: isNum(rate) ? `при ставке ${formatPct(rate, { digits: 0 })}` : undefined,
      render: (s) =>
        isRobotized(s) ? (
          <Money value={s.metrics.npv_rub} crit={isNum(s.metrics.npv_rub) && s.metrics.npv_rub < 0} />
        ) : (
          <None />
        ),
    },
    {
      key: 'roi',
      label: `ROI за ${yearsWord(horizon)}`,
      render: (s) =>
        isRobotized(s) ? (
          <span className={`num text-[15px] font-medium ${s.metrics.roi_pct < 0 ? 'text-crit' : ''}`}>
            {formatPct(s.metrics.roi_pct, { digits: 0 })}
          </span>
        ) : (
          <None />
        ),
    },
    {
      key: 'tco',
      label: `Стоимость за ${yearsWord(horizon)} · TCO`,
      hint: 'с индексацией зарплат',
      render: (s) => (
        <div>
          <Money value={s.metrics.tco_rub} />
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-black/[0.06]">
            <motion.div
              className={`h-full rounded-full ${s.scenario_id === recommendedId ? 'bg-ink' : 'bg-ink-4'}`}
              initial={false}
              animate={{ width: `${(s.metrics.tco_rub / maxTco) * 100}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 24 }}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'robots',
      label: 'Роботов',
      render: (s) => <span className="num text-[15px] font-medium">{s.metrics.robots_total || '—'}</span>,
    },
  ]
}

function caption(s: ComparisonScenario, calc: CalculationRun | undefined, duplicated: boolean) {
  if (!isRobotized(s)) return 'Ручной процесс, без изменений'
  if (duplicated || !calc?.sizing.length) return s.name
  return `${fleetFinal(calc.sizing)} ${KIND_WORDS[s.kind].own}`
}

export function ComparisonTable({
  scenarios,
  calcs,
  recommendedId,
  selectedId,
  onSelect,
}: {
  scenarios: ComparisonScenario[]
  calcs: Record<string, CalculationRun | undefined>
  recommendedId: string | null
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const rows = buildRows(scenarios, recommendedId)
  const kindCount = (kind: string) => scenarios.filter((s) => s.kind === kind).length
  const grid = { gridTemplateColumns: `${LABEL_COL}px repeat(${scenarios.length}, minmax(0, 1fr))` }
  const cell = (s: ComparisonScenario) =>
    `border-l border-line px-5 transition-colors ${s.scenario_id === selectedId ? 'bg-surface-2' : ''}`

  return (
    <div className="card overflow-hidden">
      <div className="grid items-stretch" style={grid}>
        <div className="border-b border-line" />
        {scenarios.map((s) => {
          const active = s.scenario_id === selectedId
          return (
            <button
              key={s.scenario_id}
              type="button"
              onClick={() => onSelect(s.scenario_id)}
              aria-pressed={active}
              className={`relative border-b border-l border-line px-5 py-4 text-left transition-colors ${active ? 'bg-surface-2' : 'hover:bg-surface-2/60'}`}
            >
              {active && (
                <motion.span layoutId="economics-column" className="absolute inset-x-0 top-0 h-[2px] bg-ink" />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[16px] font-semibold">{SCENARIO_KIND_LABEL[s.kind]}</span>
                {s.scenario_id === recommendedId && <Pill tone="accent">Рекомендуем</Pill>}
                {s.status === 'stale' && <Pill tone="warn">пересчитывается</Pill>}
              </div>
              <div className="mt-0.5 truncate text-[13px] text-ink-3">
                {caption(s, calcs[s.calculation_id], kindCount(s.kind) > 1)}
              </div>
            </button>
          )
        })}
        {rows.map((row) => (
          <RowCells key={row.key} row={row} scenarios={scenarios} cell={cell} onSelect={onSelect} />
        ))}
      </div>
      <div className="grid bg-surface-2/60" style={grid}>
        <div />
        {scenarios.map((s) => (
          <div key={s.scenario_id} className="border-l border-line px-5 py-3 text-[12.5px] leading-relaxed text-ink-3">
            {calcs[s.calculation_id]?.interpretation.headline ?? ''}
          </div>
        ))}
      </div>
    </div>
  )
}

function RowCells({
  row,
  scenarios,
  cell,
  onSelect,
}: {
  row: Row
  scenarios: ComparisonScenario[]
  cell: (s: ComparisonScenario) => string
  onSelect: (id: string) => void
}) {
  return (
    <>
      <div className="flex flex-col justify-center border-b border-line px-5 py-3.5">
        <span className="text-[13px] text-ink-2">{row.label}</span>
        {row.hint && <span className="text-[11.5px] text-ink-4">{row.hint}</span>}
      </div>
      {scenarios.map((s) => (
        <div
          key={s.scenario_id}
          onClick={() => onSelect(s.scenario_id)}
          className={`flex cursor-pointer flex-col justify-center border-b py-3.5 ${cell(s)}`}
        >
          {row.render(s)}
        </div>
      ))}
    </>
  )
}

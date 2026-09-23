import type { CalculationRun } from '@/api/types'
import { formatYears } from '@/lib/format'
import { SCENARIO_KIND_LABEL } from '@/lib/labels'
import { CashCurve, type Curve } from '../CashCurve'
import { KIND_COLOR, KIND_WORDS, isRobotized, robotsWord, type ComparisonScenario } from './model'

// Calculation cash flows are already incremental against "as is", so the zero line is "change nothing".
export function PaybackChart({
  scenarios,
  calcs,
  marked,
}: {
  scenarios: ComparisonScenario[]
  calcs: Record<string, CalculationRun | undefined>
  marked: ComparisonScenario | undefined
}) {
  const curves: Curve[] = scenarios.filter(isRobotized).flatMap((s, i) => {
    const calc = calcs[s.calculation_id]
    if (!calc?.cashflow.monthly.length) return []
    return [
      {
        id: s.scenario_id,
        label: `${SCENARIO_KIND_LABEL[s.kind]} · ${robotsWord(s.metrics.robots_total ?? 0)}`,
        points: calc.cashflow.monthly.map((p) => p.cumulative_rub / 1e6),
        color: KIND_COLOR[s.kind],
        dashed: i > 0,
      },
    ]
  })
  const payback = marked?.metrics.payback_years ?? null
  return (
    <CashCurve
      curves={curves}
      payback={payback}
      paybackLabel={marked ? `Окупаемость ${KIND_WORDS[marked.kind].genitive} · ${formatYears(payback)}` : ''}
    />
  )
}

import type { ComparisonTable, MonteCarloRequest, ScenarioKind, SensitivityRequest, SizingResult } from '@/api/types'
import { formatMln, formatRub, formatYears, isNum, pluralRu } from '@/lib/format'

export type ComparisonScenario = ComparisonTable['scenarios'][number]

const KIND_ORDER: ScenarioKind[] = ['baseline', 'purchase', 'raas', 'lease']

// Words for composed phrases: «Покупка выгоднее аренды», «окупаемость покупки».
export const KIND_WORDS: Record<ScenarioKind, { title: string; genitive: string; lower: string; own: string }> = {
  baseline: { title: 'Как сейчас', genitive: 'текущего процесса', lower: 'текущий процесс', own: '' },
  purchase: { title: 'Покупка', genitive: 'покупки', lower: 'покупка', own: 'в собственность' },
  raas: { title: 'Аренда (RaaS)', genitive: 'аренды', lower: 'RaaS', own: 'как сервис' },
  lease: { title: 'Лизинг', genitive: 'лизинга', lower: 'лизинг', own: 'в лизинг' },
}

export const KIND_COLOR: Record<ScenarioKind, string> = {
  baseline: '#9a9aa0',
  purchase: '#17171a',
  raas: '#2f55d4',
  lease: '#d18a1f',
}

// The same requests on the economics and verdict screens share one cached result; the fixed seed keeps the
// probabilities identical between visits instead of drifting by a percent on every run.
export const MC_REQUEST: MonteCarloRequest = { n: 2000, metric: 'payback_years', method: 'analytic', seed: 1 }
export const SENSITIVITY_REQUEST: SensitivityRequest = { metric: 'payback_years' }

export const sortByKind = (list: ComparisonScenario[]) =>
  [...list].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))

export const isRobotized = (s: ComparisonScenario) => s.kind !== 'baseline'

// Non-breaking spaces keep «5 лет» and «12,9 млн ₽» on one line in a wrapped headline.
export const yearsWord = (n: number) => `${n}\u00a0${pluralRu(n, ['год', 'года', 'лет'])}`

export const robotsWord = (n: number) => `${n} ${pluralRu(n, ['робот', 'робота', 'роботов'])}`

// Catalog names carry the spec in brackets: «AMR 800 (грузоподъемность до 800 кг)» reads as «AMR 800» in a phrase.
export const shortName = (name: string | undefined) => (name ?? 'робот').replace(/\s*\(.*\)\s*$/, '')

// «8 × AMR 800 (+2 резерв)»: the count that covers the peak plus the reserve, as the sizing reports them.
export function fleetWithReserve(sizing: SizingResult[]): string {
  return sizing
    .map(({ count, product_name }) => {
      const base =
        count.source === 'simulated'
          ? (count.simulated ?? count.final)
          : count.source === 'analytic'
            ? count.analytic
            : count.final
      const reserve = count.source !== 'manual' && count.reserve ? ` (+${count.reserve} резерв)` : ''
      return `${base} × ${shortName(product_name)}${reserve}`
    })
    .join(' и ')
}

// «10 × AMR 800»: what is bought, reserve included.
export const fleetFinal = (sizing: SizingResult[]) =>
  sizing.map(({ count, product_name }) => `${count.final} × ${shortName(product_name)}`).join(' + ')

function paybackPhrase(s: ComparisonScenario) {
  const { payback_years: payback, horizon_years: horizon } = s.metrics
  return isNum(payback) ? `окупается за ${formatYears(payback)}` : `не окупается за ${yearsWord(horizon)}`
}

function firstOfKind(table: ComparisonTable, kind: ScenarioKind) {
  return table.scenarios.find((s) => s.kind === kind)
}

export function economicsHeadline(table: ComparisonTable): string {
  const rec = table.scenarios.find((s) => s.scenario_id === table.recommendation?.scenario_id)
  if (!rec) {
    const horizon = table.scenarios.find(isRobotized)?.metrics.horizon_years
    return horizon ? `Ни один вариант не окупается за ${yearsWord(horizon)}` : 'Ни один вариант не окупается'
  }
  const rival =
    rec.kind === 'purchase'
      ? (firstOfKind(table, 'raas') ?? firstOfKind(table, 'lease'))
      : firstOfKind(table, 'purchase')
  const title = KIND_WORDS[rec.kind].title
  const npv = rec.metrics.npv_rub
  const rivalNpv = rival?.metrics.npv_rub
  if (rival && isNum(npv) && isNum(rivalNpv) && npv > rivalNpv) {
    return `${title} выгоднее ${KIND_WORDS[rival.kind].genitive}: +${formatMln(npv - rivalNpv)}\u00a0млн\u00a0₽ NPV за\u00a0${yearsWord(rec.metrics.horizon_years)}`
  }
  return `${title} ${paybackPhrase(rec)}`
}

// One sentence: the fleet and what the main scenario needs, then what RaaS and leasing change.
export function economicsLead(
  table: ComparisonTable,
  main: ComparisonScenario | undefined,
  sizing: SizingResult[] | undefined,
): string | null {
  if (!main) return null
  const capex = main.metrics.capex_rub
  const subject = sizing?.length ? `Для ${fleetWithReserve(sizing)} ` : ''
  const head = `${subject}${KIND_WORDS[main.kind].lower} требует ${formatRub(capex)} сразу и ${paybackPhrase(main)}`
  const seen = new Set<ScenarioKind>([main.kind])
  const parts: string[] = []
  for (const s of sortByKind(table.scenarios)) {
    if (!isRobotized(s) || seen.has(s.kind)) continue
    seen.add(s.kind)
    if (s.kind === 'raas') {
      const change =
        s.metrics.capex_rub < capex
          ? `снижает CAPEX до ${formatRub(s.metrics.capex_rub)}`
          : `требует ${formatRub(s.metrics.capex_rub)}`
      parts.push(`RaaS ${change}, ${paybackPhrase(s)}`)
    } else if (s.kind === 'lease') {
      parts.push(`лизинг растягивает платежи, ${paybackPhrase(s)}`)
    } else {
      parts.push(`${KIND_WORDS[s.kind].lower} требует ${formatRub(s.metrics.capex_rub)}, ${paybackPhrase(s)}`)
    }
  }
  const sentence = [head, ...parts].join('; ')
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`
}

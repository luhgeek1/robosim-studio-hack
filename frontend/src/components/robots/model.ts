import type { Candidate, CandidateStatus, ProcessMatching, Reason, Scenario } from '@/api/types'
import { pluralRu } from '@/lib/format'
import { shortProductName } from '@/components/catalog/names'

export const shortName = shortProductName

// Chips need a short label and the headline needs «Для <чего>»; unknown processes fall back to their API name.
const PROCESS_COPY: Record<string, { short: string; genitive: string }> = {
  pallet_transport: { short: 'Перемещение паллет', genitive: 'перемещения паллет' },
  order_picking: { short: 'Отбор заказов', genitive: 'отбора заказов' },
  high_bay_storage: { short: 'Высотное хранение', genitive: 'высотного хранения паллет' },
  parcel_sorting: { short: 'Сортировка', genitive: 'сортировки коробов и посылок' },
  inventory_count: { short: 'Инвентаризация', genitive: 'инвентаризации остатков' },
  floor_cleaning: { short: 'Уборка', genitive: 'уборки' },
  baggage_handling: { short: 'Багаж', genitive: 'перевозки багажа' },
  cart_and_waste_logistics: { short: 'Тележки и мусор', genitive: 'грузовых тележек и вывоза мусора' },
  terminal_cleaning: { short: 'Уборка терминала', genitive: 'уборки терминала' },
  passenger_assistance: { short: 'Помощь пассажирам', genitive: 'помощи пассажирам' },
  security_patrol: { short: 'Патрулирование', genitive: 'патрулирования терминала' },
  meal_delivery: { short: 'Питание', genitive: 'доставки питания' },
  linen_transport: { short: 'Бельё', genitive: 'перевозки белья' },
  waste_transport: { short: 'Медотходы', genitive: 'вывоза медицинских отходов' },
  medication_delivery: { short: 'Медикаменты', genitive: 'доставки медикаментов' },
  lab_sample_delivery: { short: 'Пробы', genitive: 'доставки проб в лабораторию' },
}

export const processShort = (p: Pick<ProcessMatching, 'process_key' | 'name'>) =>
  PROCESS_COPY[p.process_key]?.short ?? p.name.split(' (')[0]

const processFor = (p: ProcessMatching) =>
  PROCESS_COPY[p.process_key] ? `Для ${PROCESS_COPY[p.process_key].genitive}` : `Для процесса «${p.name}»`

const STATUS_ORDER: Record<CandidateStatus, number> = { fit: 0, check: 1, manual: 2, excluded: 3 }

// Fit by the backend's rank, then «требует проверки» and manual ones by score: the order the director reads them in.
export function rankCandidates(candidates: Candidate[]): Candidate[] {
  return candidates
    .filter((c) => c.status !== 'excluded')
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) ||
        (b.score ?? 0) - (a.score ?? 0),
    )
}

export const countBy = (candidates: Candidate[], status: CandidateStatus) =>
  candidates.filter((c) => c.status === status).length

const verbFor = (n: number, [one, many]: [string, string]) => (n % 10 === 1 && n % 100 !== 11 ? one : many)
const solutions = (n: number) => `${n} ${pluralRu(n, ['решение', 'решения', 'решений'])}`

export function headline(process: ProcessMatching, ranked: Candidate[]): string {
  const total = process.candidates.length
  const best = ranked[0]
  const fit = countBy(process.candidates, 'fit')
  const check = countBy(process.candidates, 'check')
  if (fit > 0 && best)
    return `${processFor(process)} ${verbFor(fit, ['подходит', 'подходят'])} ${solutions(fit)} из ${total}, лучшее — ${shortName(best.product.name)}`
  if (check > 0 && best)
    return `${processFor(process)} ${solutions(check)} из ${total} ${verbFor(check, ['требует', 'требуют'])} проверки ТТХ, лучшее — ${shortName(best.product.name)}`
  if (best) return `${processFor(process)} в сравнении только добавленные вручную решения`
  return process.no_fit_message ?? `${processFor(process)} подходящих решений в каталоге нет`
}

const lowerFirst = (s: string) => (s.length > 1 && s[1] === s[1].toLowerCase() ? s[0].toLowerCase() + s.slice(1) : s)

// Constraints that are not a spec comparison but still exclude a product.
const CONSTRAINT_BY_CODE: Record<string, string> = { RND_STAGE: 'стадия продукта' }

// What the hard filter compared for this process: every spec that has a requirement from the object.
export function checkedConstraints(process: ProcessMatching, dictionary: Map<string, string>): string[] {
  const specNames = new Map(dictionary)
  const names = new Map<string, string>()
  for (const candidate of process.candidates) {
    for (const m of candidate.missing_data) if (!specNames.has(m.spec_key)) specNames.set(m.spec_key, m.name)
    for (const r of candidate.reasons) {
      if (r.spec_key && r.required != null) {
        const name = specNames.get(r.spec_key) ?? r.text.split(':')[0]
        names.set(r.spec_key, lowerFirst(name))
      } else if (CONSTRAINT_BY_CODE[r.code]) names.set(r.code, CONSTRAINT_BY_CODE[r.code])
    }
  }
  return [...names.values()]
}

export type ReasonGroups = {
  passed: Reason[]
  blocking: Reason[]
  warnings: { reason: Reason; why?: string }[]
  missing: Candidate['missing_data']
  notes: Reason[]
}

// Info reasons with a compared value are passed checks; other info reasons are skipped checks worth mentioning.
export function groupReasons(candidate: Candidate): ReasonGroups {
  const why = new Map(candidate.missing_data.map((m) => [m.spec_key, m.why_needed]))
  const warned = new Set<string>()
  const warnings = candidate.reasons
    .filter((r) => r.severity === 'warning')
    .map((reason) => {
      if (reason.spec_key) warned.add(reason.spec_key)
      return { reason, why: reason.spec_key ? why.get(reason.spec_key) : undefined }
    })
  return {
    passed: candidate.reasons.filter((r) => r.severity === 'info' && (r.code.endsWith('_OK') || r.actual != null)),
    blocking: candidate.reasons.filter((r) => r.severity === 'blocking'),
    warnings,
    missing: candidate.missing_data.filter((m) => !warned.has(m.spec_key)),
    notes: candidate.reasons.filter((r) => r.severity === 'info' && !r.code.endsWith('_OK') && r.actual == null),
  }
}

export const scenarioItem = (scenario: Scenario | undefined, processKey: string) =>
  scenario?.items.find((item) => item.process_key === processKey)

export const robotsText = (n: number) => `${n} ${pluralRu(n, ['робот', 'робота', 'роботов'])}`

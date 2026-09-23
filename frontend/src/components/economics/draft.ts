import type {
  CandidateStatus,
  CountResult,
  Financing,
  NormOverride,
  Scenario,
  ScenarioItemWrite,
  ScenarioUpdate,
} from '@/api/types'

export type ItemDraft = ScenarioItemWrite & {
  uid: string
  product_name: string
  price_rub: number | null
  candidate_status: CandidateStatus | null
  count_result: CountResult | null
}

export type Draft = {
  items: ItemDraft[]
  financing: Financing
  horizon_years: number | null
  discount_rate_pct: number | null
  overrides: NormOverride[]
}

export function toDraft(scenario: Scenario): Draft {
  return {
    items: scenario.items.map((item) => ({
      uid: item.id,
      process_key: item.process_key,
      product_id: item.product_id,
      offer_id: item.offer_id,
      count_mode: item.count_mode,
      count_manual: item.count_manual ?? null,
      stations: item.stations,
      notes: item.notes ?? null,
      price_override_rub: item.price_override_rub ?? null,
      throughput_override_per_hour: item.throughput_override_per_hour ?? null,
      override_reason: item.override_reason ?? null,
      product_name: item.product_name ?? '',
      price_rub: item.price_rub ?? null,
      candidate_status: item.candidate_status ?? null,
      count_result: item.count_result ?? null,
    })),
    financing: scenario.financing,
    horizon_years: scenario.horizon_years,
    discount_rate_pct: scenario.discount_rate_pct ?? null,
    overrides: scenario.overrides,
  }
}

// ТЗ 3.5.4: any manual correction of an item — count, price or throughput — is recorded with its reason.
export const isOverridden = (item: ItemDraft) =>
  item.count_mode === 'manual' || item.price_override_rub != null || item.throughput_override_per_hour != null

export function toUpdate(draft: Draft): ScenarioUpdate {
  return {
    horizon_years: draft.horizon_years,
    discount_rate_pct: draft.discount_rate_pct,
    overrides: draft.overrides.map(({ norm_key, value, unit, reason }) => ({ norm_key, value, unit, reason })),
    financing: draft.financing,
    items: draft.items.map((item) => ({
      process_key: item.process_key,
      product_id: item.product_id,
      offer_id: item.offer_id,
      count_mode: item.count_mode,
      count_manual: item.count_mode === 'manual' ? item.count_manual : null,
      stations: item.stations,
      notes: item.notes,
      price_override_rub: item.price_override_rub,
      throughput_override_per_hour: item.throughput_override_per_hour,
      override_reason: isOverridden(item) ? (item.override_reason?.trim() ?? null) : null,
    })),
  }
}

export function draftProblems(draft: Draft): string[] {
  const problems: string[] = []
  for (const item of draft.items) {
    if (item.count_mode === 'manual' && !(item.count_manual && item.count_manual >= 1)) {
      problems.push(`«${item.product_name}»: задайте количество — не меньше 1`)
    }
    if (isOverridden(item) && !item.override_reason?.trim()) {
      problems.push(`«${item.product_name}»: укажите причину ручного изменения`)
    }
  }
  if (draft.horizon_years != null && draft.horizon_years < 1) problems.push('Горизонт оценки — не меньше 1 года')
  for (const override of draft.overrides) {
    if (!override.reason.trim()) problems.push(`Норматив «${override.norm_key}»: укажите причину нового значения`)
  }
  return problems
}

export const sameDraft = (a: Draft, b: Draft) => JSON.stringify(toUpdate(a)) === JSON.stringify(toUpdate(b))

import type {
  CandidateStatus,
  CountResult,
  Financing,
  NormOverride,
  Scenario,
  ScenarioItemWrite,
  ScenarioUpdate,
} from '@/shared/api/types'

export type ItemDraft = ScenarioItemWrite & {
  uid: string
  product_name: string
  price_rub: number | null
  candidate_status: CandidateStatus | null
  count_result: CountResult | null
}

export type Draft = {
  name: string
  items: ItemDraft[]
  financing: Financing
  horizon_years: number | null
  discount_rate_pct: number | null
  overrides: NormOverride[]
}

export function toDraft(scenario: Scenario): Draft {
  return {
    name: scenario.name,
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

export function toUpdate(draft: Draft, isBaseline: boolean): ScenarioUpdate {
  const base: ScenarioUpdate = {
    name: draft.name,
    horizon_years: draft.horizon_years,
    discount_rate_pct: draft.discount_rate_pct,
    overrides: draft.overrides.map(({ norm_key, value, unit, reason }) => ({ norm_key, value, unit, reason })),
  }
  if (isBaseline) return base
  return {
    ...base,
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
      override_reason: item.override_reason,
    })),
  }
}

// ТЗ 3.5.4: a manual price or throughput must carry a reason, the backend rejects it otherwise.
export function draftProblems(draft: Draft): string[] {
  const problems: string[] = []
  for (const item of draft.items) {
    const overridden = item.price_override_rub != null || item.throughput_override_per_hour != null
    if (overridden && !item.override_reason?.trim()) {
      problems.push(`«${item.product_name}»: укажите причину своей цены или производительности`)
    }
    if (item.count_mode === 'manual' && !(item.count_manual && item.count_manual >= 1)) {
      problems.push(`«${item.product_name}»: задайте количество вручную (не меньше 1)`)
    }
  }
  for (const override of draft.overrides) {
    if (!override.reason.trim()) problems.push(`Норматив ${override.norm_key}: укажите причину переопределения`)
  }
  return problems
}

export const sameDraft = (a: Draft, b: Draft, isBaseline: boolean) =>
  JSON.stringify(toUpdate(a, isBaseline)) === JSON.stringify(toUpdate(b, isBaseline))

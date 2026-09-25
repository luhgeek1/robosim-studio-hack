import type { SensitivityRequest } from '@/shared/api/types'
import { formatNumber, formatPct, formatRub, formatYears, isNum } from '@/shared/lib/format'

export type Metric = SensitivityRequest['metric']

export const METRIC: Record<
  Metric,
  { label: string; short: string; format: (v: number | null | undefined) => string }
> = {
  payback_years: { label: 'Срок окупаемости', short: 'окупаемость', format: (v) => formatYears(v) },
  npv_rub: { label: 'NPV', short: 'NPV', format: (v) => formatRub(v) },
  roi_pct: { label: 'ROI за горизонт', short: 'ROI', format: (v) => formatPct(v) },
  effect_rub_year: {
    label: 'Чистый годовой эффект',
    short: 'эффект',
    format: (v) => (isNum(v) ? `${formatRub(v)}/год` : '—'),
  },
  tco_rub: { label: 'TCO за горизонт', short: 'TCO', format: (v) => formatRub(v) },
}

// Seed 1, как в отчёте (D-021): вероятности на экране и в PDF совпадают и не плывут от захода к заходу.
export const MC_REQUEST = { n: 2000, method: 'analytic', seed: 1 } as const

export const METRIC_KEYS = Object.keys(METRIC) as Metric[]

// Heatmap cells are small: show payback in years and money in millions without units (the legend carries them).
export function formatCompact(metric: Metric, v: number | null | undefined): string {
  if (!isNum(v)) return metric === 'payback_years' ? '∞' : '—'
  if (metric === 'payback_years' || metric === 'roi_pct') return formatNumber(v, 1)
  return formatNumber(v / 1e6, 1)
}

export const COMPACT_UNIT: Record<Metric, string> = {
  payback_years: 'лет',
  npv_rub: 'млн ₽',
  roi_pct: '%',
  effect_rub_year: 'млн ₽/год',
  tco_rub: 'млн ₽',
}

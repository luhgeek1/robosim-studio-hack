import { formatNumber, formatPct, formatRub, formatYears, isNum } from '@/shared/lib/format'

export function formatByUnit(value: number | null | undefined, unit: string | null | undefined, noPayback = false) {
  if (unit === 'лет') {
    if (!isNum(value)) return noPayback ? 'не окупается' : '—'
    return formatYears(value)
  }
  if (!isNum(value)) return '—'
  if (unit === '₽') return formatRub(value)
  if (unit?.startsWith('₽/')) return `${formatRub(value)}${unit.slice(1)}`
  if (unit === '%') return formatPct(value)
  return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value)
}

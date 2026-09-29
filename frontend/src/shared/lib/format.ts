const nf = (digits: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: 0 })

const plain = nf(0)
const one = nf(1)
const two = nf(2)

export const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

export function formatNumber(value: number | null | undefined, digits?: number): string {
  if (!isNum(value)) return '—'
  if (digits !== undefined) return nf(digits).format(value)
  const abs = Math.abs(value)
  if (abs >= 100) return plain.format(value)
  if (abs >= 10) return one.format(value)
  return two.format(value)
}

// Money always comes from the API in rubles; screens show millions for readability (ТЗ: деньги в рублях в контракте).
export function formatRub(value: number | null | undefined, opts: { exact?: boolean } = {}): string {
  if (!isNum(value)) return '—'
  if (opts.exact) return `${plain.format(value)} ₽`
  const abs = Math.abs(value)
  if (abs >= 1e9) return `${two.format(value / 1e9)} млрд ₽`
  if (abs >= 1e6) return `${one.format(value / 1e6)} млн ₽`
  if (abs >= 1e3) return `${one.format(value / 1e3)} тыс. ₽`
  return `${plain.format(value)} ₽`
}

export const formatMln = (value: number | null | undefined) => (isNum(value) ? one.format(value / 1e6) : '—')

export function formatPct(value: number | null | undefined, opts: { share?: boolean; digits?: number } = {}): string {
  if (!isNum(value)) return '—'
  const pct = opts.share ? value * 100 : value
  return `${nf(opts.digits ?? 1).format(pct)} %`
}

export function formatYears(value: number | null | undefined): string {
  if (!isNum(value)) return 'не окупается'
  return `${one.format(value)} ${pluralRu(Math.round(value * 10) / 10, ['год', 'года', 'лет'])}`
}

export function pluralRu(n: number, [one_, few, many]: [string, string, string]): string {
  if (!Number.isInteger(n)) return few
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one_
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

export function formatValue(value: unknown, unit?: string | null): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'да' : 'нет'
  if (isNum(value)) return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value)
  return unit ? `${String(value)} ${unit}` : String(value)
}

const dateTime = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
const dateOnly = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' })

export const formatDateTime = (iso: string | null | undefined) => (iso ? dateTime.format(new Date(iso)) : '—')
export const formatDate = (iso: string | null | undefined) => (iso ? dateOnly.format(new Date(iso)) : '—')

// Monte Carlo and the tornado cap paybacks beyond the horizon at the horizon: such a value means «не окупается за горизонт».
export function formatPayback(value: number | null | undefined, horizon: number | null | undefined): string {
  if (!isNum(value)) return 'не окупается'
  if (isNum(horizon) && value >= horizon - 1e-6)
    return `не окупается за ${horizon} ${pluralRu(horizon, ['год', 'года', 'лет'])}`
  return formatYears(value)
}

export const horizonText = (years: number | null | undefined) =>
  isNum(years) ? `${years} ${pluralRu(years, ['год', 'года', 'лет'])}` : 'горизонт расчёта'

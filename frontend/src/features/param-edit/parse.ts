import type { ParameterDef, ProjectParam } from '@/shared/api/types'

export type ParamValue = ProjectParam['value']
export type ParamType = ParameterDef['type']

export type ParseResult = { ok: true; value: ParamValue } | { ok: false; error: string }

const isNumeric = (type: ParamType) => type === 'number' || type === 'integer'

const draftNumber = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 6, useGrouping: true })

export function toDraft(value: ParamValue, type: ParamType): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' && isNumeric(type)) return draftNumber.format(value)
  return String(value)
}

// Russian users type "12,5" and "20 000"; the API wants a plain JSON number.
export function parseRuNumber(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, '').replace(',', '.')
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

export function parseDraft(draft: string, type: ParamType): ParseResult {
  const text = draft.trim()
  if (!isNumeric(type)) return { ok: true, value: text }
  const value = parseRuNumber(text)
  if (value === null) return { ok: false, error: 'Введите число, например 12,5' }
  if (type === 'integer' && !Number.isInteger(value)) return { ok: false, error: 'Нужно целое число' }
  return { ok: true, value }
}

export function sameValue(a: ParamValue, b: ParamValue): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-12
  return a === b
}

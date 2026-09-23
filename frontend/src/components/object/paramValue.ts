import type { ParameterDef, ProjectParam } from '@/api/types'

export type ParamValue = ProjectParam['value']
export type ParamType = ParameterDef['type']

export type ParseResult = { ok: true; value: ParamValue } | { ok: false; error: string }

const isNumeric = (type: ParamType) => type === 'number' || type === 'integer'

// Parameters are the user's own inputs: show them exactly (1,302 stays 1,302), not rounded like report numbers.
const exact = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 })

export const paramType = (param: ProjectParam): ParamType => param.definition?.type ?? 'string'

export function displayValue(param: ProjectParam, value: ParamValue = param.value): string {
  if (value === null || value === undefined || value === '') return 'нет данных'
  if (typeof value === 'boolean') return value ? 'да' : 'нет'
  if (typeof value === 'string' && param.definition?.type === 'enum') {
    const option = param.definition.enum_values?.find((o) => o.value === value)
    if (option?.label) return option.label
  }
  const text = typeof value === 'number' ? exact.format(value) : String(value)
  return param.unit ? `${text} ${param.unit}` : text
}

export function displayRange(param: ProjectParam): string | null {
  const min = param.definition?.min
  const max = param.definition?.max
  if (min == null && max == null) return null
  const unit = param.unit ? ` ${param.unit}` : ''
  if (min != null && max != null)
    return min === max ? `${exact.format(min)}${unit}` : `${exact.format(min)}–${exact.format(max)}${unit}`
  if (min != null) return `от ${exact.format(min)}${unit}`
  return `до ${exact.format(max!)}${unit}`
}

export function toDraft(param: ProjectParam): string {
  const value = param.value
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return exact.format(value)
  return String(value)
}

// Russian users type "2,5" and "20 000"; the API wants a plain JSON number.
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
  if (value === null) return { ok: false, error: 'Введите число, например 2,5 или 20 000' }
  if (type === 'integer' && !Number.isInteger(value)) return { ok: false, error: 'Нужно целое число' }
  return { ok: true, value }
}

export function sameValue(a: ParamValue, b: ParamValue): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-12
  return a === b
}

export const isOverridden = (param: ProjectParam) =>
  param.provenance.status === 'user' || param.provenance.status === 'imported'

export const needsAttention = (param: ProjectParam) =>
  param.provenance.status === 'assumption' ||
  param.provenance.status === 'missing' ||
  param.validation.status === 'warning' ||
  param.validation.status === 'error'

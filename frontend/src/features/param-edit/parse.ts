import type { ParameterDef, ProjectParam } from '@/shared/api/types'

export type ParamValue = ProjectParam['value']
export type ParamType = ParameterDef['type']

export type ParseResult = { ok: true; value: ParamValue } | { ok: false; error: string }
export type DimensionDraft = [string, string, string]

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

export function toDimensionDraft(value: ParamValue | undefined): DimensionDraft {
  const text = value == null ? '' : String(value).trim()
  const withoutUnit = text.replace(/\s*(?:мм|mm)$/i, '').trim()
  const parts = /[×xх*]/i.test(withoutUnit) ? withoutUnit.split(/[×xх*]/i) : withoutUnit.split(/\s+/)
  if (parts.length === 2 || parts.length === 3) return [parts[0].trim(), parts[1].trim(), parts[2]?.trim() ?? '']
  // A concatenated value has no reliable boundaries; keep it visible rather than guessing its dimensions.
  return [text, '', '']
}

export function parseDimensionDraft(parts: DimensionDraft): ParseResult {
  if (parts.some((part) => !part.trim())) return { ok: false, error: 'Заполните длину, ширину и высоту' }
  const numbers = parts.map(parseRuNumber)
  if (numbers.some((number) => number === null || number <= 0))
    return { ok: false, error: 'Каждый размер должен быть числом больше нуля' }
  return { ok: true, value: numbers.join('×') }
}

export function parseDraft(draft: string, type: ParamType): ParseResult {
  const text = draft.trim()
  if (type === 'dimensions') return parseDimensionDraft(toDimensionDraft(text))
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

import type { Res, SpecWrite } from '@/shared/api/types'
import { parseNumber } from './parse'

export type SpecKey = Res<'/api/v1/catalog/spec-keys', 'get'>['items'][number]
export type SpecStatus = SpecWrite['status']
export type SpecEdit = { text: string; status: SpecStatus }
export type SpecEdits = Record<string, SpecEdit>
export type SpecSource = { title: string; url: string; date: string }

export const STATUS_LABEL: Record<SpecStatus, string> = {
  confirmed: 'Подтверждено',
  vendor_claim: 'Заявка вендора',
  assumption: 'Допущение',
}

export const emptySource = (): SpecSource => ({ title: '', url: '', date: new Date().toISOString().slice(0, 10) })

const toValue = (text: string): SpecWrite['value'] => {
  const number = parseNumber(text)
  if (number !== null) return number
  const lower = text.trim().toLowerCase()
  if (lower === 'да') return true
  if (lower === 'нет') return false
  return text.trim()
}

export const changedEdits = (edits: SpecEdits) => Object.entries(edits).filter(([, e]) => e.text.trim() !== '')

export function toSpecWrites(edits: SpecEdits, source: SpecSource, specKeys: SpecKey[] | undefined): SpecWrite[] {
  return changedEdits(edits).map(([key, e]) => ({
    key,
    value: toValue(e.text),
    unit: specKeys?.find((k) => k.key === key)?.unit ?? null,
    status: e.status,
    source: {
      kind: source.url.trim() ? 'vendor_site' : 'user_input',
      title: source.title.trim(),
      url: source.url.trim() || null,
      retrieved_at: source.date || null,
    },
  }))
}

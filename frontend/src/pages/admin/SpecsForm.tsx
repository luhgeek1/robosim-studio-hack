import { useMemo } from 'react'
import { SPEC_GROUP_LABEL, SPEC_GROUP_ORDER } from '@/entities/catalog'
import { PROVENANCE_LABEL } from '@/entities/provenance/labels'
import type { ProductDetail } from '@/shared/api/types'
import { formatValue } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Field } from './fields'
import { STATUS_LABEL, type SpecEdit, type SpecEdits, type SpecKey, type SpecSource, type SpecStatus } from './specs'

/* Строки ТТХ по группам: текущее значение с происхождением и поле для нового. Без `lockedStatus` у строки
   выбирается статус подтверждённости; вендор его не выбирает — его значения всегда «заявка производителя». */
export function SpecsList({
  product,
  specKeys,
  edits,
  onEdit,
  onlyMissing,
  lockedStatus,
}: {
  product: ProductDetail
  specKeys: SpecKey[]
  edits: SpecEdits
  onEdit: (key: string, patch: Partial<SpecEdit>) => void
  onlyMissing: boolean
  lockedStatus?: SpecStatus
}) {
  const current = useMemo(() => new Map([...product.specs].reverse().map((s) => [s.key, s])), [product.specs])
  const missing = new Set(product.missing_key_specs ?? [])
  const relevant = specKeys.filter(
    (k) => !k.solution_types?.length || k.solution_types.includes(product.solution_type) || current.has(k.key),
  )
  const shown = relevant.filter((k) => !onlyMissing || !current.has(k.key))

  return (
    <div className="space-y-5">
      {SPEC_GROUP_ORDER.map((group) => {
        const keys = shown.filter((k) => k.group === group)
        if (!keys.length) return null
        return (
          <section key={group}>
            <h3 className="mb-1.5 text-[12px] font-medium tracking-wide text-ink-3 uppercase">
              {SPEC_GROUP_LABEL[group]}
            </h3>
            <ul className="divide-y divide-line rounded-[12px] border border-line bg-card">
              {keys.map((key) => {
                const spec = current.get(key.key)
                const draft = edits[key.key]
                const dirty = Boolean(draft?.text.trim())
                return (
                  <li
                    key={key.key}
                    className={cn(
                      'grid items-center gap-3 px-3.5 py-2.5 transition-colors',
                      lockedStatus ? 'grid-cols-[minmax(0,1fr)_150px]' : 'grid-cols-[minmax(0,1fr)_128px_132px]',
                      dirty && 'bg-warn-soft/40',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-[13px] font-medium">
                        <span className="truncate">{key.name}</span>
                        {missing.has(key.key) && (
                          <span className="shrink-0 text-[11px] font-normal text-crit">ключевая, пусто</span>
                        )}
                      </span>
                      <span className="block truncate text-[12px] text-ink-3">
                        {spec
                          ? `${formatValue(spec.value, spec.unit)} · ${PROVENANCE_LABEL[spec.provenance.status].toLowerCase()}`
                          : 'нет данных'}
                      </span>
                    </span>
                    <Input
                      value={draft?.text ?? ''}
                      onChange={(e) => onEdit(key.key, { text: e.target.value })}
                      placeholder={key.unit ? `новое, ${key.unit}` : 'новое'}
                      className="h-8 rounded-[9px] text-[13px]"
                    />
                    {!lockedStatus && (
                      <Select
                        value={draft?.status ?? 'confirmed'}
                        onValueChange={(status) => onEdit(key.key, { status: status as SpecStatus })}
                        disabled={!dirty}
                      >
                        <SelectTrigger size="sm" className="h-8 w-full rounded-[9px] text-[12.5px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(STATUS_LABEL) as SpecStatus[]).map((status) => (
                            <SelectItem key={status} value={status}>
                              {STATUS_LABEL[status]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

export function SourceFields({ source, onChange }: { source: SpecSource; onChange: (source: SpecSource) => void }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_130px] gap-2.5">
      <Field label="Источник">
        <Input
          value={source.title}
          onChange={(e) => onChange({ ...source, title: e.target.value })}
          placeholder="Паспорт изделия, сайт вендора"
          className="h-9 rounded-[10px]"
        />
      </Field>
      <Field label="Ссылка">
        <Input
          value={source.url}
          onChange={(e) => onChange({ ...source, url: e.target.value })}
          placeholder="https://…"
          className="h-9 rounded-[10px]"
        />
      </Field>
      <Field label="Дата">
        <Input
          type="date"
          value={source.date}
          onChange={(e) => onChange({ ...source, date: e.target.value })}
          className="h-9 rounded-[10px]"
        />
      </Field>
    </div>
  )
}

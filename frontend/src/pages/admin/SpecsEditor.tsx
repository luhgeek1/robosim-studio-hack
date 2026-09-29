import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useSpecKeys, useUpsertSpecs } from '@/entities/admin'
import { SPEC_GROUP_LABEL, SPEC_GROUP_ORDER } from '@/entities/catalog'
import { PROVENANCE_LABEL } from '@/entities/provenance/labels'
import type { ProductDetail, SpecWrite } from '@/shared/api/types'
import { formatValue, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { LoadingBlock, Spinner } from '@/shared/ui/states'
import { Switch } from '@/shared/ui/switch'
import { Field } from './fields'
import { SPRING } from './motion'
import { parseNumber } from './parse'

type SpecStatus = SpecWrite['status']
const STATUS_LABEL: Record<SpecStatus, string> = {
  confirmed: 'Подтверждено',
  vendor_claim: 'Заявка вендора',
  assumption: 'Допущение',
}
type Edit = { text: string; status: SpecStatus }

const toValue = (text: string): SpecWrite['value'] => {
  const number = parseNumber(text)
  if (number !== null) return number
  const lower = text.trim().toLowerCase()
  if (lower === 'да') return true
  if (lower === 'нет') return false
  return text.trim()
}

export function SpecsEditor({ product }: { product: ProductDetail }) {
  const specKeys = useSpecKeys()
  const upsert = useUpsertSpecs()
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [source, setSource] = useState(() => ({ title: '', url: '', date: new Date().toISOString().slice(0, 10) }))

  const current = useMemo(() => new Map([...product.specs].reverse().map((s) => [s.key, s])), [product.specs])
  const missing = new Set(product.missing_key_specs ?? [])
  const relevant = (specKeys.data ?? []).filter(
    (k) => !k.solution_types?.length || k.solution_types.includes(product.solution_type) || current.has(k.key),
  )
  const shown = relevant.filter((k) => !onlyMissing || !current.has(k.key))
  const changed = Object.entries(edits).filter(([, e]) => e.text.trim() !== '')

  const edit = (key: string, patch: Partial<Edit>) =>
    setEdits((prev) => {
      const base: Edit = prev[key] ?? { text: '', status: 'confirmed' }
      return { ...prev, [key]: { ...base, ...patch } }
    })

  const save = () => {
    const specs: SpecWrite[] = changed.map(([key, e]) => ({
      key,
      value: toValue(e.text),
      unit: specKeys.data?.find((k) => k.key === key)?.unit ?? null,
      status: e.status,
      source: {
        kind: source.url.trim() ? 'vendor_site' : 'user_input',
        title: source.title.trim(),
        url: source.url.trim() || null,
        retrieved_at: source.date || null,
      },
    }))
    upsert.mutate(
      { id: product.id, specs },
      {
        onSuccess: () => {
          toast.success(
            `Сохранено ${specs.length} ${pluralRu(specs.length, ['характеристика', 'характеристики', 'характеристик'])}`,
          )
          setEdits({})
        },
      },
    )
  }

  if (specKeys.isPending) return <LoadingBlock label="Загружаем словарь характеристик…" />

  return (
    <div className="pb-20">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="meta max-w-sm">
          Каждое значение сохраняется с источником и датой (ТЗ 3.3.3). Ключевые ТТХ участвуют в проверках подбора.
        </p>
        <label className="flex shrink-0 items-center gap-2 text-[12.5px] text-ink-2">
          <Switch checked={onlyMissing} onCheckedChange={setOnlyMissing} size="sm" /> только пустые
        </label>
      </div>

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
                        'grid grid-cols-2 items-center gap-x-3 gap-y-2 px-3.5 py-2.5 transition-colors sm:grid-cols-[minmax(0,1fr)_128px_132px] sm:gap-y-3',
                        dirty && 'bg-warn-soft/40',
                      )}
                    >
                      <span className="col-span-2 min-w-0 sm:col-span-1">
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
                        onChange={(e) => edit(key.key, { text: e.target.value })}
                        placeholder={key.unit ? `новое, ${key.unit}` : 'новое'}
                        className="h-8 rounded-[9px] text-[13px]"
                      />
                      <Select
                        value={draft?.status ?? 'confirmed'}
                        onValueChange={(status) => edit(key.key, { status: status as SpecStatus })}
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
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>

      <AnimatePresence>
        {changed.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={SPRING}
            className="sticky bottom-0 -mx-4 mt-5 border-t border-line bg-card/95 px-4 pt-4 pb-5 backdrop-blur sm:-mx-6 sm:px-6"
          >
            <div className="grid grid-cols-[minmax(0,1fr)_130px] gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_130px]">
              <Field label="Источник" className="max-sm:col-span-2">
                <Input
                  value={source.title}
                  onChange={(e) => setSource({ ...source, title: e.target.value })}
                  placeholder="Паспорт изделия, сайт вендора"
                  className="h-9 rounded-[10px]"
                />
              </Field>
              <Field label="Ссылка">
                <Input
                  value={source.url}
                  onChange={(e) => setSource({ ...source, url: e.target.value })}
                  placeholder="https://…"
                  className="h-9 rounded-[10px]"
                />
              </Field>
              <Field label="Дата">
                <Input
                  type="date"
                  value={source.date}
                  onChange={(e) => setSource({ ...source, date: e.target.value })}
                  className="h-9 rounded-[10px]"
                />
              </Field>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setEdits({})}>
                Сбросить
              </Button>
              <Button onClick={save} disabled={!source.title.trim() || upsert.isPending}>
                {upsert.isPending && <Spinner />} Сохранить {changed.length}{' '}
                {pluralRu(changed.length, ['значение', 'значения', 'значений'])}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

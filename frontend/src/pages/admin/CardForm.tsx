import { AnimatePresence, motion } from 'framer-motion'
import { BADGE_LABEL, PRODUCT_STATUS_LABEL } from '@/entities/catalog'
import { useSolutionTypes } from '@/entities/admin'
import { OBJECT_TYPE_LABEL } from '@/entities/project'
import { useObjectTypes } from '@/entities/reference'
import type { ObjectTypeKey, ProductStatus, ProductWrite } from '@/shared/api/types'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Textarea } from '@/shared/ui/textarea'
import { Segmented } from '@/shared/ui/v0'
import { Chip, Field, FormSection } from './fields'
import { ASSIGNABLE_BADGES, type ProductErrors } from './productForm'
import { SPRING } from './motion'

const STATUSES: ProductStatus[] = ['operation', 'piloting', 'rnd']

export function CardForm({
  form,
  errors,
  onChange,
}: {
  form: ProductWrite
  errors: ProductErrors
  onChange: (patch: Partial<ProductWrite>) => void
}) {
  const solutionTypes = useSolutionTypes()
  const objectTypes = useObjectTypes()
  const selectedTypes = form.object_types ?? []
  const processes = form.processes ?? []
  const badges = form.badges ?? []

  // Процессы, которые умеет выбранный тип решения, — по каждому отмеченному типу объекта.
  const processGroups = (objectTypes.data ?? [])
    .filter((t) => selectedTypes.includes(t.key))
    .map((t) => ({
      type: t.key,
      items: t.processes.filter((p) => !form.solution_type || (p.solution_types ?? []).includes(form.solution_type)),
    }))
    .filter((g) => g.items.length > 0)

  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  return (
    <div className="space-y-7">
      <FormSection title="Идентификация">
        <Field label="Название" error={errors.name}>
          <Input
            value={form.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Например, Ronavi H1500"
            aria-invalid={Boolean(errors.name)}
            className="h-9 rounded-[10px]"
          />
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
          <Field label="Производитель" error={errors.manufacturer_name} hint="Новый производитель создастся сам">
            <Input
              value={form.manufacturer_name}
              onChange={(e) => onChange({ manufacturer_name: e.target.value })}
              placeholder="ООО «Ронави Роботикс»"
              aria-invalid={Boolean(errors.manufacturer_name)}
              className="h-9 rounded-[10px]"
            />
          </Field>
          <Field label="Страна" hint="Код ISO">
            <Input
              value={form.manufacturer_country ?? 'RU'}
              maxLength={2}
              onChange={(e) => onChange({ manufacturer_country: e.target.value.toUpperCase() })}
              className="h-9 rounded-[10px] uppercase"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Тип решения" error={errors.solution_type}>
            <Select
              value={form.solution_type || undefined}
              onValueChange={(value) => onChange({ solution_type: value, processes: [] })}
            >
              <SelectTrigger className="h-9 w-full rounded-[10px]" aria-invalid={Boolean(errors.solution_type)}>
                <SelectValue placeholder="Выберите тип" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {(solutionTypes.data ?? []).map((type) => (
                  <SelectItem key={type.key} value={type.key}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Подтип" hint="Как в каталоге организатора">
            <Input
              value={form.subtype ?? ''}
              onChange={(e) => onChange({ subtype: e.target.value })}
              placeholder="Паллетный AMR"
              className="h-9 rounded-[10px]"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Готовность">
        <div className="flex flex-wrap items-end gap-5">
          <Field label="Стадия">
            <Segmented
              size="sm"
              value={form.status}
              onChange={(status) => onChange({ status })}
              options={STATUSES.map((s) => ({ value: s, label: PRODUCT_STATUS_LABEL[s] }))}
            />
          </Field>
          <Field label="УГТ" error={errors.trl} className="w-24">
            <Input
              type="number"
              min={1}
              max={9}
              value={form.trl ?? ''}
              onChange={(e) => onChange({ trl: e.target.value === '' ? null : Number(e.target.value) })}
              placeholder="1–9"
              className="num h-9 rounded-[10px]"
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          {ASSIGNABLE_BADGES.map((badge) => (
            <Chip
              key={badge}
              active={badges.includes(badge)}
              onClick={() => onChange({ badges: toggle(badges, badge) })}
            >
              {BADGE_LABEL[badge]}
            </Chip>
          ))}
        </div>
      </FormSection>

      <FormSection title="Применимость" note="Подбор предлагает решение только для отмеченных объектов и процессов">
        <div className="flex flex-wrap gap-2">
          {(objectTypes.data ?? []).map((type) => (
            <Chip
              key={type.key}
              active={selectedTypes.includes(type.key)}
              onClick={() => {
                const next = toggle(selectedTypes, type.key)
                const allowed = new Set(
                  (objectTypes.data ?? [])
                    .filter((t) => next.includes(t.key))
                    .flatMap((t) => t.processes.map((p) => p.key)),
                )
                onChange({ object_types: next, processes: processes.filter((p) => allowed.has(p)) })
              }}
            >
              {OBJECT_TYPE_LABEL[type.key as ObjectTypeKey] ?? type.name}
            </Chip>
          ))}
        </div>
        <AnimatePresence initial={false}>
          {processGroups.map((group) => (
            <motion.div
              key={group.type}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={SPRING}
              className="overflow-hidden"
            >
              <div className="rounded-[12px] bg-surface-2 px-3.5 py-3 ring-1 ring-line">
                <div className="mb-2 text-[12px] text-ink-3">
                  Процессы · {OBJECT_TYPE_LABEL[group.type as ObjectTypeKey]}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {group.items.map((process) => (
                    <Chip
                      key={process.key}
                      active={processes.includes(process.key)}
                      onClick={() => onChange({ processes: toggle(processes, process.key) })}
                    >
                      {process.name}
                    </Chip>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {selectedTypes.length > 0 && processGroups.length === 0 && form.solution_type && (
          <p className="text-[12.5px] text-ink-3">
            У выбранных объектов нет процессов для этого типа решения — продукт будет виден только в каталоге.
          </p>
        )}
      </FormSection>

      <FormSection title="Описание">
        <Textarea
          value={form.description ?? ''}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Что делает решение, где применяется, чем отличается"
          className="min-h-24 rounded-[10px]"
        />
      </FormSection>
    </div>
  )
}

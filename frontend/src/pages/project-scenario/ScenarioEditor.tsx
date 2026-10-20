import { Trash2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useMatching } from '@/entities/matching'
import { useProcesses } from '@/entities/project'
import { useNorms } from '@/entities/reference'
import { FINANCING_KIND_LABEL } from '@/entities/scenario'
import type { Financing, ObjectTypeKey, Scenario } from '@/shared/api/types'
import { formatValue } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Section } from '@/shared/ui/page'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select'
import { AddItemDialog } from './AddItemDialog'
import type { Draft, ItemDraft } from './draft'
import { NumberField } from './NumberField'
import { ItemRow } from './ItemRow'

const NORM_CATEGORY_LABEL: Record<string, string> = {
  capex: 'CAPEX',
  opex: 'OPEX',
  labor: 'Персонал',
  finance: 'Финансы',
  operations: 'Операции',
  simulation: 'Имитация',
  sizing: 'Расчёт количества',
  risk: 'Риски',
  layout: 'Планировка',
}

export function ScenarioEditor({
  projectId,
  objectType,
  scenario,
  draft,
  onChange,
  itemErrors,
}: {
  projectId: string
  objectType: ObjectTypeKey
  scenario: Scenario
  draft: Draft
  onChange: (draft: Draft) => void
  itemErrors: Record<string, string>
}) {
  const matching = useMatching(projectId)
  const processes = useProcesses(projectId)
  const processName = useMemo(
    () => new Map((processes.data?.processes ?? []).map((p) => [p.process_key, p.name])),
    [processes.data],
  )
  const setItem = (uid: string, patch: Partial<ItemDraft>) =>
    onChange({ ...draft, items: draft.items.map((item) => (item.uid === uid ? { ...item, ...patch } : item)) })
  const setFinancing = (patch: Partial<Financing>) =>
    onChange({ ...draft, financing: { ...draft.financing, ...patch } })
  const setRaas = (patch: Partial<NonNullable<Financing['raas']>>) =>
    setFinancing({ raas: { includes_service: true, includes_software: true, ...draft.financing.raas, ...patch } })

  return (
    <div className="space-y-6">
      {!scenario.is_baseline && (
        <Section
          title="Состав: процесс, решение, количество"
          description="Количество рассчитывается по нагрузке и характеристикам робота или задаётся вручную. Своя цена и производительность требуют обоснования."
          actions={
            <AddItemDialog
              projectId={projectId}
              items={draft.items}
              onAdd={(processKey, candidate) =>
                onChange({
                  ...draft,
                  items: [
                    ...draft.items.filter((item) => item.process_key !== processKey),
                    {
                      uid: `new-${candidate.product.id}-${Date.now()}`,
                      process_key: processKey,
                      product_id: candidate.product.id,
                      offer_id: candidate.offer_id,
                      count_mode: candidate.estimate?.robots_count == null ? 'manual' : 'auto',
                      count_manual: null,
                      product_name: candidate.product.name,
                      price_rub: candidate.product.price_from.amount_rub,
                      candidate_status: candidate.status,
                      count_result: null,
                      price_override_rub: null,
                      throughput_override_per_hour: null,
                      override_reason: null,
                    },
                  ],
                })
              }
            />
          }
        >
          {draft.items.length === 0 ? (
            <p className="text-muted-foreground">
              Нажмите «Добавить решение»: выберите процесс, посмотрите модели и соберите свой состав.
            </p>
          ) : (
            <div className="space-y-3">
              {draft.items.map((item) => (
                <ItemRow
                  key={item.uid}
                  item={item}
                  error={itemErrors[item.process_key]}
                  candidate={matching.data?.processes
                    .find((p) => p.process_key === item.process_key)
                    ?.candidates.find((c) => c.product.id === item.product_id)}
                  processName={processName.get(item.process_key) ?? item.process_key}
                  onChange={(patch) => setItem(item.uid, patch)}
                  onRemove={() => onChange({ ...draft, items: draft.items.filter((i) => i.uid !== item.uid) })}
                />
              ))}
            </div>
          )}
        </Section>
      )}

      <div className={scenario.is_baseline ? '' : 'grid grid-cols-1 gap-6 md:grid-cols-2'}>
        {!scenario.is_baseline && (
          <Section title="Финансирование">
            {scenario.kind === 'raas' ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Плата за робота в месяц">
                  <NumberField
                    value={draft.financing.raas?.monthly_fee_rub_per_robot}
                    onChange={(v) => setRaas({ monthly_fee_rub_per_robot: v })}
                    placeholder="из нормативов"
                    suffix="₽"
                    min={0}
                  />
                </Field>
                <Field label="Подключение (разово)">
                  <NumberField
                    value={draft.financing.raas?.setup_fee_rub}
                    onChange={(v) => setRaas({ setup_fee_rub: v })}
                    placeholder="из нормативов"
                    suffix="₽"
                    min={0}
                  />
                </Field>
                <Field label="Срок договора">
                  <NumberField
                    value={draft.financing.raas?.contract_years}
                    onChange={(v) => setRaas({ contract_years: v })}
                    placeholder="из нормативов"
                    suffix="лет"
                    min={0}
                  />
                </Field>
                <Field label="Выкуп в конце срока">
                  <NumberField
                    value={draft.financing.raas?.buyout_pct}
                    onChange={(v) => setRaas({ buyout_pct: v })}
                    placeholder="нет"
                    suffix="%"
                    min={0}
                  />
                </Field>
                <p className="col-span-2 text-xs text-muted-foreground">
                  Сервис и ПО включены в плату. Пустое поле - значение по умолчанию из реестра нормативов.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Источник средств" className="col-span-2">
                  <Select
                    value={draft.financing.kind ?? 'own_funds'}
                    onValueChange={(v) => setFinancing({ kind: v as Financing['kind'] })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(FINANCING_KIND_LABEL).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {draft.financing.kind && draft.financing.kind !== 'own_funds' && (
                  <>
                    <Field label="Ставка, годовых">
                      <NumberField
                        value={draft.financing.rate_pct}
                        onChange={(v) => setFinancing({ rate_pct: v })}
                        placeholder="ключевая ЦБ"
                        suffix="%"
                        min={0}
                      />
                    </Field>
                    <Field label="Срок">
                      <NumberField
                        value={draft.financing.term_years}
                        onChange={(v) => setFinancing({ term_years: v })}
                        placeholder="из нормативов"
                        suffix="лет"
                        min={0}
                      />
                    </Field>
                    <Field label="Первоначальный взнос">
                      <NumberField
                        value={draft.financing.down_payment_pct}
                        onChange={(v) => setFinancing({ down_payment_pct: v })}
                        placeholder="из нормативов"
                        suffix="%"
                        min={0}
                      />
                    </Field>
                  </>
                )}
              </div>
            )}
          </Section>
        )}

        <Section title="Горизонт и ставка">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Горизонт оценки">
              <NumberField
                value={draft.horizon_years}
                onChange={(v) => onChange({ ...draft, horizon_years: v })}
                suffix="лет"
                integer
                min={1}
              />
            </Field>
            <Field label="Ставка дисконтирования">
              <NumberField
                value={draft.discount_rate_pct}
                onChange={(v) => onChange({ ...draft, discount_rate_pct: v })}
                placeholder="из нормативов"
                suffix="%"
                min={0}
              />
            </Field>
            <p className="col-span-2 text-xs text-muted-foreground">
              По умолчанию: склад - 5 лет, аэропорт и больница - 7 (датасет организатора); ставка - из реестра
              нормативов.
            </p>
          </div>
        </Section>
      </div>

      <NormOverrides objectType={objectType} draft={draft} onChange={onChange} />
    </div>
  )
}

function NormOverrides({
  objectType,
  draft,
  onChange,
}: {
  objectType: ObjectTypeKey
  draft: Draft
  onChange: (draft: Draft) => void
}) {
  const norms = useNorms(objectType)
  const [pick, setPick] = useState<string>('')
  const editable = useMemo(() => (norms.data?.items ?? []).filter((n) => n.editable_by_user), [norms.data])
  const byKey = useMemo(() => new Map(editable.map((n) => [n.key, n])), [editable])
  const categories = useMemo(() => [...new Set(editable.map((n) => n.category))], [editable])
  const used = new Set(draft.overrides.map((o) => o.norm_key))

  const update = (index: number, patch: Partial<Draft['overrides'][number]>) =>
    onChange({ ...draft, overrides: draft.overrides.map((o, i) => (i === index ? { ...o, ...patch } : o)) })

  return (
    <Section
      title="Переопределение нормативов"
      description="Своё значение с причиной попадёт в журнал и в трассу расчёта"
      actions={
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger className="min-w-0 flex-1 sm:w-72 sm:flex-none">
              <SelectValue placeholder="Выберите норматив" />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {categories.map((category) => (
                <SelectGroup key={category}>
                  <SelectLabel>{NORM_CATEGORY_LABEL[category] ?? category}</SelectLabel>
                  {editable
                    .filter((n) => n.category === category && !used.has(n.key))
                    .map((n) => (
                      <SelectItem key={n.key} value={n.key}>
                        {n.name}
                      </SelectItem>
                    ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            disabled={!pick}
            onClick={() => {
              const norm = byKey.get(pick)
              if (!norm) return
              onChange({
                ...draft,
                overrides: [
                  ...draft.overrides,
                  { norm_key: norm.key, value: norm.value, unit: norm.unit, reason: '', default_value: norm.value },
                ],
              })
              setPick('')
            }}
          >
            Добавить
          </Button>
        </div>
      }
    >
      {draft.overrides.length === 0 ? (
        <p className="text-muted-foreground">Расчёт идёт на нормативах по умолчанию.</p>
      ) : (
        // На телефоне строка переопределения складывается в карточку: пять колонок в ширину не помещаются.
        <table className="w-full text-sm max-sm:block">
          <thead className="text-xs text-muted-foreground max-sm:hidden">
            <tr>
              <th className="py-1 text-left font-normal">Норматив</th>
              <th className="py-1 text-left font-normal">По умолчанию</th>
              <th className="py-1 text-left font-normal">Своё значение</th>
              <th className="py-1 text-left font-normal">Причина</th>
              <th />
            </tr>
          </thead>
          <tbody className="max-sm:block">
            {draft.overrides.map((override, index) => {
              const norm = byKey.get(override.norm_key)
              return (
                <tr
                  key={override.norm_key}
                  className="border-t max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-x-3 max-sm:gap-y-2 max-sm:py-3"
                >
                  <td className="py-2 pr-3 max-sm:p-0">
                    <div>{norm?.name ?? override.norm_key}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{override.norm_key}</div>
                  </td>
                  <td className="num py-2 pr-3 text-muted-foreground max-sm:col-span-2 max-sm:p-0 max-sm:text-xs">
                    <span className="sm:hidden">по умолчанию </span>
                    {formatValue(norm?.value ?? override.default_value, override.unit ?? norm?.unit)}
                  </td>
                  <td className="w-40 py-2 pr-3 max-sm:col-span-2 max-sm:w-auto max-sm:p-0">
                    <NumberField
                      value={override.value}
                      onChange={(v) => update(index, { value: v ?? 0 })}
                      suffix={override.unit ?? norm?.unit ?? undefined}
                    />
                  </td>
                  <td className="py-2 pr-3 max-sm:col-span-2 max-sm:p-0">
                    <Input
                      value={override.reason}
                      onChange={(e) => update(index, { reason: e.target.value })}
                      placeholder="Почему другое значение"
                    />
                  </td>
                  <td className="py-2 max-sm:col-start-2 max-sm:row-start-1 max-sm:p-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Убрать переопределение"
                      onClick={() => onChange({ ...draft, overrides: draft.overrides.filter((_, i) => i !== index) })}
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </Section>
  )
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

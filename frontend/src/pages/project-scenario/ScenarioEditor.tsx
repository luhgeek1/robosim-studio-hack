import { Link2, Trash2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useProcesses } from '@/entities/project'
import { useNorms } from '@/entities/reference'
import { FINANCING_KIND_LABEL } from '@/entities/scenario'
import type { Financing, ObjectTypeKey, Scenario } from '@/shared/api/types'
import { formatRub, formatValue } from '@/shared/lib/format'
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
}: {
  projectId: string
  objectType: ObjectTypeKey
  scenario: Scenario
  draft: Draft
  onChange: (draft: Draft) => void
}) {
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
          description="Количество считается из времени цикла на планировке; своя цена или производительность — только с причиной"
          actions={
            <AddItemDialog
              projectId={projectId}
              onAdd={(processKey, candidate) =>
                onChange({
                  ...draft,
                  items: [
                    ...draft.items,
                    {
                      uid: `new-${candidate.product.id}-${Date.now()}`,
                      process_key: processKey,
                      product_id: candidate.product.id,
                      offer_id: candidate.offer_id,
                      count_mode: 'auto',
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
              В сценарии пока нет решений. Добавьте их из подбора — или создайте сценарий «из рекомендации».
            </p>
          ) : (
            <div className="space-y-3">
              {draft.items.map((item) => (
                <ItemRow
                  key={item.uid}
                  item={item}
                  processName={processName.get(item.process_key) ?? item.process_key}
                  onChange={(patch) => setItem(item.uid, patch)}
                  onRemove={() => onChange({ ...draft, items: draft.items.filter((i) => i.uid !== item.uid) })}
                />
              ))}
            </div>
          )}
        </Section>
      )}

      <div className={scenario.is_baseline ? '' : 'grid grid-cols-2 gap-6'}>
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
                  Сервис и ПО включены в плату. Пустое поле — значение по умолчанию из реестра нормативов.
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
              По умолчанию: склад — 5 лет, аэропорт и больница — 7 (датасет организатора); ставка — из реестра
              нормативов.
            </p>
          </div>
        </Section>
      </div>

      <NormOverrides objectType={objectType} draft={draft} onChange={onChange} />
    </div>
  )
}

function ItemRow({
  item,
  processName,
  onChange,
  onRemove,
}: {
  item: ItemDraft
  processName: string
  onChange: (patch: Partial<ItemDraft>) => void
  onRemove: () => void
}) {
  const [showOverrides, setShowOverrides] = useState(
    item.price_override_rub != null || item.throughput_override_per_hour != null,
  )
  return (
    <div className="rounded-md border bg-raised/40 p-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">{processName}</div>
          <Link
            to={`/catalog/${item.product_id}`}
            className="inline-flex items-center gap-1 font-medium hover:text-primary"
          >
            {item.product_name} <Link2 className="size-3" />
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>цена за единицу {formatRub(item.price_override_rub ?? item.price_rub)}</span>
            {item.price_override_rub != null && <WarnMark>своя цена</WarnMark>}
            {item.candidate_status === 'check' && <WarnMark>требует проверки ТТХ</WarnMark>}
            {item.count_result && (
              <span>
                в последнем расчёте: {item.count_result.final} шт. ({item.count_result.analytic} по циклу + резерв{' '}
                {item.count_result.reserve})
              </span>
            )}
          </div>
        </div>
        <div className="flex items-end gap-2">
          <Field label="Количество">
            <Select
              value={item.count_mode ?? 'auto'}
              onValueChange={(v) => onChange({ count_mode: v as ItemDraft['count_mode'] })}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">по расчёту</SelectItem>
                <SelectItem value="manual">задать вручную</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {item.count_mode === 'manual' && (
            <Field label="Штук">
              <NumberField
                value={item.count_manual}
                onChange={(v) => onChange({ count_manual: v })}
                integer
                min={1}
                className="w-24"
              />
            </Field>
          )}
          <Button variant="ghost" size="sm" onClick={() => setShowOverrides((s) => !s)}>
            {showOverrides ? 'Скрыть свои значения' : 'Своя цена / производительность'}
          </Button>
          <Button variant="ghost" size="icon" aria-label="Убрать из сценария" onClick={onRemove}>
            <Trash2 />
          </Button>
        </div>
      </div>
      {showOverrides && (
        <div className="mt-3 grid grid-cols-[180px_200px_1fr] gap-3 border-t pt-3">
          <Field label="Своя цена за единицу">
            <NumberField
              value={item.price_override_rub}
              onChange={(v) => onChange({ price_override_rub: v })}
              placeholder="каталог"
              suffix="₽"
              min={0}
            />
          </Field>
          <Field label="Своя производительность">
            <NumberField
              value={item.throughput_override_per_hour}
              onChange={(v) => onChange({ throughput_override_per_hour: v })}
              placeholder="из цикла"
              suffix="ед/ч"
              min={0}
            />
          </Field>
          <Field label="Причина (обязательна)">
            <Input
              value={item.override_reason ?? ''}
              onChange={(e) => onChange({ override_reason: e.target.value || null })}
              placeholder="Например: КП вендора от 20.09, скидка 12 %"
            />
          </Field>
        </div>
      )}
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
        <div className="flex items-center gap-2">
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger className="w-72">
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
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-normal">Норматив</th>
              <th className="py-1 text-left font-normal">По умолчанию</th>
              <th className="py-1 text-left font-normal">Своё значение</th>
              <th className="py-1 text-left font-normal">Причина</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {draft.overrides.map((override, index) => {
              const norm = byKey.get(override.norm_key)
              return (
                <tr key={override.norm_key} className="border-t">
                  <td className="py-2 pr-3">
                    <div>{norm?.name ?? override.norm_key}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{override.norm_key}</div>
                  </td>
                  <td className="num py-2 pr-3 text-muted-foreground">
                    {formatValue(norm?.value ?? override.default_value, override.unit ?? norm?.unit)}
                  </td>
                  <td className="w-40 py-2 pr-3">
                    <NumberField
                      value={override.value}
                      onChange={(v) => update(index, { value: v ?? 0 })}
                      suffix={override.unit ?? norm?.unit ?? undefined}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      value={override.reason}
                      onChange={(e) => update(index, { reason: e.target.value })}
                      placeholder="Почему другое значение"
                    />
                  </td>
                  <td className="py-2">
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

function WarnMark({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-warn">
      <span className="size-1.5 rounded-full bg-warn" />
      {children}
    </span>
  )
}

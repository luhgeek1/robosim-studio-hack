import { Trash2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useProcesses, useProject } from '@/api/projects'
import { useNorms } from '@/api/reference'
import { useCalculate, useScenario, useUpdateScenario } from '@/api/scenarios'
import type { Financing, ObjectTypeKey, ScenarioKind } from '@/api/types'
import { formatRub, formatValue } from '@/lib/format'
import { SCENARIO_KIND_LABEL, SOURCE_KIND_LABEL } from '@/lib/labels'
import { useProjectId } from '@/lib/story'
import { useStore } from '@/store'
import { ErrorState, Loading } from '../States'
import { Button, Drawer, DrawerHeader, Field, Pill, Segmented, inputCls } from '../ui'
import { draftProblems, isOverridden, sameDraft, toDraft, toUpdate, type Draft, type ItemDraft } from './draft'
import type { ComparisonScenario } from './model'
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

type FinancingKind = NonNullable<Financing['kind']>

const FINANCING_OPTIONS: { value: FinancingKind; label: string }[] = [
  { value: 'own_funds', label: 'Свои средства' },
  { value: 'loan', label: 'Кредит' },
  { value: 'lease', label: 'Лизинг' },
]

// What-if for one robotization scenario (ТЗ 3.5.3–3.5.4): count, own price or throughput with a reason,
// financing, horizon and norm overrides. Saving recalculates, so the table behind updates at once.
export function ScenarioDrawer({
  open,
  scenarioId,
  options,
  onSwitch,
  onClose,
}: {
  open: boolean
  scenarioId: string | null
  options: ComparisonScenario[]
  onSwitch: (id: string) => void
  onClose: () => void
}) {
  return (
    <Drawer open={open} onClose={onClose} width={600}>
      {scenarioId && (
        <Editor key={scenarioId} scenarioId={scenarioId} options={options} onSwitch={onSwitch} onClose={onClose} />
      )}
    </Drawer>
  )
}

function Editor({
  scenarioId,
  options,
  onSwitch,
  onClose,
}: {
  scenarioId: string
  options: ComparisonScenario[]
  onSwitch: (id: string) => void
  onClose: () => void
}) {
  const projectId = useProjectId()
  const project = useProject(projectId).data
  const scenario = useScenario(scenarioId)
  const processes = useProcesses(projectId)
  const update = useUpdateScenario(projectId, scenarioId)
  const calculate = useCalculate(projectId, scenarioId)
  const toast = useStore((s) => s.toast)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [syncedAt, setSyncedAt] = useState<string | null>(null)

  // The server copy wins after every save; local edits live in the draft until then.
  if (scenario.data && scenario.data.updated_at !== syncedAt) {
    setSyncedAt(scenario.data.updated_at)
    setDraft(toDraft(scenario.data))
  }

  const processName = useMemo(
    () => new Map((processes.data?.processes ?? []).map((p) => [p.process_key, p.name])),
    [processes.data],
  )

  const current = scenario.data
  const kind = current?.kind ?? 'purchase'
  const dirty = Boolean(draft && current && !sameDraft(draft, toDraft(current)))
  const problems = draft ? draftProblems(draft) : []
  const busy = update.isPending || calculate.isPending

  const save = async () => {
    if (!draft) return
    try {
      if (dirty) await update.mutateAsync(toUpdate(draft))
      await calculate.mutateAsync()
      toast('Сценарий сохранён и пересчитан')
      onClose()
    } catch {
      // The problem is already shown as a toast by the mutation cache.
    }
  }

  const setItem = (uid: string, patch: Partial<ItemDraft>) =>
    draft && setDraft({ ...draft, items: draft.items.map((i) => (i.uid === uid ? { ...i, ...patch } : i)) })

  return (
    <>
      <DrawerHeader
        eyebrow="Что если · правка допущений сценария"
        title={`Настроить: ${SCENARIO_KIND_LABEL[kind].toLowerCase()}`}
        onClose={onClose}
      >
        {current && <div className="meta mt-1">{current.name}</div>}
        {options.length > 1 && (
          <div className="mt-3">
            <Segmented
              size="sm"
              layoutId="drawer-scenario"
              value={scenarioId}
              onChange={onSwitch}
              options={options.map((o) => ({ value: o.scenario_id, label: SCENARIO_KIND_LABEL[o.kind], hint: o.name }))}
            />
          </div>
        )}
      </DrawerHeader>

      <div className="scroll-thin flex-1 overflow-y-auto px-6 pb-4">
        {scenario.isPending && <Loading label="Открываем сценарий…" />}
        {scenario.isError && <ErrorState error={scenario.error} onRetry={() => scenario.refetch()} />}
        {draft && current && (
          <>
            <Section
              title="Роботы"
              description="Количество по умолчанию — по расчёту и имитации. Ручное количество, своя цена или производительность сохраняются только с причиной."
            >
              <div className="space-y-3">
                {draft.items.map((item) => (
                  <ItemEditor
                    key={item.uid}
                    item={item}
                    processName={processName.get(item.process_key) ?? item.process_key}
                    onChange={(patch) => setItem(item.uid, patch)}
                  />
                ))}
              </div>
            </Section>
            <Section title="Финансирование" description="Пустое поле — значение из реестра нормативов.">
              <FinancingFields
                kind={kind}
                financing={draft.financing}
                onChange={(financing) => setDraft({ ...draft, financing })}
              />
            </Section>
            <Section
              title="Горизонт и ставка"
              description="Меняются только для этого сценария; для честного сравнения задайте то же в остальных."
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label="Горизонт оценки">
                  <NumberField
                    value={draft.horizon_years}
                    onChange={(v) => setDraft({ ...draft, horizon_years: v })}
                    suffix="лет"
                    integer
                    min={1}
                  />
                </Field>
                <Field label="Ставка дисконтирования">
                  <NumberField
                    value={draft.discount_rate_pct}
                    onChange={(v) => setDraft({ ...draft, discount_rate_pct: v })}
                    placeholder="из нормативов"
                    suffix="%"
                    min={0}
                  />
                </Field>
              </div>
            </Section>
            {project && <NormOverrides objectType={project.object_type} draft={draft} onChange={setDraft} />}
          </>
        )}
      </div>

      <div className="border-t border-line px-6 py-4">
        {problems.length > 0 && <p className="mb-3 text-[12.5px] leading-relaxed text-warn">{problems[0]}</p>}
        <div className="flex items-center justify-between gap-3">
          <span className="meta">{dirty ? 'Есть несохранённые изменения' : 'Изменений нет'}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => current && setDraft(toDraft(current))} disabled={!dirty || busy}>
              Отменить
            </Button>
            <Button variant="primary" onClick={() => void save()} disabled={!dirty || problems.length > 0 || busy}>
              {busy ? 'Пересчитываем…' : 'Сохранить и пересчитать'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-5 first:border-t-0 first:pt-1">
      <div className="h3">{title}</div>
      {description && <p className="meta mt-1 leading-relaxed">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function ItemEditor({
  item,
  processName,
  onChange,
}: {
  item: ItemDraft
  processName: string
  onChange: (patch: Partial<ItemDraft>) => void
}) {
  const [showOwn, setShowOwn] = useState(item.price_override_rub != null || item.throughput_override_per_hour != null)
  const overridden = isOverridden(item)
  const reasonMissing = overridden && !item.override_reason?.trim()
  return (
    <div className="rounded-[12px] border border-line p-4">
      <div className="meta">{processName}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[14px] font-medium">
        {item.product_name}
        {item.candidate_status === 'check' && <Pill tone="warn">ТТХ требуют проверки</Pill>}
      </div>
      <div className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
        цена {formatRub(item.price_override_rub ?? item.price_rub)} за шт.
        {item.count_result && (
          <>
            {' '}
            · в расчёте {item.count_result.final} шт. — {item.count_result.explanation}
          </>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <span className="mb-1.5 block text-[12.5px] font-medium text-ink-2">Количество</span>
          <Segmented
            size="sm"
            layoutId={`count-${item.uid}`}
            value={item.count_mode ?? 'auto'}
            onChange={(count_mode) => onChange({ count_mode })}
            options={[
              { value: 'auto', label: 'по расчёту' },
              { value: 'manual', label: 'вручную' },
            ]}
          />
        </div>
        {item.count_mode === 'manual' && (
          <Field label="Штук" className="w-28">
            <NumberField
              value={item.count_manual}
              onChange={(v) => onChange({ count_manual: v })}
              integer
              min={1}
              suffix="шт."
              ariaLabel="Количество вручную"
            />
          </Field>
        )}
        <button
          type="button"
          onClick={() => setShowOwn((v) => !v)}
          className="h-8 text-[13px] font-medium text-accent hover:underline"
        >
          {showOwn ? 'Скрыть свою цену и производительность' : 'Своя цена или производительность'}
        </button>
      </div>

      {showOwn && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Своя цена за единицу">
            <NumberField
              value={item.price_override_rub}
              onChange={(v) => onChange({ price_override_rub: v })}
              placeholder={item.price_rub ? `каталог: ${formatValue(item.price_rub)}` : 'каталог'}
              suffix="₽"
              min={0}
            />
          </Field>
          <Field label="Своя производительность">
            <NumberField
              value={item.throughput_override_per_hour}
              onChange={(v) => onChange({ throughput_override_per_hour: v })}
              placeholder="по времени цикла"
              suffix="ед./ч"
              min={0}
            />
          </Field>
        </div>
      )}

      {overridden && (
        <Field
          label="Причина изменения — обязательно"
          hint="Попадёт в журнал проекта и в трассу расчёта"
          className="mt-3"
        >
          <input
            value={item.override_reason ?? ''}
            onChange={(e) => onChange({ override_reason: e.target.value || null })}
            placeholder="Например: КП вендора от 20.09, скидка 12 %"
            aria-invalid={reasonMissing || undefined}
            className={inputCls}
          />
        </Field>
      )}
    </div>
  )
}

function FinancingFields({
  kind,
  financing,
  onChange,
}: {
  kind: ScenarioKind
  financing: Financing
  onChange: (financing: Financing) => void
}) {
  const set = (patch: Partial<Financing>) => onChange({ ...financing, ...patch })
  const setRaas = (patch: Partial<NonNullable<Financing['raas']>>) =>
    set({ raas: { includes_service: true, includes_software: true, ...financing.raas, ...patch } })

  if (kind === 'raas') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Field label="Плата за робота в месяц">
          <NumberField
            value={financing.raas?.monthly_fee_rub_per_robot}
            onChange={(v) => setRaas({ monthly_fee_rub_per_robot: v })}
            placeholder="из нормативов"
            suffix="₽"
            min={0}
          />
        </Field>
        <Field label="Подключение, разово">
          <NumberField
            value={financing.raas?.setup_fee_rub}
            onChange={(v) => setRaas({ setup_fee_rub: v })}
            placeholder="из нормативов"
            suffix="₽"
            min={0}
          />
        </Field>
        <Field label="Срок договора">
          <NumberField
            value={financing.raas?.contract_years}
            onChange={(v) => setRaas({ contract_years: v })}
            placeholder="из нормативов"
            suffix="лет"
            min={0}
          />
        </Field>
        <Field label="Выкуп в конце срока">
          <NumberField
            value={financing.raas?.buyout_pct}
            onChange={(v) => setRaas({ buyout_pct: v })}
            placeholder="нет"
            suffix="%"
            min={0}
          />
        </Field>
        <p className="meta col-span-2">Сервис и ПО включены в абонентскую плату.</p>
      </div>
    )
  }

  // A leasing scenario is always financed by leasing on the server; a purchase chooses its source of funds.
  const financingKind = kind === 'lease' ? 'lease' : (financing.kind ?? 'own_funds')
  return (
    <div className="space-y-3">
      {kind !== 'lease' && (
        <Segmented
          size="sm"
          layoutId="financing-kind"
          value={financingKind}
          onChange={(v) => set({ kind: v })}
          options={FINANCING_OPTIONS}
        />
      )}
      {financingKind !== 'own_funds' && (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Ставка, годовых">
            <NumberField
              value={financing.rate_pct}
              onChange={(v) => set({ rate_pct: v })}
              placeholder="из нормативов"
              suffix="%"
              min={0}
            />
          </Field>
          <Field label="Срок">
            <NumberField
              value={financing.term_years}
              onChange={(v) => set({ term_years: v })}
              placeholder="из нормативов"
              suffix="лет"
              min={0}
            />
          </Field>
          <Field label={financingKind === 'lease' ? 'Аванс' : 'Первый взнос'}>
            <NumberField
              value={financing.down_payment_pct}
              onChange={(v) => set({ down_payment_pct: v })}
              placeholder="из нормативов"
              suffix="%"
              min={0}
            />
          </Field>
        </div>
      )}
      {financingKind === 'own_funds' && <p className="meta">Оборудование оплачивается сразу из своих средств.</p>}
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
  const editable = useMemo(() => (norms.data?.items ?? []).filter((n) => n.editable_by_user), [norms.data])
  const byKey = useMemo(() => new Map(editable.map((n) => [n.key, n])), [editable])
  const categories = useMemo(() => [...new Set(editable.map((n) => n.category))], [editable])
  const used = new Set(draft.overrides.map((o) => o.norm_key))

  const add = (key: string) => {
    const norm = byKey.get(key)
    if (!norm) return
    onChange({
      ...draft,
      overrides: [
        ...draft.overrides,
        { norm_key: norm.key, value: norm.value, unit: norm.unit, reason: '', default_value: norm.value },
      ],
    })
  }
  const update = (index: number, patch: Partial<Draft['overrides'][number]>) =>
    onChange({ ...draft, overrides: draft.overrides.map((o, i) => (i === index ? { ...o, ...patch } : o)) })

  return (
    <Section
      title="Нормативы"
      description="Любой норматив расчёта можно заменить своим значением с причиной — изменение попадёт в журнал и трассу."
    >
      <select
        aria-label="Добавить норматив"
        value=""
        onChange={(e) => add(e.target.value)}
        disabled={norms.isPending}
        className={`${inputCls} cursor-pointer`}
      >
        <option value="">{norms.isPending ? 'Загружаем нормативы…' : 'Заменить норматив…'}</option>
        {categories.map((category) => (
          <optgroup key={category} label={NORM_CATEGORY_LABEL[category] ?? category}>
            {editable
              .filter((n) => n.category === category && !used.has(n.key))
              .map((n) => (
                <option key={n.key} value={n.key}>
                  {n.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      {draft.overrides.length === 0 ? (
        <p className="meta mt-3">Расчёт идёт на нормативах по умолчанию.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {draft.overrides.map((override, index) => {
            const norm = byKey.get(override.norm_key)
            const unit = override.unit ?? norm?.unit
            return (
              <div key={override.norm_key} className="rounded-[12px] border border-line p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium">{norm?.name ?? override.norm_key}</div>
                    <div className="meta mt-0.5">
                      по умолчанию {formatValue(norm?.value ?? override.default_value, unit)}
                      {norm?.range?.min != null &&
                        norm.range.max != null &&
                        ` · диапазон ${formatValue(norm.range.min)}–${formatValue(norm.range.max)}`}
                      {norm && ` · ${SOURCE_KIND_LABEL[norm.source.kind]}`}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="!px-2"
                    aria-label="Убрать замену норматива"
                    onClick={() => onChange({ ...draft, overrides: draft.overrides.filter((_, i) => i !== index) })}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-[150px_1fr] gap-2">
                  <NumberField
                    value={override.value}
                    onChange={(v) => update(index, { value: v ?? 0 })}
                    suffix={unit ?? undefined}
                    ariaLabel="Новое значение"
                  />
                  <input
                    value={override.reason}
                    onChange={(e) => update(index, { reason: e.target.value })}
                    placeholder="Причина — обязательно"
                    aria-invalid={!override.reason.trim() || undefined}
                    className={inputCls}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )
}

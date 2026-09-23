import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, FileUp } from 'lucide-react'
import { useApplyImport, useProjectParams } from '@/api/projects'
import type { ImportResult, ProjectParam } from '@/api/types'
import { SourcePill } from '@/components/Provenance'
import { ErrorState } from '@/components/States'
import { Button, Modal } from '@/components/ui'
import { formatPct, formatValue, pluralRu } from '@/lib/format'
import { useStore } from '@/store'
import { IMPORT_ACCEPT } from './origin'
import type { ParamsImport } from './useParamsImport'
import { displayValue } from './paramValue'

const SOURCE_KIND_LABEL: Record<ImportResult['source_kind'], string> = {
  xlsx_template: 'Excel по шаблону',
  xlsx_freeform: 'Excel произвольного вида',
  csv: 'CSV',
  json: 'JSON',
  text_llm: 'Текст (ассистент)',
  pdf_llm: 'PDF (ассистент)',
}

type Mapped = ImportResult['mapped'][number]

export function ImportModal({ projectId, importer }: { projectId: string; importer: ParamsImport }) {
  const { fileName, pick, close, parse } = importer
  const inputRef = useRef<HTMLInputElement>(null)
  const result = parse.data

  return (
    <Modal
      open={fileName !== null}
      onClose={close}
      width={860}
      title="Загрузка параметров из файла"
      lead="Ничего не изменится, пока вы не нажмёте «Применить»: сначала проверьте, как поля файла сопоставились с параметрами объекта."
    >
      <input
        ref={inputRef}
        type="file"
        accept={IMPORT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) pick(file)
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const file = e.dataTransfer.files?.[0]
          if (file) pick(file)
        }}
        className="flex w-full items-center gap-3 rounded-[12px] border border-dashed border-line-2 px-4 py-3.5 text-left transition-colors hover:bg-surface-2"
      >
        {parse.isPending ? (
          <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-line-2 border-t-ink" />
        ) : (
          <FileUp size={20} className="shrink-0 text-ink-3" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium">{fileName ?? 'Выберите файл'}</span>
          <span className="block text-[12.5px] text-ink-3">
            {parse.isPending
              ? 'Разбираем файл…'
              : result
                ? `${SOURCE_KIND_LABEL[result.source_kind]} · сопоставлено ${result.mapped.length}, не распознано ${result.unmapped.length}`
                : 'Excel по шаблону, произвольный Excel, CSV или JSON'}
          </span>
        </span>
        <span className="shrink-0 text-[12.5px] font-medium text-accent">Выбрать другой файл</span>
      </button>

      {parse.isError && (
        <div className="mt-4">
          <ErrorState error={parse.error} title="Файл не удалось разобрать" />
        </div>
      )}
      {result && <ImportPreview key={result.import_id} projectId={projectId} result={result} onDone={close} />}
    </Modal>
  )
}

function ImportPreview({ projectId, result, onDone }: { projectId: string; result: ImportResult; onDone: () => void }) {
  const apply = useApplyImport(projectId)
  const params = useProjectParams(projectId)
  const toast = useStore((s) => s.toast)
  const [checked, setChecked] = useState(() => new Set(result.mapped.map((m) => m.key)))
  const [overwrite, setOverwrite] = useState(false)
  const byKey = useMemo(() => new Map((params.data?.params ?? []).map((p) => [p.key, p])), [params.data])
  const mapped = result.mapped
  const manualConflicts = mapped.filter((m) => m.conflict_with_current?.current_status === 'user').length

  const toggle = (key: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })

  const onApply = () => {
    const accepted = new Set(checked)
    apply.mutate(
      { importId: result.import_id, body: { accept_keys: [...accepted], overwrite_user_values: overwrite } },
      {
        onSuccess: (fresh) => {
          // Values typed by hand survive the import unless overwrite is on; say so instead of claiming every row.
          const applied = fresh.params.filter(
            (p) =>
              accepted.has(p.key) && (p.provenance.status === 'imported' || p.provenance.status === 'llm_suggested'),
          ).length
          const kept = accepted.size - applied
          toast(
            applied > 0
              ? `Импорт применён: ${applied} ${pluralRu(applied, ['параметр', 'параметра', 'параметров'])} — расчёты пересчитаются${kept > 0 ? `; ${kept} введённых вручную не тронуты` : ''}`
              : 'Ничего не изменилось: значения, введённые вручную, сохранены',
          )
          onDone()
        },
      },
    )
  }

  return (
    <div className="mt-5 space-y-5">
      {result.warnings.length > 0 && (
        <ul className="space-y-1 rounded-[10px] bg-warn-soft px-3 py-2.5 text-[12.5px] text-warn">
          {result.warnings.map((warning, i) => (
            <li key={i} className="flex gap-1.5">
              <AlertTriangle size={13} className="mt-[3px] shrink-0" />
              {warning}
            </li>
          ))}
        </ul>
      )}

      {mapped.length === 0 ? (
        <p className="rounded-[12px] bg-surface-2 px-4 py-4 text-[13.5px] text-ink-3">
          В файле не нашлось значений, которые можно сопоставить с параметрами объекта. Заполните колонку значений в
          шаблоне Excel или проверьте названия полей.
        </p>
      ) : (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <label className="flex items-center gap-2 text-[13px] font-medium">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#17171a]"
                checked={checked.size === mapped.length}
                ref={(el) => {
                  if (el) el.indeterminate = checked.size > 0 && checked.size < mapped.length
                }}
                onChange={(e) => setChecked(e.target.checked ? new Set(mapped.map((m) => m.key)) : new Set())}
              />
              Распознано <span className="num text-ink-3">{mapped.length}</span>
            </label>
            <span className="meta">новое значение · сейчас в проекте</span>
          </div>
          <ul className="card divide-y divide-line overflow-hidden">
            {mapped.map((item) => (
              <MappedRow
                key={item.key}
                item={item}
                param={byKey.get(item.key)}
                checked={checked.has(item.key)}
                onToggle={(on) => toggle(item.key, on)}
              />
            ))}
          </ul>
        </section>
      )}

      {result.unmapped.length > 0 && (
        <section>
          <div className="mb-1.5 text-[13px] font-medium">
            Не распознано <span className="num text-ink-3">{result.unmapped.length}</span>
          </div>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-2">
            {result.unmapped.map((item, i) => {
              const suggestion = item.suggestion_key ? byKey.get(item.suggestion_key) : undefined
              return (
                <li key={i} className="min-w-0 truncate" title={`${item.raw_field ?? ''}: ${item.raw_value ?? ''}`}>
                  <span className="text-ink">{item.raw_field ?? '—'}</span>
                  {item.raw_value && <span className="text-ink-3">: {item.raw_value}</span>}
                  {item.suggestion_key && (
                    <span className="text-ink-4"> · возможно, «{suggestion?.name ?? item.suggestion_key}»</span>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="mt-1.5 text-[12px] text-ink-4">
            Эти поля не применятся. Их можно ввести вручную в параметрах объекта.
          </p>
        </section>
      )}

      <div className="sticky -bottom-6 -mx-6 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-6 py-4">
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#17171a]"
            checked={overwrite}
            onChange={(e) => setOverwrite(e.target.checked)}
          />
          Перезаписать значения, введённые вручную
          {manualConflicts > 0 && <span className="num text-warn">({manualConflicts})</span>}
        </label>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onDone}>
            Отмена
          </Button>
          <Button variant="primary" onClick={onApply} disabled={checked.size === 0 || apply.isPending}>
            {apply.isPending ? 'Применяем…' : `Применить${checked.size > 0 ? ` (${checked.size})` : ''}`}
          </Button>
        </div>
      </div>
    </div>
  )
}

function MappedRow({
  item,
  param,
  checked,
  onToggle,
}: {
  item: Mapped
  param?: ProjectParam
  checked: boolean
  onToggle: (on: boolean) => void
}) {
  const conflict = item.conflict_with_current
  const manual = conflict?.current_status === 'user'
  const show = (value: ProjectParam['value'] | undefined) =>
    param ? displayValue(param, value ?? null) : formatValue(value ?? null, item.unit)
  return (
    <li className={`transition-opacity ${checked ? '' : 'opacity-55'}`}>
      <label className="grid cursor-pointer grid-cols-[20px_minmax(0,1fr)_minmax(0,240px)_140px] items-start gap-3 px-4 py-2.5 hover:bg-surface-2">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-[#17171a]"
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={`Применить «${item.name}»`}
        />
        <span className="min-w-0">
          <span className="block text-[13.5px] leading-snug font-medium">{item.name}</span>
          {item.raw_field && (
            <span
              className="block truncate text-[12px] text-ink-3"
              title={`${item.raw_field}: ${item.raw_value ?? ''}`}
            >
              в файле: «{item.raw_field}»{item.raw_value ? ` = ${item.raw_value}` : ''}
            </span>
          )}
        </span>
        <span className="num text-right">
          <span className="block text-[13.5px] font-medium">{show(item.value)}</span>
          {conflict && (
            <span className={`block text-[12px] ${manual ? 'text-warn' : 'text-ink-3'}`}>
              сейчас: {show(conflict.current_value)}
              {manual && ' (введено вручную)'}
            </span>
          )}
        </span>
        <span className="flex items-center justify-end gap-2">
          <SourcePill status={item.status} />
          <span
            className={`num w-10 text-right text-[12px] whitespace-nowrap ${item.confidence < 0.7 ? 'text-warn' : 'text-ink-3'}`}
            title="Насколько уверенно поле файла сопоставлено с параметром"
          >
            {formatPct(item.confidence, { share: true, digits: 0 })}
          </span>
        </span>
      </label>
    </li>
  )
}

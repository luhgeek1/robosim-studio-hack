import { useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useUpdateParam } from '@/api/projects'
import type { ProjectParam } from '@/api/types'
import { SourceDot } from '@/components/Provenance'
import { Hint } from '@/components/ui'
import { useStore } from '@/store'
import { ParamMenu } from './ParamMenu'
import { displayRange, displayValue, paramType, parseDraft, sameValue, toDraft, type ParamValue } from './paramValue'

const editorCls =
  'num h-7 rounded-[6px] border border-ink bg-surface px-2 text-right text-[13px] outline-none aria-[invalid=true]:border-crit disabled:opacity-60'

export function ParamRow({
  projectId,
  param,
  processNames,
}: {
  projectId: string
  param: ProjectParam
  processNames: Map<string, string>
}) {
  const update = useUpdateParam(projectId)
  const toast = useStore((s) => s.toast)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const check = param.validation
  const flagged = check.status === 'warning' || check.status === 'error'
  const missing = param.value === null || param.value === undefined || param.value === ''

  const stop = () => {
    setEditing(false)
    setError(null)
  }

  const save = async (value: ParamValue) => {
    if (sameValue(value, param.value)) return stop()
    try {
      await update.mutateAsync({ key: param.key, value, unit: param.unit ?? null })
      stop()
      toast('Параметр обновлён — расчёты пересчитаются')
    } catch {
      // The API error is toasted globally; the editor stays open so the value can be fixed.
    }
  }

  return (
    <div id={`param-${param.key}`} className="group grid scroll-mt-24 grid-cols-[minmax(0,1fr)_auto] gap-x-3 py-[7px]">
      <dt className="self-baseline text-[13px] leading-snug text-ink-3">
        <Hint content={<ParamHint param={param} />} side="left">
          <span className="cursor-help">{param.name}</span>
        </Hint>
      </dt>
      <dd className="flex items-center justify-end gap-1.5 self-baseline text-right text-[13.5px] font-medium text-ink">
        {flagged && (
          <AlertTriangle size={12} className={check.status === 'error' ? 'text-crit' : 'text-warn'} aria-hidden />
        )}
        <SourceDot provenance={param.provenance} />
        {editing ? (
          <ValueEditor
            param={param}
            pending={update.isPending}
            error={error}
            onError={setError}
            onSave={save}
            onCancel={stop}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={`-mx-1 rounded-[6px] px-1 text-right hover:bg-black/[0.05] ${missing ? 'font-normal text-ink-4' : ''}`}
            title="Нажмите, чтобы изменить"
          >
            {displayValue(param)}
          </button>
        )}
        <ParamMenu projectId={projectId} param={param} processNames={processNames} />
      </dd>
      {editing && (
        <dd className="col-span-2 mt-1.5">
          <EditHelp param={param} error={error} />
        </dd>
      )}
      {!editing && flagged && check.message && (
        <dd
          className={`col-span-2 mt-1 text-[12px] leading-snug ${check.status === 'error' ? 'text-crit' : 'text-warn'}`}
        >
          {check.message}
        </dd>
      )}
    </div>
  )
}

function ValueEditor({
  param,
  pending,
  error,
  onError,
  onSave,
  onCancel,
}: {
  param: ProjectParam
  pending: boolean
  error: string | null
  onError: (error: string | null) => void
  onSave: (value: ParamValue) => Promise<void>
  onCancel: () => void
}) {
  const type = paramType(param)
  const [draft, setDraft] = useState(() => toDraft(param))
  // Enter and the blur that follows must not send the same value twice.
  const sent = useRef<string | null>(null)

  if (type === 'boolean' || type === 'enum') {
    const options =
      type === 'boolean'
        ? [
            { value: 'true', label: 'да' },
            { value: 'false', label: 'нет' },
          ]
        : (param.definition?.enum_values ?? [])
            .filter((o) => o.value !== undefined)
            .map((o) => ({ value: o.value!, label: o.label ?? o.value! }))
    return (
      <select
        autoFocus
        disabled={pending}
        aria-label={param.name}
        defaultValue={param.value === null ? '' : String(param.value)}
        onChange={(e) => void onSave(type === 'boolean' ? e.target.value === 'true' : e.target.value)}
        onBlur={onCancel}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        className={`${editorCls} max-w-[180px] text-left`}
      >
        {param.value === null && <option value="">не задано</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    )
  }

  const commit = () => {
    if (pending || sent.current === draft) return
    if (draft.trim() === '') return onCancel()
    const parsed = parseDraft(draft, type)
    if (!parsed.ok) return onError(parsed.error)
    sent.current = draft
    void onSave(parsed.value).finally(() => {
      sent.current = null
    })
  }

  return (
    <input
      autoFocus
      value={draft}
      disabled={pending}
      inputMode={type === 'number' || type === 'integer' ? 'decimal' : 'text'}
      aria-label={param.unit ? `${param.name}, ${param.unit}` : param.name}
      aria-invalid={error ? true : undefined}
      placeholder={param.definition?.example ?? undefined}
      onChange={(e) => {
        setDraft(e.target.value)
        if (error) onError(null)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') onCancel()
      }}
      className={`${editorCls} ${type === 'string' || type === 'dimensions' ? 'w-36' : 'w-28'}`}
    />
  )
}

function EditHelp({ param, error }: { param: ProjectParam; error: string | null }) {
  const def = param.definition
  const range = displayRange(param)
  return (
    <div className="rounded-[8px] bg-surface-2 px-2.5 py-2 text-[12px] leading-snug text-ink-3">
      {error && <div className="mb-1 font-medium text-crit">{error}</div>}
      {def?.hint && <p>{def.hint}</p>}
      {(def?.example || range) && (
        <p className="mt-1">
          {def?.example && (
            <>
              пример: <span className="text-ink">{def.example}</span>
            </>
          )}
          {def?.example && range && ' · '}
          {range && (
            <>
              типично: <span className="num text-ink">{range}</span>
            </>
          )}
        </p>
      )}
      <p className="mt-1 text-ink-4">
        {paramType(param) === 'boolean' || paramType(param) === 'enum'
          ? 'Выберите значение, Esc — отмена'
          : 'Enter — сохранить, Esc — отмена'}
        {param.unit && ` · единица: ${param.unit}`}
      </p>
    </div>
  )
}

export function ParamHint({ param }: { param: ProjectParam }) {
  const def = param.definition
  const range = displayRange(param)
  return (
    <div className="space-y-1">
      <div className="font-medium">{param.name}</div>
      {def?.hint && <div className="opacity-85">{def.hint}</div>}
      {def?.example && <div className="opacity-75">Пример: {def.example}</div>}
      {range && <div className="opacity-75">Типичный диапазон: {range}</div>}
      {def?.required && <div className="opacity-75">Обязательный параметр</div>}
    </div>
  )
}

import { Fragment, useId, useRef, useState } from 'react'
import type { ProjectParam } from '@/shared/api/types'
import { cn } from '@/shared/lib/utils'
import { parseDimensionDraft, sameValue, toDimensionDraft, type DimensionDraft, type ParamValue } from './parse'

const PARTS = ['Длина', 'Ширина', 'Высота']

export function DimensionsValueInput({
  param,
  label,
  pending,
  onCommit,
  suffix,
}: {
  param: ProjectParam
  label: string
  pending: boolean
  onCommit: (value: ParamValue) => Promise<unknown>
  suffix?: string | null
}) {
  const [draft, setDraft] = useState<DimensionDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const errorId = useId()
  const shown = draft ?? toDimensionDraft(param.value)
  const example = toDimensionDraft(param.definition?.example)
  const saved = param.value ? parseDimensionDraft(toDimensionDraft(param.value)) : null
  const message = error ?? (draft === null && saved && !saved.ok ? saved.error : null)

  const commit = async () => {
    if (draft === null || pending) return
    if (draft.every((part) => !part.trim())) {
      setDraft(null)
      setError(null)
      return
    }
    const parsed = parseDimensionDraft(draft)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setError(null)
    if (sameValue(parsed.value, param.value)) {
      setDraft(null)
      return
    }
    try {
      await onCommit(parsed.value)
      setDraft(null)
    } catch {
      // The API error is toasted globally; retain all three values for another attempt.
    }
  }

  return (
    <div className="space-y-1">
      <div
        role="group"
        aria-label={label}
        className={cn(
          'flex min-w-0 items-center gap-1 rounded-lg border border-input bg-transparent px-2 py-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
          pending && 'bg-input/50 opacity-50',
          message && 'border-destructive ring-3 ring-destructive/20',
        )}
        onBlur={(event) => {
          // Moving between the three inputs must not save an incomplete set or disable the next input.
          if (!event.currentTarget.contains(event.relatedTarget)) void commit()
        }}
      >
        {PARTS.map((part, index) => (
          <Fragment key={part}>
            {index > 0 && (
              <span aria-hidden="true" className="mt-3 shrink-0 text-sm text-ink-4">
                ×
              </span>
            )}
            <label className="min-w-0 flex-1 rounded-sm px-0.5 focus-within:bg-surface-2">
              <span className="block text-[10px] leading-3.5 text-ink-3">{part}</span>
              <input
                ref={(input) => {
                  inputs.current[index] = input
                }}
                value={shown[index]}
                inputMode="decimal"
                aria-label={`${part}, ${label}`}
                aria-invalid={message ? true : undefined}
                aria-describedby={message ? errorId : undefined}
                placeholder={example[index] || '—'}
                disabled={pending}
                className="num block h-6 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-ink-4 disabled:cursor-not-allowed sm:text-sm"
                onChange={(event) => {
                  const next: DimensionDraft = [...shown]
                  next[index] = event.target.value
                  setDraft(next)
                  setError(null)
                }}
                onPaste={(event) => {
                  const parts = toDimensionDraft(event.clipboardData.getData('text'))
                  if (!parts[1] || !parts[2]) return
                  event.preventDefault()
                  setDraft(parts)
                  setError(null)
                  inputs.current[2]?.focus()
                }}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setDraft(null)
                    setError(null)
                  }
                  const separator = !event.ctrlKey && !event.metaKey && !event.altKey && /^[×xх*]$/i.test(event.key)
                  if (event.key === 'Enter' || separator) {
                    event.preventDefault()
                    if (index < 2) inputs.current[index + 1]?.focus()
                    else if (event.key === 'Enter') event.currentTarget.blur()
                  }
                }}
              />
            </label>
          </Fragment>
        ))}
        {suffix && <span className="mt-3 ml-0.5 shrink-0 text-[12.5px] text-ink-3">{suffix}</span>}
      </div>
      {message && (
        <div id={errorId} aria-live="polite" className="text-xs text-crit">
          {message}
        </div>
      )}
    </div>
  )
}

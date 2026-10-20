import { useState } from 'react'
import type { ProjectParam } from '@/shared/api/types'
import { cn } from '@/shared/lib/utils'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Switch } from '@/shared/ui/switch'
import { DimensionsValueInput } from './DimensionsValueInput'
import { parseDraft, sameValue, toDraft, type ParamType, type ParamValue } from './parse'

export function ParamValueInput({
  param,
  pending,
  onCommit,
  suffix,
}: {
  param: ProjectParam
  pending: boolean
  onCommit: (value: ParamValue) => Promise<unknown>
  suffix?: string | null
}) {
  const type: ParamType = param.definition?.type ?? 'string'
  const label = `${param.name}${param.unit ? `, ${param.unit}` : ''}`

  if (type === 'dimensions') {
    return (
      <DimensionsValueInput
        key={`${param.key}:${String(param.value)}`}
        param={param}
        label={label}
        pending={pending}
        onCommit={onCommit}
        suffix={suffix ?? param.unit}
      />
    )
  }

  if (type === 'boolean') {
    return (
      <label className="inline-flex h-8 shrink-0 items-center gap-2 text-sm whitespace-nowrap">
        <span className="min-w-6 text-muted-foreground">
          {param.value === true ? 'да' : param.value === false ? 'нет' : '-'}
        </span>
        <Switch
          checked={param.value === true}
          disabled={pending}
          onCheckedChange={(checked) => void onCommit(checked)}
          aria-label={label}
        />
      </label>
    )
  }

  const options = param.definition?.enum_values?.filter((o) => o.value !== undefined) ?? []
  if (type === 'enum' && options.length > 0) {
    return (
      <Select
        value={typeof param.value === 'string' ? param.value : undefined}
        onValueChange={(value) => void onCommit(value)}
        disabled={pending}
      >
        <SelectTrigger className="w-full max-sm:data-[size=default]:h-10" aria-label={label}>
          <SelectValue placeholder="Не задано" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value!}>
              {option.label ?? option.value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  return (
    <TextValueInput param={param} type={type} label={label} pending={pending} onCommit={onCommit} suffix={suffix} />
  )
}

function TextValueInput({
  param,
  type,
  label,
  pending,
  onCommit,
  suffix,
}: {
  param: ProjectParam
  type: ParamType
  label: string
  pending: boolean
  onCommit: (value: ParamValue) => Promise<unknown>
  suffix?: string | null
}) {
  // null means "not editing": the input shows the server value, so a refetch after save never fights the user.
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const numeric = type === 'number' || type === 'integer'
  const shown = draft ?? toDraft(param.value, type)

  const commit = async () => {
    if (draft === null) return
    if (draft.trim() === '') {
      setDraft(null)
      setError(null)
      return
    }
    const parsed = parseDraft(draft, type)
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
      // The API error is toasted globally; keep the draft so the user can fix it.
    }
  }

  return (
    <div className="space-y-1">
      <div
        className={cn(
          suffix &&
            'flex h-8 items-center gap-2 rounded-lg border border-input pr-2.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 max-sm:h-10 dark:bg-input/30',
          suffix && pending && 'cursor-not-allowed bg-input/50 opacity-50 dark:bg-input/80',
          suffix && error && 'border-destructive ring-3 ring-destructive/20 dark:ring-destructive/40',
        )}
      >
        <Input
          value={shown}
          inputMode={numeric ? 'decimal' : 'text'}
          placeholder={param.definition?.example ? `напр. ${param.definition.example}` : 'нет данных'}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          disabled={pending}
          className={cn(
            'max-sm:h-10',
            numeric && 'num text-right',
            suffix &&
              'h-full flex-1 rounded-none border-0 pr-0 focus-visible:ring-0 disabled:bg-transparent disabled:opacity-100 aria-invalid:ring-0 max-sm:h-full dark:bg-transparent dark:disabled:bg-transparent',
          )}
          onChange={(event) => {
            setDraft(event.target.value)
            if (error) setError(null)
          }}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              setDraft(null)
              setError(null)
            }
          }}
        />
        {suffix && (
          <span
            aria-hidden="true"
            className="pointer-events-none max-w-[55%] shrink-0 text-[12.5px] leading-tight wrap-anywhere text-ink-3"
          >
            {suffix}
          </span>
        )}
      </div>
      {error && <div className="text-xs text-crit">{error}</div>}
    </div>
  )
}

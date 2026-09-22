import { useState } from 'react'
import type { ProjectParam } from '@/shared/api/types'
import { cn } from '@/shared/lib/utils'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Switch } from '@/shared/ui/switch'
import { parseDraft, sameValue, toDraft, type ParamType, type ParamValue } from './parse'

export function ParamValueInput({
  param,
  pending,
  onCommit,
}: {
  param: ProjectParam
  pending: boolean
  onCommit: (value: ParamValue) => Promise<unknown>
}) {
  const type: ParamType = param.definition?.type ?? 'string'
  const label = `${param.name}${param.unit ? `, ${param.unit}` : ''}`

  if (type === 'boolean') {
    return (
      <label className="flex h-8 items-center gap-2">
        <Switch
          checked={param.value === true}
          disabled={pending}
          onCheckedChange={(checked) => void onCommit(checked)}
          aria-label={label}
        />
        <span className="text-muted-foreground">
          {param.value === true ? 'да' : param.value === false ? 'нет' : '—'}
        </span>
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
        <SelectTrigger className="w-full" aria-label={label}>
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

  return <TextValueInput param={param} type={type} label={label} pending={pending} onCommit={onCommit} />
}

function TextValueInput({
  param,
  type,
  label,
  pending,
  onCommit,
}: {
  param: ProjectParam
  type: ParamType
  label: string
  pending: boolean
  onCommit: (value: ParamValue) => Promise<unknown>
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
      <Input
        value={shown}
        inputMode={numeric ? 'decimal' : 'text'}
        placeholder={param.definition?.example ? `напр. ${param.definition.example}` : 'нет данных'}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        disabled={pending}
        className={cn(numeric && 'num text-right')}
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
      {error && <div className="text-xs text-crit">{error}</div>}
    </div>
  )
}

import { useState } from 'react'
import { cn } from '@/shared/lib/utils'
import { Input } from '@/shared/ui/input'

const parse = (text: string): number | null => {
  const normalized = text.replace(/\s/g, '').replace(',', '.')
  if (normalized === '') return null
  const value = Number(normalized)
  return Number.isFinite(value) ? value : NaN
}

const show = (value: number | null | undefined) => (value == null ? '' : String(value).replace('.', ','))

// Keeps the raw text while typing so "1," or "0,0" are not reformatted mid-edit; commits a number or null.
export function NumberField({
  value,
  onChange,
  placeholder,
  suffix,
  className,
  min,
  integer,
  ariaLabel,
}: {
  value: number | null | undefined
  onChange: (value: number | null) => void
  placeholder?: string
  suffix?: string
  className?: string
  min?: number
  integer?: boolean
  ariaLabel?: string
}) {
  const [text, setText] = useState(show(value))
  const [synced, setSynced] = useState(value)
  if (value !== synced) {
    setSynced(value)
    setText(show(value))
  }
  const parsed = parse(text)
  const invalid =
    Number.isNaN(parsed) ||
    (parsed != null && ((min != null && parsed < min) || (integer && !Number.isInteger(parsed))))

  return (
    <div className={cn('relative', className)}>
      <Input
        inputMode="decimal"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        value={text}
        placeholder={placeholder}
        className={cn('num', suffix && 'pr-12')}
        onChange={(e) => {
          setText(e.target.value)
          const next = parse(e.target.value)
          if (!Number.isNaN(next)) {
            setSynced(next)
            onChange(next)
          }
        }}
      />
      {suffix && (
        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  )
}

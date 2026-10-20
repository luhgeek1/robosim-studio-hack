import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

export function ProjectChoice({
  name,
  value,
  active,
  disabled,
  onChange,
  compact,
  children,
}: {
  name: string
  value: string
  active: boolean
  disabled?: boolean
  onChange: () => void
  compact?: boolean
  children: ReactNode
}) {
  return (
    <label className={cn('relative flex min-w-0 cursor-pointer', disabled && 'cursor-not-allowed opacity-50')}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={active}
        disabled={disabled}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        className={cn(
          'flex min-h-11 w-full min-w-0 gap-3 rounded-lg border bg-raised/40 p-3 text-left leading-snug transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2',
          !disabled && 'hover:border-primary/50',
          active && 'border-primary bg-accent/60',
          compact && 'flex-col items-center justify-center gap-2 px-1.5 text-center text-xs sm:px-3 sm:text-sm',
        )}
      >
        {!compact && (
          <span
            aria-hidden="true"
            className={cn(
              'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
              active && 'border-primary bg-primary text-primary-foreground',
            )}
          >
            {active && <Check className="size-3" />}
          </span>
        )}
        <span className={cn('flex min-w-0 flex-col gap-1 wrap-anywhere', compact && 'items-center gap-2')}>
          {children}
        </span>
      </span>
    </label>
  )
}

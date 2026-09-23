import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="text-[22px] leading-tight font-semibold tracking-tight">{title}</h1>
        {description && <p className="max-w-2xl text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('rounded-lg border bg-surface', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-3">
          <div className="min-w-0 space-y-0.5">
            {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  )
}

/* Строка показаний: числа в одной линейке, разделённые тонкими линиями, а не набор одинаковых коробок. */
export function StatStrip({
  children,
  columns,
  className,
}: {
  children: ReactNode
  columns?: number
  className?: string
}) {
  return (
    <div
      className={cn('grid divide-y overflow-hidden rounded-lg border bg-surface md:divide-x md:divide-y-0', className)}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
    >
      {children}
    </div>
  )
}

export function Stat({
  label,
  value,
  hint,
  className,
  valueClassName,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  className?: string
  valueClassName?: string
}) {
  return (
    <div className={cn('min-w-0 px-4 py-3', className)}>
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className={cn('num mt-1 text-xl leading-none font-semibold tracking-tight', valueClassName)}>{value}</div>
      {hint && <div className="mt-1.5 truncate text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

export function Callout({
  tone = 'warn',
  children,
  action,
  className,
}: {
  tone?: 'warn' | 'crit' | 'info'
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  const border = { warn: 'border-l-warn', crit: 'border-l-crit', info: 'border-l-info' }[tone]
  return (
    <div className={cn('flex items-start gap-3 rounded-lg border border-l-2 bg-surface px-4 py-3', border, className)}>
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  )
}

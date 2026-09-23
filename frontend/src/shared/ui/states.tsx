import type { ReactNode } from 'react'
import { AlertTriangle, Loader2, RotateCw } from 'lucide-react'
import { parseApiProblem } from '@/shared/api/problem'
import { cn } from '@/shared/lib/utils'
import { Button } from './button'
import { Skeleton } from './skeleton'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin', className)} />
}

export function LoadingBlock({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  )
}

export function ErrorBlock({
  error,
  onRetry,
  className,
}: {
  error: unknown
  onRetry?: () => void
  className?: string
}) {
  const problem = parseApiProblem(error)
  return (
    <div className={cn('flex items-start gap-3 rounded-lg border border-l-2 border-l-crit bg-surface p-4', className)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-crit" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{problem.detail}</div>
        {problem.details.length > 0 && (
          <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
            {problem.details.slice(0, 5).map((d, i) => (
              <li key={i}>{d.msg}</li>
            ))}
          </ul>
        )}
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RotateCw /> Повторить
        </Button>
      )}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-1.5 rounded-lg border border-dashed border-input bg-surface/60 px-6 py-8',
        className,
      )}
    >
      {icon && <div className="mb-1 text-muted-foreground">{icon}</div>}
      <div className="text-base font-medium">{title}</div>
      {description && <div className="max-w-xl text-muted-foreground">{description}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

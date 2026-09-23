import type { ReactNode } from 'react'
import { Loader2, RotateCw } from 'lucide-react'
import { parseApiProblem } from '@/shared/api/problem'
import { cn } from '@/shared/lib/utils'
import { Button } from './button'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin', className)} />
}

export function LoadingBlock({ label = 'Считаем…', className }: { rows?: number; label?: string; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-[12px] border border-dashed border-line px-5 py-8 text-[13.5px] text-ink-3',
        className,
      )}
    >
      <span className="size-4 animate-spin rounded-full border-2 border-line-2 border-t-ink" />
      {label}
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
    <div className={cn('rounded-[12px] border border-crit/30 bg-crit-soft/50 px-5 py-4 text-[13.5px]', className)}>
      <div className="font-medium text-crit">Не удалось получить данные</div>
      <div className="mt-1 text-ink-2">{problem.detail}</div>
      {problem.details.length > 0 && (
        <ul className="mt-1 list-disc pl-4 text-xs text-ink-3">
          {problem.details.slice(0, 5).map((d, i) => (
            <li key={i}>{d.msg}</li>
          ))}
        </ul>
      )}
      {onRetry && (
        <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>
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
        'flex flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-line px-6 py-10 text-center',
        className,
      )}
    >
      {icon && <div className="text-ink-3">{icon}</div>}
      <div className="h3">{title}</div>
      {description && <div className="max-w-md text-[14px] text-ink-3">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

import { RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { parseApiProblem } from '@/api/problem'
import { Button } from './ui'

export function Loading({ label = 'Считаем…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] border border-dashed border-line px-5 py-8 text-[13.5px] text-ink-3">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-2 border-t-ink" />
      {label}
    </div>
  )
}

export function ErrorState({
  error,
  onRetry,
  title = 'Не удалось получить данные',
}: {
  error: unknown
  onRetry?: () => void
  title?: string
}) {
  const problem = parseApiProblem(error)
  return (
    <div className="rounded-[12px] border border-crit/30 bg-crit-soft/50 px-5 py-4 text-[13.5px]">
      <div className="font-medium text-crit">{title}</div>
      <div className="mt-1 text-ink-2">{problem.detail}</div>
      {onRetry && (
        <Button size="sm" className="mt-3" icon={<RefreshCw size={13} />} onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-[8px] bg-black/[0.06] ${className}`} />
}

export function Empty({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[14px] border border-dashed border-line-2 px-6 py-10 text-center">
      <div className="h3">{title}</div>
      {children && <div className="mx-auto mt-2 max-w-[520px] text-[14px] leading-relaxed text-ink-3">{children}</div>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

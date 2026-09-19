import { RefreshCw } from 'lucide-react'
import { Button } from './ui'

export function Loading({ label = 'Считаем…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] border border-dashed border-line px-5 py-8 text-[13.5px] text-ink-3">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-2 border-t-ink" />
      {label}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="rounded-[12px] border border-crit/30 bg-crit-soft/50 px-5 py-4 text-[13.5px]">
      <div className="font-medium text-crit">Не удалось получить данные</div>
      <div className="mt-1 text-ink-2">{error.message}</div>
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

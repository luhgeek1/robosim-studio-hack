import { Plus } from 'lucide-react'
import { useState } from 'react'
import { CANDIDATE_STATUS_LABEL, useMatching } from '@/entities/matching'
import type { Candidate, CandidateStatus } from '@/shared/api/types'
import { formatRub } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/ui/dialog'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { ToneBadge, type Tone } from '@/shared/ui/tone'

const STATUS_TONE: Record<CandidateStatus, Tone> = { fit: 'ok', check: 'warn', manual: 'info', excluded: 'crit' }

export function AddItemDialog({
  projectId,
  onAdd,
}: {
  projectId: string
  onAdd: (processKey: string, candidate: Candidate) => void
}) {
  const [open, setOpen] = useState(false)
  const matching = useMatching(projectId)
  const [processKey, setProcessKey] = useState<string | null>(null)
  const processes = matching.data?.processes ?? []
  const current = processes.find((p) => p.process_key === processKey) ?? processes[0]
  // Excluded candidates stay visible (with reasons) but cannot be added here: that is a manual override (ТЗ 3.4.4).
  const candidates = (current?.candidates ?? []).filter((c) => c.status !== 'excluded')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus /> Добавить решение
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Добавить решение в сценарий</DialogTitle>
          <DialogDescription>Кандидаты из подбора: подходящие и требующие проверки.</DialogDescription>
        </DialogHeader>
        {matching.isPending && <LoadingBlock rows={3} />}
        {matching.isError && <ErrorBlock error={matching.error} />}
        {current && (
          <div className="grid max-h-[60vh] grid-cols-[220px_1fr] gap-4">
            <div className="space-y-1 overflow-y-auto">
              {processes.map((p) => (
                <button
                  key={p.process_key}
                  type="button"
                  onClick={() => setProcessKey(p.process_key)}
                  className={cn(
                    'w-full rounded-md px-2.5 py-2 text-left hover:bg-muted',
                    p.process_key === current.process_key && 'bg-muted font-medium',
                  )}
                >
                  <div className="leading-snug">{p.name}</div>
                  {p.demand_summary && <div className="text-xs text-muted-foreground">{p.demand_summary}</div>}
                </button>
              ))}
            </div>
            <div className="space-y-2 overflow-y-auto pr-1">
              {candidates.length === 0 && (
                <p className="text-muted-foreground">{current.no_fit_message ?? 'Подходящих решений нет.'}</p>
              )}
              {candidates.map((c) => (
                <div key={c.product.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{c.product.name}</span>
                      <ToneBadge tone={STATUS_TONE[c.status]}>{CANDIDATE_STATUS_LABEL[c.status]}</ToneBadge>
                      {c.score != null && (
                        <span className="num text-xs text-muted-foreground">балл {Math.round(c.score)}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.product.manufacturer.name} · {c.product.solution_type_name ?? c.product.solution_type} · от{' '}
                      {formatRub(c.product.price_from.amount_rub)}
                      {c.estimate?.robots_count != null && ` · оценка ≈ ${c.estimate.robots_count} шт.`}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      onAdd(current.process_key, c)
                      setOpen(false)
                    }}
                  >
                    Добавить
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

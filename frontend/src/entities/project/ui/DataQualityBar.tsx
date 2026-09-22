import type { DataQualitySummary, ProvenanceStatus } from '@/shared/api/types'
import { PROVENANCE_LABEL } from '@/entities/provenance'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'

const ORDER: ProvenanceStatus[] = [
  'user',
  'imported',
  'confirmed',
  'derived',
  'default',
  'assumption',
  'vendor_claim',
  'llm_suggested',
  'missing',
]

const COLOR: Record<ProvenanceStatus, string> = {
  user: 'bg-ok',
  imported: 'bg-ok/70',
  confirmed: 'bg-ok/50',
  derived: 'bg-info/60',
  default: 'bg-muted-foreground/35',
  assumption: 'bg-warn',
  vendor_claim: 'bg-warn/60',
  llm_suggested: 'bg-warn/40',
  missing: 'bg-crit',
}

// "Панель доверия": how much of the object's data is entered or confirmed versus defaults and assumptions.
export function DataQualityBar({ summary, compact }: { summary: DataQualitySummary; compact?: boolean }) {
  const entries = ORDER.map((status) => [status, summary.counts[status] ?? 0] as const).filter(([, n]) => n > 0)
  const total = entries.reduce((sum, [, n]) => sum + n, 0) || 1
  return (
    <div className="space-y-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
            {entries.map(([status, n]) => (
              <div key={status} className={COLOR[status]} style={{ width: `${(n / total) * 100}%` }} />
            ))}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {entries.map(([status, n]) => (
            <div key={status}>
              {PROVENANCE_LABEL[status]}: {n}
            </div>
          ))}
        </TooltipContent>
      </Tooltip>
      {!compact && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {entries.map(([status, n]) => (
            <span key={status} className="inline-flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${COLOR[status]}`} />
              {PROVENANCE_LABEL[status]} <span className="num text-foreground">{n}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

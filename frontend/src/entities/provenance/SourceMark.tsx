import type { Provenance } from '@/shared/api/types'
import { formatDate } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { PROVENANCE_HINT, PROVENANCE_LABEL, PROVENANCE_TONE, SOURCE_DOT, SOURCE_KIND_LABEL } from './labels'

/* Происхождение значения точкой (в графиках — без подписи) вместо плашки. Источник — в подсказке. */
export function SourceMark({ provenance, compact }: { provenance: Provenance; compact?: boolean }) {
  const tone = PROVENANCE_TONE[provenance.status]
  const source = provenance.source
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {compact ? (
          <span
            className="grid size-4 shrink-0 cursor-help place-items-center"
            aria-label={PROVENANCE_LABEL[provenance.status]}
          >
            <span className={cn('size-1.5 rounded-full', SOURCE_DOT[tone])} />
          </span>
        ) : (
          <span
            className={cn(
              'inline-flex cursor-help items-center gap-1.5 text-[12px] whitespace-nowrap',
              tone === 'crit' ? 'text-crit' : tone === 'warn' ? 'text-warn' : 'text-ink-3',
            )}
          >
            <span className={cn('size-1.5 shrink-0 rounded-full', SOURCE_DOT[tone])} />
            {PROVENANCE_LABEL[provenance.status]}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent className="max-w-sm space-y-1 text-left">
        <div className="font-medium">
          {PROVENANCE_LABEL[provenance.status]} — {PROVENANCE_HINT[provenance.status].toLowerCase()}
        </div>
        {source && (
          <div>
            {SOURCE_KIND_LABEL[source.kind]}: {source.title}
            {source.retrieved_at && <span className="opacity-70"> · {formatDate(source.retrieved_at)}</span>}
          </div>
        )}
        {provenance.note && <div className="opacity-80">{provenance.note}</div>}
      </TooltipContent>
    </Tooltip>
  )
}

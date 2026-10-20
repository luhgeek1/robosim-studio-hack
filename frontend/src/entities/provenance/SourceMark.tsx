import type { Provenance } from '@/shared/api/types'
import { formatDate } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { InfoHint } from '@/shared/ui/info-hint'
import { PROVENANCE_HINT, PROVENANCE_LABEL, PROVENANCE_TONE, SOURCE_DOT, SOURCE_KIND_LABEL } from './labels'

/* Происхождение значения точкой (в графиках - без подписи) вместо плашки. Источник - в подсказке. */
export function SourceMark({ provenance, compact }: { provenance: Provenance; compact?: boolean }) {
  const tone = PROVENANCE_TONE[provenance.status]
  const source = provenance.source
  return (
    <InfoHint
      title={PROVENANCE_LABEL[provenance.status]}
      trigger={
        <>
          <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', SOURCE_DOT[tone])} />
          {!compact && PROVENANCE_LABEL[provenance.status]}
        </>
      }
      className={cn(
        'gap-1.5 rounded-md text-left text-[12px] wrap-anywhere',
        compact ? 'w-4 max-sm:w-10' : 'min-w-0 justify-start',
        tone === 'crit' ? 'text-crit' : tone === 'warn' ? 'text-warn' : 'text-ink-3',
      )}
    >
      <div className="space-y-1 text-left">
        <div className="font-medium">
          {PROVENANCE_LABEL[provenance.status]} - {PROVENANCE_HINT[provenance.status].toLowerCase()}
        </div>
        {source && (
          <div>
            {SOURCE_KIND_LABEL[source.kind]}: {source.title}
            {source.retrieved_at && <span className="opacity-70"> · {formatDate(source.retrieved_at)}</span>}
          </div>
        )}
        {provenance.note && <div className="opacity-80">{provenance.note}</div>}
      </div>
    </InfoHint>
  )
}

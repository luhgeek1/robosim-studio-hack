import { ExternalLink } from 'lucide-react'
import type { Provenance, ProvenanceStatus } from '@/shared/api/types'
import { formatDate } from '@/shared/lib/format'
import { ToneBadge } from '@/shared/ui/tone'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { PROVENANCE_HINT, PROVENANCE_LABEL, PROVENANCE_TONE, SOURCE_KIND_LABEL } from './labels'

export function ProvenanceBadge({
  provenance,
  status,
  className,
}: {
  provenance?: Provenance | null
  status?: ProvenanceStatus | null
  className?: string
}) {
  const current = provenance?.status ?? status
  if (!current) return null
  const source = provenance?.source
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <ToneBadge tone={PROVENANCE_TONE[current]} className={className}>
          {PROVENANCE_LABEL[current]}
        </ToneBadge>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm space-y-1 text-left">
        <div className="font-medium">{PROVENANCE_HINT[current]}</div>
        {source && (
          <div>
            {SOURCE_KIND_LABEL[source.kind]}: {source.title}
            {source.retrieved_at && <span className="opacity-70"> · {formatDate(source.retrieved_at)}</span>}
          </div>
        )}
        {provenance?.note && <div className="opacity-80">{provenance.note}</div>}
        {provenance?.raw_value && <div className="opacity-80">Исходное значение: {provenance.raw_value}</div>}
        {provenance?.changed_by && <div className="opacity-70">Изменил: {provenance.changed_by}</div>}
      </TooltipContent>
    </Tooltip>
  )
}

export function SourceLink({ title, url }: { title: string; url?: string | null }) {
  if (!url) return <span>{title}</span>
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-primary hover:underline"
    >
      {title}
      <ExternalLink className="size-3" />
    </a>
  )
}

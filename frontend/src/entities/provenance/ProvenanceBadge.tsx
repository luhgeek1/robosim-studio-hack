import { ExternalLink } from 'lucide-react'
import type { Provenance, ProvenanceStatus } from '@/shared/api/types'
import { formatDate } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import type { Tone } from '@/shared/ui/tone-classes'
import { InfoHint } from '@/shared/ui/info-hint'
import { PROVENANCE_HINT, PROVENANCE_LABEL, PROVENANCE_TONE, SOURCE_KIND_LABEL } from './labels'

// A dot and a word instead of a pill: the value's origin reads at a glance without a coloured block next to it.
const BADGE_DOT: Record<Tone, string> = {
  ok: 'bg-ok',
  info: 'bg-ink',
  warn: 'bg-warn',
  crit: 'bg-crit',
  muted: 'bg-ink-4',
}
const BADGE_TEXT: Record<Tone, string> = {
  ok: 'text-ok',
  info: 'text-ink-2',
  warn: 'text-warn',
  crit: 'text-crit',
  muted: 'text-ink-3',
}

export function ProvenanceBadge({
  provenance,
  status,
  className,
  interactive = true,
}: {
  provenance?: Provenance | null
  status?: ProvenanceStatus | null
  className?: string
  interactive?: boolean
}) {
  const current = provenance?.status ?? status
  if (!current) return null
  const tone = PROVENANCE_TONE[current]
  if (!interactive) {
    return (
      <span
        className={cn(
          'inline-flex min-w-0 items-center gap-1.5 text-[12px] font-medium wrap-anywhere',
          BADGE_TEXT[tone],
          className,
        )}
      >
        <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', BADGE_DOT[tone])} />
        {PROVENANCE_LABEL[current]}
      </span>
    )
  }
  return (
    <InfoHint
      title={PROVENANCE_LABEL[current]}
      trigger={
        <>
          <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', BADGE_DOT[tone])} />
          {PROVENANCE_LABEL[current]}
        </>
      }
      className={cn(
        'min-w-0 justify-start gap-1.5 rounded-md text-left text-[12px] font-medium wrap-anywhere',
        BADGE_TEXT[tone],
        className,
      )}
    >
      <ProvenanceTip status={current} provenance={provenance} />
    </InfoHint>
  )
}

function ProvenanceTip({ status, provenance }: { status: ProvenanceStatus; provenance?: Provenance | null }) {
  const source = provenance?.source
  return (
    <div className="space-y-1 text-left">
      <div className="font-medium">{PROVENANCE_HINT[status]}</div>
      {source && (
        <div>
          {SOURCE_KIND_LABEL[source.kind]}: {source.title}
          {source.retrieved_at && <span className="opacity-70"> · {formatDate(source.retrieved_at)}</span>}
        </div>
      )}
      {provenance?.note && <div className="opacity-80">{provenance.note}</div>}
      {provenance?.raw_value && <div className="opacity-80">Исходное значение: {provenance.raw_value}</div>}
      {provenance?.changed_by && <div className="opacity-70">Изменил: {provenance.changed_by}</div>}
    </div>
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

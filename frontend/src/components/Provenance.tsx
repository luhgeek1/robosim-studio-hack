import type { Provenance, ProvenanceStatus, TraceInput } from '@/api/types'
import { formatDate, formatValue } from '@/lib/format'
import { PROVENANCE_HINT, PROVENANCE_LABEL, PROVENANCE_TONE, SOURCE_KIND_LABEL } from '@/lib/labels'
import { Dot, Hint, Pill } from './ui'

function SourceText({ provenance, status }: { provenance?: Provenance | null; status: ProvenanceStatus }) {
  const source = provenance?.source
  return (
    <div className="space-y-1">
      <div className="font-medium">{PROVENANCE_HINT[status]}</div>
      {source && (
        <div className="opacity-85">
          {SOURCE_KIND_LABEL[source.kind]}: {source.title}
          {source.retrieved_at && ` · ${formatDate(source.retrieved_at)}`}
        </div>
      )}
      {provenance?.note && <div className="opacity-75">{provenance.note}</div>}
      {provenance?.raw_value && <div className="opacity-75">В файле: {provenance.raw_value}</div>}
    </div>
  )
}

// Quiet by default: a coloured dot next to the value, the source on hover (ТЗ 3.2.5 without cluttering the screen).
export function SourceDot({
  provenance,
  status,
}: {
  provenance?: Provenance | null
  status?: ProvenanceStatus | null
}) {
  const current = provenance?.status ?? status
  if (!current) return null
  return (
    <Hint content={<SourceText provenance={provenance} status={current} />}>
      <span className="inline-flex cursor-help items-center" aria-label={PROVENANCE_LABEL[current]}>
        <Dot tone={PROVENANCE_TONE[current]} />
      </span>
    </Hint>
  )
}

export function SourcePill({
  provenance,
  status,
}: {
  provenance?: Provenance | null
  status?: ProvenanceStatus | null
}) {
  const current = provenance?.status ?? status
  if (!current) return null
  return (
    <Hint content={<SourceText provenance={provenance} status={current} />}>
      <span className="cursor-help">
        <Pill tone={PROVENANCE_TONE[current]}>{PROVENANCE_LABEL[current]}</Pill>
      </span>
    </Hint>
  )
}

const INPUT_KIND_LABEL: Record<NonNullable<TraceInput['kind']>, string> = {
  param: 'параметр объекта',
  norm: 'норматив',
  spec: 'ТТХ или каталог',
  metric: 'промежуточный итог',
  simulation: 'имитация',
  layout: 'планировка',
}

export function Formula({
  formula,
  rendered,
  inputs,
  note,
}: {
  formula: string
  rendered?: string | null
  inputs?: TraceInput[]
  note?: string | null
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-[10px] bg-black/[0.04] px-3.5 py-2.5 font-mono text-[12px] leading-relaxed">
        <div className="text-ink-3">{formula}</div>
        {rendered && <div className="font-medium text-ink">{rendered}</div>}
      </div>
      {note && <p className="text-[12.5px] text-ink-3">{note}</p>}
      {inputs && inputs.length > 0 && (
        <dl className="divide-y divide-line text-[12.5px]">
          {inputs.map((input) => (
            <div key={input.key} className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="min-w-0 text-ink-2">
                {input.name}
                {input.kind && <span className="text-ink-4"> · {INPUT_KIND_LABEL[input.kind]}</span>}
              </dt>
              <dd className="flex shrink-0 items-center gap-2 font-medium">
                <span className="num">{formatValue(input.value, input.unit)}</span>
                <SourceDot provenance={input.provenance} />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

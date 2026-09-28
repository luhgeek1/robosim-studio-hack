import type { Interpretation } from '@/shared/api/types'
import { cn } from '@/shared/lib/utils'
import { VERDICT_LABEL, VERDICT_TONE } from '../labels'

const isVerdict = (v: string): v is Interpretation['verdict'] => v in VERDICT_LABEL

// Same dot-and-label as the overview and scenario cards: a «reasonable» verdict is ink, not the accent blue.
const DOT: Record<(typeof VERDICT_TONE)[Interpretation['verdict']], string> = {
  ok: 'bg-ok',
  info: 'bg-ink',
  warn: 'bg-warn',
  crit: 'bg-crit',
  muted: 'bg-ink-4',
}

export function VerdictBadge({ verdict, className }: { verdict: string | null | undefined; className?: string }) {
  if (!verdict || !isVerdict(verdict)) return null
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-[13px] font-medium whitespace-nowrap text-ink-2', className)}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', DOT[VERDICT_TONE[verdict]])} />
      {VERDICT_LABEL[verdict]}
    </span>
  )
}

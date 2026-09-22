import type { Interpretation } from '@/shared/api/types'
import { ToneBadge } from '@/shared/ui/tone'
import { VERDICT_LABEL, VERDICT_TONE } from '../labels'

const isVerdict = (v: string): v is Interpretation['verdict'] => v in VERDICT_LABEL

export function VerdictBadge({ verdict, className }: { verdict: string | null | undefined; className?: string }) {
  if (!verdict || !isVerdict(verdict)) return null
  return (
    <ToneBadge tone={VERDICT_TONE[verdict]} className={className}>
      {VERDICT_LABEL[verdict]}
    </ToneBadge>
  )
}

import type { Proposal } from '@/shared/api/types'
import { pluralRu } from '@/shared/lib/format'

export function proposalSummary(proposal: Proposal) {
  const parts = [
    proposal.kind === 'new_product' ? 'новый продукт' : proposal.card ? 'карточка и цены' : null,
    proposal.specs.length
      ? `${proposal.specs.length} ${pluralRu(proposal.specs.length, ['характеристика', 'характеристики', 'характеристик'])}`
      : null,
  ]
  return parts.filter(Boolean).join(' · ')
}

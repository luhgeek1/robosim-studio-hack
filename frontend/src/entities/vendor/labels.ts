import type { ProposalStatus } from '@/shared/api/types'
import type { Tone } from '@/shared/ui/v0'

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  pending: 'На модерации',
  approved: 'Принята',
  rejected: 'Отклонена',
  withdrawn: 'Отозвана',
}

export const PROPOSAL_STATUS_TONE: Record<ProposalStatus, Tone> = {
  pending: 'warn',
  approved: 'ok',
  rejected: 'crit',
  withdrawn: 'neutral',
}

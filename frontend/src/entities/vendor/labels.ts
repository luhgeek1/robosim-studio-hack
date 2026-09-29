import type { ProposalStatus, Rfq } from '@/shared/api/types'
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

export const RFQ_STATUS_LABEL: Record<Rfq['status'], string> = {
  sent: 'Ждёт ответа',
  answered: 'Есть предложение',
  declined: 'Отказ',
}

export const RFQ_STATUS_TONE: Record<Rfq['status'], Tone> = { sent: 'warn', answered: 'ok', declined: 'crit' }

import type { CandidateStatus, Reason } from '@/shared/api/types'

export const STATUS_ORDER: CandidateStatus[] = ['fit', 'check', 'manual', 'excluded']

export const SEVERITY_ORDER: Reason['severity'][] = ['blocking', 'warning', 'info']

export const SEVERITY_LABEL: Record<Reason['severity'], string> = {
  blocking: 'Блокирующие причины',
  warning: 'Требует внимания',
  info: 'Пройденные проверки и заметки',
}

export const MAX_COMPARE = 5

import type { CandidateStatus, Reason } from '@/shared/api/types'
import type { Tone } from '@/shared/ui/tone'

export const STATUS_ORDER: CandidateStatus[] = ['fit', 'check', 'manual', 'excluded']

export const STATUS_TONE: Record<CandidateStatus, Tone> = {
  fit: 'ok',
  check: 'warn',
  manual: 'info',
  excluded: 'crit',
}

export const STATUS_GROUP_HINT: Record<CandidateStatus, string> = {
  fit: 'Все жёсткие проверки пройдены — отсортированы по баллу',
  check: 'Не хватает данных по ключевому ограничению — уточните у производителя',
  manual: 'Добавлены вручную, несмотря на причины исключения',
  excluded: 'Подтверждённое несоответствие объекту',
}

export const SEVERITY_ORDER: Reason['severity'][] = ['blocking', 'warning', 'info']

export const SEVERITY_LABEL: Record<Reason['severity'], string> = {
  blocking: 'Блокирующие причины',
  warning: 'Требует внимания',
  info: 'Пройденные проверки и заметки',
}

export const SEVERITY_TONE: Record<Reason['severity'], Tone> = {
  blocking: 'crit',
  warning: 'warn',
  info: 'muted',
}

export const MAX_COMPARE = 5

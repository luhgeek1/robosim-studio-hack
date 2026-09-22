import type { ProvenanceStatus, Source } from '@/shared/api/types'
import type { Tone } from '@/shared/ui/tone'

export const PROVENANCE_LABEL: Record<ProvenanceStatus, string> = {
  user: 'Введено',
  imported: 'Из файла',
  llm_suggested: 'Предложено ассистентом',
  default: 'По умолчанию',
  assumption: 'Допущение',
  derived: 'Вычислено',
  confirmed: 'Подтверждено',
  vendor_claim: 'Заявка вендора',
  missing: 'Нет данных',
}

export const PROVENANCE_HINT: Record<ProvenanceStatus, string> = {
  user: 'Значение ввёл пользователь',
  imported: 'Взято из загруженного файла',
  llm_suggested: 'Предложено ассистентом, нужно подтверждение',
  default: 'Значение по умолчанию из справочника, с источником',
  assumption: 'Допущение команды с обоснованием',
  derived: 'Вычислено из других значений',
  confirmed: 'Подтверждено первичным источником',
  vendor_claim: 'Заявлено производителем без независимой проверки',
  missing: 'Данных нет — стоит уточнить',
}

export const PROVENANCE_TONE: Record<ProvenanceStatus, Tone> = {
  user: 'ok',
  imported: 'ok',
  confirmed: 'ok',
  derived: 'info',
  default: 'muted',
  assumption: 'warn',
  vendor_claim: 'warn',
  llm_suggested: 'warn',
  missing: 'crit',
}

export const SOURCE_KIND_LABEL: Record<Source['kind'], string> = {
  organizer_dataset: 'Датасет организатора',
  organizer_catalog: 'Каталог организатора',
  fcbas_scenario: 'Сценарии ФЦ БАС',
  vendor_site: 'Сайт производителя',
  open_source: 'Открытый источник',
  regulation: 'Норматив',
  team_assumption: 'Допущение команды',
  user_input: 'Ввод пользователя',
  llm_extracted: 'Извлечено ассистентом',
  simulation: 'Имитация',
}

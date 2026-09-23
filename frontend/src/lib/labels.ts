import type {
  Badge,
  Interpretation,
  ObjectTypeKey,
  ProductStatus,
  ProjectStatus,
  ProvenanceStatus,
  Risk,
  ScenarioKind,
  Source,
  SpecGroup,
  TraceItem,
} from '@/api/types'

export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'crit'

export const BADGE_LABEL: Record<Badge, string> = {
  in_registry_719: 'Реестр ПП 719',
  tested_fcbas: 'Протестировано ФЦ БАС',
  specs_confirmed: 'ТТХ подтверждены',
  domestic: 'Отечественный',
  has_cases: 'Есть внедрения',
}

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  operation: 'Эксплуатация',
  piloting: 'Пилотирование',
  rnd: 'Разработка',
}

export const SPEC_GROUP_LABEL: Record<SpecGroup, string> = {
  identification: 'Идентификация',
  technical: 'Технические',
  infrastructure: 'Инфраструктура',
  economics: 'Экономика',
  applicability: 'Применимость',
  data_quality: 'Качество данных',
}

export const SPEC_GROUP_ORDER: SpecGroup[] = [
  'identification',
  'technical',
  'infrastructure',
  'economics',
  'applicability',
  'data_quality',
]

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: 'Черновик',
  ready: 'Готов к расчёту',
  calculated: 'Рассчитан',
  archived: 'В архиве',
}

export const OBJECT_TYPE_LABEL: Record<ObjectTypeKey, string> = {
  warehouse: 'Склад',
  airport: 'Аэропорт',
  hospital: 'Медучреждение',
  custom: 'Свой объект',
}

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
  derived: 'accent',
  default: 'neutral',
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

export const SCENARIO_KIND_LABEL: Record<ScenarioKind, string> = {
  baseline: 'Как сейчас',
  purchase: 'Покупка',
  raas: 'RaaS (аренда)',
  lease: 'Лизинг / кредит',
}

export type Verdict = Interpretation['verdict']

export const VERDICT_LABEL: Record<Verdict, string> = {
  attractive: 'Привлекательно',
  reasonable: 'Обоснованно',
  questionable: 'Сомнительно',
  not_recommended: 'Не рекомендуется',
  insufficient_data: 'Мало данных',
  baseline: 'База сравнения',
}

export const VERDICT_TONE: Record<Verdict, Tone> = {
  attractive: 'ok',
  reasonable: 'accent',
  questionable: 'warn',
  not_recommended: 'crit',
  insufficient_data: 'neutral',
  baseline: 'neutral',
}

export const BAND_LABEL: Record<Interpretation['band'], string> = {
  lt3: 'окупаемость до 3 лет',
  from3to5: 'окупаемость 3–5 лет',
  gt5: 'окупаемость больше 5 лет',
  never: 'не окупается в горизонте',
  none: '',
}

export const RISK_SEVERITY_LABEL: Record<Risk['severity'], string> = {
  low: 'низкий',
  medium: 'средний',
  high: 'высокий',
}

export const FINANCING_KIND_LABEL = {
  own_funds: 'Собственные средства',
  loan: 'Кредит',
  lease: 'Лизинг',
} as const

export const TRACE_SECTION_LABEL: Record<NonNullable<TraceItem['section']>, string> = {
  demand: 'Спрос',
  sizing: 'Количество роботов',
  capex: 'CAPEX',
  opex: 'OPEX',
  baseline: 'Как сейчас',
  effect: 'Эффект',
  cashflow: 'Денежный поток',
  metrics: 'Показатели',
}

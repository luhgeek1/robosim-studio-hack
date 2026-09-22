import type { Interpretation, Risk, ScenarioKind, TraceItem } from '@/shared/api/types'

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

export const VERDICT_TONE: Record<Verdict, 'ok' | 'info' | 'warn' | 'crit' | 'muted'> = {
  attractive: 'ok',
  reasonable: 'info',
  questionable: 'warn',
  not_recommended: 'crit',
  insufficient_data: 'muted',
  baseline: 'muted',
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

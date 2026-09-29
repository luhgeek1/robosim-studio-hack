import type { NormCategory, Role } from '@/shared/api/types'

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Администратор',
  user: 'Пользователь',
  vendor: 'Вендор',
  guest: 'Гость',
}

export const NORM_CATEGORY_LABEL: Record<NormCategory, string> = {
  capex: 'Вложения (CAPEX)',
  opex: 'Эксплуатация (OPEX)',
  labor: 'Персонал',
  finance: 'Финансы',
  operations: 'Операции',
  simulation: 'Имитация',
  sizing: 'Расчёт количества',
  risk: 'Риски',
  layout: 'Планировка',
}

export const NORM_CATEGORY_ORDER: NormCategory[] = [
  'capex',
  'opex',
  'labor',
  'finance',
  'operations',
  'sizing',
  'layout',
  'simulation',
  'risk',
]

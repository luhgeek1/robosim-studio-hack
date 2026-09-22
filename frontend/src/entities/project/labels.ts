import type { ObjectTypeKey, ProjectStatus } from '@/shared/api/types'

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

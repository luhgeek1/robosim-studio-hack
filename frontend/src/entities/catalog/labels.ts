import type { Badge, ProductStatus, SpecGroup } from '@/shared/api/types'

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

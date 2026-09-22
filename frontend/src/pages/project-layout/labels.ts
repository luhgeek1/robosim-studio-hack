import type { components } from '@/shared/api/schema'

export type LayoutRoute = components['schemas']['LayoutRoute']
export type LayoutDerivationStep = components['schemas']['LayoutDerivationStep']
export type DerivationInput = LayoutDerivationStep['inputs'][number]

export const TEMPLATE_LABEL: Record<string, string> = {
  warehouse_u_flow: 'U-образный поток',
  warehouse_flow_through: 'Сквозной поток',
}

export const TEMPLATE_HINT: Record<string, string> = {
  warehouse_u_flow: 'Ворота приёмки и отгрузки на одном фасаде (по умолчанию).',
  warehouse_flow_through: 'Приёмка и отгрузка на противоположных фасадах.',
}

export const DERIVATION_INPUT_KIND_LABEL: Record<DerivationInput['kind'], string> = {
  param: 'параметр объекта',
  norm: 'норматив',
  metric: 'промежуточный итог',
}

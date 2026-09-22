import type { ProcessDemand } from '@/shared/api/types'

export const DEMAND_UNIT_LABEL: Record<ProcessDemand['demand_unit'], string> = {
  pallet: 'палл',
  line: 'строк',
  item: 'шт',
  m2: 'м²',
  trip: 'рейсов',
  kg: 'кг',
  bag: 'мешков',
  portion: 'порций',
  container: 'конт.',
}

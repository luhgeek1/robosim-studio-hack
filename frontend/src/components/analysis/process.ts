import type { ProcessDemand } from '@/api/types'

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

export const unitOf = (process: ProcessDemand) => DEMAND_UNIT_LABEL[process.demand_unit] ?? process.demand_unit

// "Перемещение паллет (приёмка → хранение → отгрузка)" reads as "Перемещение паллет" in headlines and cards.
export const shortName = (process: ProcessDemand) => process.name.replace(/\s*\(.*\)\s*$/, '')

export const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

// The process that costs the most today: the story of the whole assessment starts from it.
export function mainProcess(processes: ProcessDemand[]): ProcessDemand | undefined {
  return [...processes].sort(
    (a, b) =>
      (b.share_of_labor_cost ?? 0) - (a.share_of_labor_cost ?? 0) ||
      (b.current?.cost_rub_year ?? 0) - (a.current?.cost_rub_year ?? 0),
  )[0]
}

export const MISSING_NOTE = 'Нет данных'

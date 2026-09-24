import type { components } from '@/shared/api/schema'

export type LayoutRoute = components['schemas']['LayoutRoute']
export type LayoutDerivationStep = components['schemas']['LayoutDerivationStep']
export type DerivationInput = LayoutDerivationStep['inputs'][number]

export const TEMPLATE_LABEL: Record<string, string> = {
  warehouse_u_flow: 'U-образный поток',
  warehouse_flow_through: 'Сквозной поток',
}

export const TEMPLATE_HINT: Record<string, string> = {
  warehouse_u_flow: 'Ворота приёмки и отгрузки на одном фасаде.',
  warehouse_flow_through: 'Приёмка и отгрузка на противоположных фасадах.',
}

export const DERIVATION_INPUT_KIND_LABEL: Record<DerivationInput['kind'], string> = {
  param: 'параметр объекта',
  norm: 'норматив',
  metric: 'из шага выше',
}

// Where each route length goes: the warehouse cycle formulas read `layout_route_<key>_m` (seeds, warehouse.yaml).
export const ROUTE_USE: Record<LayoutRoute['key'], string> = {
  dock_in_to_storage: 'цикл перевозки паллет',
  storage_to_dock_out: 'цикл перевозки паллет',
  storage_to_storage: 'цикл перевозки паллет',
  pod_to_station: 'цикл «товар к человеку»',
  storage_to_charger: 'справочно',
}

export const ROUTE_ENDPOINT: Record<LayoutRoute['key'], [string, string]> = {
  dock_in_to_storage: ['ворота приёмки', 'место хранения'],
  storage_to_dock_out: ['место хранения', 'ворота отгрузки'],
  storage_to_storage: ['место хранения', 'другое место'],
  pod_to_station: ['стеллаж G2P', 'станция отбора'],
  storage_to_charger: ['место хранения', 'зарядка'],
}

// Derivation steps grouped by what they size; a key the generator adds later lands in «Прочее».
export const DERIVATION_GROUPS: { title: string; keys: string[] }[] = [
  { title: 'Здание', keys: ['building_width_m', 'building_depth_m'] },
  {
    title: 'Стеллажи',
    keys: [
      'rack_levels',
      'storage_band_depth_m',
      'cross_aisles',
      'rack_run_length_m',
      'bays_per_run',
      'slots_per_aisle',
      'aisles_needed',
      'rack_module_width_m',
      'storage_block_width_m',
    ],
  },
  {
    title: 'Ворота',
    keys: ['pallets_in_per_day_peak_per_hour', 'docks_in', 'pallets_out_per_day_peak_per_hour', 'docks_out'],
  },
  { title: 'Отбор и проезды', keys: ['order_lines_per_day_peak_per_hour', 'pick_stations', 'two_way_min_width_m'] },
]

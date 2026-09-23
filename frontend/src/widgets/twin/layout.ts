/**
 * Warehouse layout in scene units (1 unit ≈ 1 m of the robotised zone, 60 × 36).
 * x runs left (receiving) to right (shipping); z runs top to bottom.
 */
export const FLOOR = { w: 62, d: 38 }

export type ZoneDef = { key: string; name: string; x: number; z: number; w: number; d: number }

export const ZONES: ZoneDef[] = [
  { key: 'receiving', name: 'Приёмка', x: -25, z: 0, w: 10, d: 32 },
  { key: 'storage', name: 'Хранение', x: -5, z: 0, w: 28, d: 32 },
  { key: 'picking', name: 'Комплектация', x: 14.5, z: 0, w: 9, d: 32 },
  { key: 'shipping', name: 'Отгрузка', x: 24.5, z: 0, w: 9, d: 32 },
]

/** Rack rows (long along x) inside storage; aisles between them. */
export const RACK_ROWS = [-12, -6, 0, 6, 12] // z of each rack row
export const RACK_X0 = -17.5
export const RACK_X1 = 7.5
export const AISLES = [-9, -3, 3, 9] // z of aisles between rows
export const CORRIDOR_TOP = -15.5
export const CORRIDOR_BOTTOM = 15.5

export const RECEIVE_POINTS = [-22.5, -22.5, -22.5, -22.5].map((x, i) => [x, -9 + i * 6] as [number, number])
export const PICK_POINTS = [12.5, 12.5, 12.5, 12.5].map((x, i) => [x, -9 + i * 6] as [number, number])
export const SHIP_POINTS = [24, 24, 24, 24].map((x, i) => [x, -9 + i * 6] as [number, number])
export const DOCK_POINTS = [
  [-27, 16.5],
  [-27, 14],
  [-27, 11.5],
  [-27, 9],
  [-29, 16.5],
  [-29, 14],
  [-29, 11.5],
  [-29, 9],
] as [number, number][]

/** Queue grid on the receiving dock (pallets waiting). */
export const QUEUE_ORIGIN: [number, number] = [-28.5, -14.5]
export const QUEUE_COLS = 3
export const QUEUE_PITCH = 1.35

import type { Layout, LayoutEdge, LayoutNode, ZoneKind } from '@/shared/api/types'

export type Point = [number, number]
export type EdgeKind = NonNullable<LayoutEdge['kind']>
export type NodeKind = LayoutNode['kind']

export const ZONE_KIND_LABEL: Record<ZoneKind, string> = {
  receiving: 'Приёмка',
  storage: 'Хранение',
  picking: 'Отбор',
  packing: 'Упаковка',
  shipping: 'Отгрузка',
  buffer: 'Буфер',
  charging: 'Зарядка',
  corridor: 'Проезд',
  station: 'Станции отбора',
  elevator: 'Лифт',
  kitchen: 'Кухня',
  laundry: 'Прачечная',
  pharmacy: 'Аптека',
  lab: 'Лаборатория',
  ward: 'Отделение',
  waste: 'Отходы',
  gate: 'Выход на посадку',
  apron: 'Перрон',
  terminal: 'Терминал',
  obstacle: 'Препятствие',
  office: 'Офис',
}

const hue = (h: number, chroma = 0.12, light = 0.62) => `oklch(${light} ${chroma} ${h})`

export const ZONE_COLOR: Record<ZoneKind, string> = {
  receiving: hue(150),
  storage: hue(250, 0.05, 0.6),
  picking: hue(300, 0.1),
  packing: hue(190),
  shipping: hue(55, 0.14),
  buffer: hue(100, 0.08),
  charging: hue(90, 0.14, 0.72),
  corridor: hue(0, 0, 0.7),
  station: hue(300, 0.16, 0.55),
  elevator: hue(220, 0.08),
  kitchen: hue(30),
  laundry: hue(210),
  pharmacy: hue(160),
  lab: hue(280),
  ward: hue(240),
  waste: hue(70, 0.1, 0.55),
  gate: hue(20),
  apron: hue(0, 0, 0.6),
  terminal: hue(230),
  obstacle: hue(0, 0, 0.45),
  office: hue(260, 0.04),
}

export const EDGE_KIND_LABEL: Record<EdgeKind, string> = {
  main_aisle: 'Главный проезд',
  rack_aisle: 'Проход между стеллажами',
  corridor: 'Проезд вдоль зон',
  door: 'Дверь',
  elevator_link: 'Лифт',
  ramp: 'Пандус',
}

export const EDGE_STYLE: Record<EdgeKind, { color: string; width: number; dash?: string }> = {
  main_aisle: { color: 'var(--chart-1)', width: 1.6 },
  rack_aisle: { color: 'oklch(0.62 0.1 250)', width: 0.8 },
  corridor: { color: 'oklch(0.55 0.02 250)', width: 0.8, dash: '3 2' },
  door: { color: 'var(--chart-3)', width: 1.2 },
  elevator_link: { color: 'var(--chart-4)', width: 1.2, dash: '1 2' },
  ramp: { color: 'var(--chart-3)', width: 1.2, dash: '4 2' },
}

export const MARKER_KINDS = ['dock_in', 'dock_out', 'pick_station', 'charger', 'dropoff', 'elevator'] as const
export type MarkerKind = (typeof MARKER_KINDS)[number]

export const MARKER_LABEL: Record<MarkerKind, string> = {
  dock_in: 'Ворота приёмки',
  dock_out: 'Ворота отгрузки',
  pick_station: 'Станция отбора',
  charger: 'Зарядная станция',
  dropoff: 'Точка сдачи',
  elevator: 'Лифт',
}

export const MARKER_COLOR: Record<MarkerKind, string> = {
  dock_in: ZONE_COLOR.receiving,
  dock_out: ZONE_COLOR.shipping,
  pick_station: ZONE_COLOR.station,
  charger: 'oklch(0.7 0.16 85)',
  dropoff: ZONE_COLOR.packing,
  elevator: ZONE_COLOR.elevator,
}

export const isMarkerKind = (kind: NodeKind): kind is MarkerKind => (MARKER_KINDS as readonly string[]).includes(kind)

const r = (n: number) => Math.round(n * 100) / 100

export function polygonPath(polygon: readonly (readonly number[])[]): string {
  if (polygon.length < 2) return ''
  return polygon.map(([x, y], i) => `${i ? 'L' : 'M'}${r(x)} ${r(y)}`).join('') + 'Z'
}

export function polygonCenter(polygon: readonly (readonly number[])[]): Point {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of polygon) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2]
}

export function polygonSize(polygon: readonly (readonly number[])[]): Point {
  const xs = polygon.map((p) => p[0])
  const ys = polygon.map((p) => p[1])
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]
}

export function edgePaths(layout: Layout, onlyIds?: ReadonlySet<string>): Map<EdgeKind, string> {
  const byId = new Map(layout.nodes.map((n) => [n.id, n]))
  const parts = new Map<EdgeKind, string[]>()
  for (const edge of layout.edges) {
    if (onlyIds && !onlyIds.has(edge.id)) continue
    const a = byId.get(edge.from)
    const b = byId.get(edge.to)
    if (!a || !b) continue
    const kind = edge.kind ?? 'rack_aisle'
    const list = parts.get(kind) ?? []
    list.push(`M${r(a.x)} ${r(a.y)}L${r(b.x)} ${r(b.y)}`)
    parts.set(kind, list)
  }
  return new Map([...parts].map(([kind, list]) => [kind, list.join('')]))
}

// Graph nodes without their own marker are one path of zero-length segments: with round caps and a non-scaling stroke
// each becomes a dot of constant screen size, and ~1100 separate elements would make panning laggy.
export function dotsPath(nodes: readonly LayoutNode[]): string {
  return nodes.map((n) => `M${r(n.x)} ${r(n.y)}h0`).join('')
}

const NICE_METERS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]

export function scaleBarMeters(pxPerMeter: number, maxPx = 140): number {
  let best = NICE_METERS[0]
  for (const m of NICE_METERS) if (m * pxPerMeter <= maxPx) best = m
  return best
}

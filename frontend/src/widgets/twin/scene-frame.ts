import type { LayoutGeometry } from '@/shared/api/types'

export type SceneFrame = { w: number; h: number; x: (mx: number) => number; z: (my: number) => number }

// Layout metres (origin top-left, y down) → scene units (1 unit = 1 m, centred, z towards the viewer).
export function sceneFrame(layout: LayoutGeometry): SceneFrame {
  return {
    w: layout.width_m,
    h: layout.height_m,
    x: (mx) => mx - layout.width_m / 2,
    z: (my) => my - layout.height_m / 2,
  }
}

export type SceneLabel = {
  id: string
  name: string
  x: number
  z: number
  edge?: { x: number; z: number; dx: number; dz: number }
}

export function zoneLabels(layout: LayoutGeometry, frame: SceneFrame): SceneLabel[] {
  return layout.zones
    .filter((zone) => zone.kind !== 'corridor')
    .map((zone) => {
      const xs = zone.polygon.map((p) => p[0])
      const ys = zone.polygon.map((p) => p[1])
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)
      const x = (minX + maxX) / 2
      const y = (minY + maxY) / 2
      // A permanent building edge keeps annotations out of the floor without swapping screen-space slots.
      const edges = [
        { gap: minX, length: maxY - minY, x: 0, y, dx: -1, dz: 0 },
        { gap: layout.width_m - maxX, length: maxY - minY, x: layout.width_m, y, dx: 1, dz: 0 },
        { gap: minY, length: maxX - minX, x, y: 0, dx: 0, dz: -1 },
        { gap: layout.height_m - maxY, length: maxX - minX, x, y: layout.height_m, dx: 0, dz: 1 },
      ].sort((a, b) => a.gap - b.gap || b.length - a.length)
      const edge = edges[0]
      return {
        id: zone.id,
        name: zone.name,
        x: frame.x(x),
        z: frame.z(y),
        edge:
          zone.kind === 'storage' ? undefined : { x: frame.x(edge.x), z: frame.z(edge.y), dx: edge.dx, dz: edge.dz },
      }
    })
}

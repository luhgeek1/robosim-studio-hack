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

export type SceneLabel = { id: string; name: string; x: number; z: number }

// Zone names sit at the centre of each zone's bounding box; corridors stay unlabelled.
export function zoneLabels(layout: LayoutGeometry, frame: SceneFrame): SceneLabel[] {
  return layout.zones
    .filter((zone) => zone.kind !== 'corridor')
    .map((zone) => {
      const xs = zone.polygon.map((p) => p[0])
      const ys = zone.polygon.map((p) => p[1])
      return {
        id: zone.id,
        name: zone.name,
        x: frame.x((Math.min(...xs) + Math.max(...xs)) / 2),
        z: frame.z((Math.min(...ys) + Math.max(...ys)) / 2),
      }
    })
}

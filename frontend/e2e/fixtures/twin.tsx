import { createRoot } from 'react-dom/client'
import type { LayoutGeometry, ZoneKind } from '../../src/shared/api/types'
import { TooltipProvider } from '../../src/shared/ui/tooltip'
import { Twin } from '../../src/widgets/twin'
import '../../src/app/index.css'

const zone = (id: string, kind: ZoneKind, name: string, x: number, y: number, w: number, h: number) => ({
  id,
  kind,
  name,
  polygon: [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ],
})
const layout: LayoutGeometry = {
  width_m: 200,
  height_m: 100,
  zones: [
    zone('storage', 'storage', 'Хранение', 0, 3.5, 135, 78),
    zone('picking', 'picking', 'Отбор товар-к-человеку', 135, 8.5, 65, 68),
    zone('station1', 'station', 'Станции отбора', 135, 76.5, 65, 5),
    zone('station2', 'station', 'Станции отбора', 135, 3.5, 65, 5),
    zone('receiving', 'receiving', 'Приёмка', 0, 85, 67.5, 15),
    zone('charging', 'charging', 'Зарядка роботов', 67.5, 85, 12, 15),
    zone('shipping', 'shipping', 'Отгрузка', 79.5, 85, 67.5, 15),
    zone('packing', 'packing', 'Упаковка и консолидация', 147, 85, 53, 15),
  ],
  nodes: [
    ...[29.75, 33.75, 37.75].map((x, i) => ({ id: `in${i}`, kind: 'dock_in' as const, x, y: 92.5 })),
    ...[109.25, 113.25, 117.25].map((x, i) => ({ id: `out${i}`, kind: 'dock_out' as const, x, y: 92.5 })),
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `charger${i}`,
      kind: 'charger' as const,
      x: 69 + (i % 4) * 3,
      y: 89 + Math.floor(i / 4) * 5,
    })),
    ...[6, 79].flatMap((y) =>
      Array.from({ length: 14 }, (_, i) => ({
        id: `station${y}-${i}`,
        kind: 'pick_station' as const,
        x: 136.5 + i * 3,
        y,
      })),
    ),
  ],
  edges: [],
}

createRoot(document.getElementById('root')!).render(
  <TooltipProvider>
    <main style={{ width: 880, height: 630, margin: 20 }}>
      <Twin layout={layout} />
    </main>
  </TooltipProvider>,
)

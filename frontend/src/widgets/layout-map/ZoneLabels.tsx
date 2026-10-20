import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { LayoutGeometry } from '@/shared/api/types'
import { isMarkerKind, polygonCenter, polygonSize } from './geometry'
import { labelEndpoint, placeLabel, type LabelRect } from './label-placement'
import type { LayoutMapView } from './useViewport'

export function ZoneLabels({
  layout,
  view,
  size,
}: {
  layout: LayoutGeometry
  view: LayoutMapView
  size: { width: number; height: number }
}) {
  const measureRef = useRef<SVGGElement>(null)
  const [widths, setWidths] = useState<number[]>([])
  const [controls, setControls] = useState<LabelRect[]>([])
  const items = useMemo(
    () =>
      layout.zones
        .filter((z) => z.kind !== 'corridor')
        .map((z) => ({ id: z.id, name: z.name, center: polygonCenter(z.polygon), size: polygonSize(z.polygon) })),
    [layout.zones],
  )
  useLayoutEffect(() => {
    let active = true
    const measure = () => {
      if (!active || !measureRef.current) return
      setWidths([...measureRef.current.querySelectorAll('text')].map((el) => el.getComputedTextLength()))
      const host = measureRef.current.ownerSVGElement?.parentElement
      if (!host) return
      const bounds = host.getBoundingClientRect()
      const controlsHost = host.closest('[data-map-host]') ?? host
      setControls(
        [...controlsHost.querySelectorAll('[data-map-control]')].map((el) => {
          const rect = el.getBoundingClientRect()
          return { x: rect.x - bounds.x, y: rect.y - bounds.y, width: rect.width, height: rect.height }
        }),
      )
    }
    measure()
    void document.fonts.ready.then(measure)
    document.fonts.addEventListener('loadingdone', measure)
    return () => {
      active = false
      document.fonts.removeEventListener('loadingdone', measure)
    }
  }, [items, size.width, size.height])

  const occupied: LabelRect[] = [...controls]
  for (const node of layout.nodes) {
    if (!isMarkerKind(node.kind) || node.kind === 'pickup') continue
    const radius = Math.max(3, view.k * (node.kind === 'charger' ? 0.85 : 1.2))
    occupied.push({
      x: node.x * view.k + view.tx - radius,
      y: node.y * view.k + view.ty - radius,
      width: radius * 2,
      height: radius * 2,
    })
  }
  const placements = items.map((item, i) => {
    const x = item.center[0] * view.k + view.tx
    const y = item.center[1] * view.k + view.ty
    if (x < 0 || x > size.width || y < 0 || y > size.height) return null
    const width = Math.ceil(widths[i] ?? item.name.length * 6.6) + 16
    const zoneWidth = item.size[0] * view.k
    const zoneHeight = item.size[1] * view.k
    const fits = width + 8 <= zoneWidth && zoneHeight >= 32
    const height = fits ? 18 : 24
    const preferred = {
      x: x - width / 2,
      y: fits
        ? y - zoneHeight / 2 + 1
        : y + (item.center[1] > layout.height_m / 2 ? zoneHeight / 2 + 10 : -zoneHeight / 2 - height - 10),
    }
    const box = placeLabel({ id: item.id, x, y, width, height }, size, occupied, preferred)
    if (!box) return null
    occupied.push(box)
    const callout = !fits || Math.hypot(box.x - preferred.x, box.y - preferred.y) > 4
    return { item, box, x, y, callout, end: labelEndpoint(box, { x, y }) }
  })

  return (
    <g pointerEvents="none" fontSize={11} fontWeight={600} textAnchor="middle" dominantBaseline="middle">
      <g ref={measureRef} visibility="hidden" aria-hidden="true">
        {items.map((item) => (
          <text key={item.id}>{item.name}</text>
        ))}
      </g>
      {placements.map((placement) => {
        if (!placement) return null
        const { item, box, x, y, callout, end } = placement
        return (
          <g key={item.id} data-map-label={item.id}>
            {callout && (
              <>
                <line x1={x} y1={y} x2={end.x} y2={end.y} stroke="var(--muted-foreground)" strokeOpacity={0.65} />
                <circle cx={x} cy={y} r={2} fill="var(--muted-foreground)" />
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  rx={5}
                  fill="var(--card)"
                  fillOpacity={0.95}
                />
              </>
            )}
            <text
              x={box.x + box.width / 2}
              y={box.y + box.height / 2}
              fill="var(--foreground)"
              stroke="var(--card)"
              strokeWidth={3}
              paintOrder="stroke"
              strokeLinejoin="round"
            >
              {item.name}
            </text>
          </g>
        )
      })}
    </g>
  )
}

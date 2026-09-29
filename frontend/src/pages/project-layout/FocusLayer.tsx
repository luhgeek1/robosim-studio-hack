import { motion, useReducedMotion } from 'framer-motion'
import { useCallback, useMemo } from 'react'
import type { Layout, LayoutNode, ZoneKind } from '@/shared/api/types'
import { MARKER_COLOR, ZONE_COLOR, edgePaths, isMarkerKind, polygonPath } from '@/widgets/layout-map'
import type { ExampleRoute } from './routes'

export type Spotlight = {
  zones: ZoneKind[]
  nodes?: LayoutNode['kind'][]
  racks?: boolean
  edges?: (layout: Layout) => string[]
}

const nonScaling = { vectorEffect: 'non-scaling-stroke' } as const
const ACCENT = 'var(--signal)'

/* The rest of the plan fades back and the focus stays in full colour: a route with a robot running along it,
   or the zones, markers and aisles behind one of the figures under the map. Coordinates are meters; `k` is px/m. */
export function FocusLayer({
  layout,
  k,
  route,
  spotlight,
}: {
  layout: Layout
  k: number
  route?: ExampleRoute | null
  spotlight?: Spotlight | null
}) {
  if (!route && !spotlight) return null
  return (
    <g pointerEvents="none">
      <motion.rect
        width={layout.width_m}
        height={layout.height_m}
        fill="var(--card)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.62 }}
        transition={{ duration: 0.25 }}
      />
      {spotlight && <SpotlightMarks layout={layout} k={k} spotlight={spotlight} />}
      {route && <RoutePath key={`${route.from.id}-${route.to.id}`} route={route} k={k} />}
    </g>
  )
}

function SpotlightMarks({ layout, k, spotlight }: { layout: Layout; k: number; spotlight: Spotlight }) {
  const zones = layout.zones.filter((z) => spotlight.zones.includes(z.kind))
  const nodes = layout.nodes.filter((n) => spotlight.nodes?.includes(n.kind))
  const racks = useMemo(
    () => (spotlight.racks ? (layout.racks ?? []).map((r) => polygonPath(r.polygon)).join('') : ''),
    [layout.racks, spotlight.racks],
  )
  const edges = useMemo(() => {
    const ids = spotlight.edges?.(layout)
    return ids?.length ? [...edgePaths(layout, new Set(ids)).values()].join('') : ''
  }, [layout, spotlight])

  return (
    <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
      {zones.map((zone) => (
        <path
          key={zone.id}
          d={polygonPath(zone.polygon)}
          fill={ZONE_COLOR[zone.kind]}
          fillOpacity={0.28}
          stroke={ACCENT}
          strokeWidth={2}
          {...nonScaling}
        />
      ))}
      {racks && <path d={racks} fill="oklch(0.62 0.05 250)" fillOpacity={0.75} />}
      {edges && <path d={edges} fill="none" stroke={ACCENT} strokeWidth={2.5} strokeLinecap="round" {...nonScaling} />}
      {nodes.map((node) => (
        <g key={node.id}>
          <circle cx={node.x} cy={node.y} r={6 / k} fill="none" stroke={ACCENT} strokeWidth={1.5} {...nonScaling}>
            <animate attributeName="r" values={`${5 / k};${13 / k}`} dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.9;0" dur="1.8s" repeatCount="indefinite" />
          </circle>
          <circle
            cx={node.x}
            cy={node.y}
            r={4.5 / k}
            fill={isMarkerKind(node.kind) ? MARKER_COLOR[node.kind] : ACCENT}
            stroke="white"
            strokeWidth={1.5}
            {...nonScaling}
          />
        </g>
      ))}
    </motion.g>
  )
}

function RoutePath({ route, k }: { route: ExampleRoute; k: number }) {
  const reduce = useReducedMotion()
  // Stable, so panning and zooming re-render the layer without restarting the robot's loop.
  const start = useCallback((el: SVGAnimateMotionElement | null) => el?.beginElement(), [])
  const d = route.nodes.map((n, i) => `${i ? 'L' : 'M'}${n.x} ${n.y}`).join('')
  // A walking pace on screen: long routes take longer, but a loop never drags past a few seconds.
  const seconds = Math.min(7, Math.max(2.5, route.length / 22))

  return (
    <g>
      {/* Stroke widths are in meters (px / k) rather than non-scaling, so the draw-in dash stays in path units. */}
      <path d={d} fill="none" stroke="white" strokeWidth={9 / k} strokeLinecap="round" strokeLinejoin="round" />
      <motion.path
        d={d}
        fill="none"
        stroke={ACCENT}
        strokeWidth={4 / k}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: reduce ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />
      <circle cx={route.from.x} cy={route.from.y} r={6 / k} fill="white" stroke={ACCENT} strokeWidth={3 / k} />
      <circle cx={route.to.x} cy={route.to.y} r={6.5 / k} fill={ACCENT} stroke="white" strokeWidth={2.5 / k} />
      {!reduce && (
        <g>
          <circle r={7 / k} fill="var(--foreground)" stroke="white" strokeWidth={2.5 / k}>
            <animateMotion
              ref={start}
              begin="indefinite"
              dur={`${seconds}s`}
              repeatCount="indefinite"
              path={d}
              keyPoints="0;1;1"
              keyTimes="0;0.85;1"
              calcMode="linear"
            />
          </circle>
        </g>
      )}
    </g>
  )
}

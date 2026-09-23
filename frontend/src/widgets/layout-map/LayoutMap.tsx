import { Maximize2, Minus, Plus, Waypoints } from 'lucide-react'
import { memo, useMemo, useRef, useState, type ReactNode } from 'react'
import type { LayoutGeometry, LayoutNode } from '@/shared/api/types'
import { formatNumber } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Toggle } from '@/shared/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import {
  EDGE_STYLE,
  MARKER_COLOR,
  MARKER_LABEL,
  ZONE_COLOR,
  dotsPath,
  edgePaths,
  isMarkerKind,
  polygonCenter,
  polygonPath,
  polygonSize,
  scaleBarMeters,
  type MarkerKind,
} from './geometry'
import { MapLegend } from './MapLegend'
import { useViewport, type LayoutMapView } from './useViewport'

export type LayoutHighlight = {
  zones?: string[]
  nodes?: string[]
  edges?: string[]
}

export type LayoutMapProps = {
  layout: LayoutGeometry
  /** Controlled route-graph visibility; omit to let the map toolbar own it. */
  showGraph?: boolean
  defaultShowGraph?: boolean
  onShowGraphChange?: (show: boolean) => void
  highlight?: LayoutHighlight
  legend?: boolean
  /** Sizes the map viewport, e.g. `h-[560px]`. */
  className?: string
  /** Stretch to the parent's height (the 2D view inside the twin card). */
  fill?: boolean
  /** Moves the zoom toolbar when the host puts its own controls in the corner. */
  toolbarClassName?: string
  /** Overlay in meter coordinates (robots, heat spots); `view.k` is pixels per meter for constant-size marks. */
  children?: ReactNode | ((view: LayoutMapView) => ReactNode)
}

const nonScaling = { vectorEffect: 'non-scaling-stroke' } as const

export function LayoutMap({
  layout,
  showGraph,
  defaultShowGraph = false,
  onShowGraphChange,
  highlight,
  legend = true,
  className,
  fill = false,
  toolbarClassName,
  children,
}: LayoutMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ownGraph, setOwnGraph] = useState(defaultShowGraph)
  const graph = showGraph ?? ownGraph
  const setGraph = (value: boolean) => {
    setOwnGraph(value)
    onShowGraphChange?.(value)
  }
  const { size, view, fit, zoomCenter, handlers } = useViewport(
    containerRef,
    layout.width_m,
    layout.height_m,
    `${layout.id ?? 'plan'}:${layout.version ?? `${layout.width_m}x${layout.height_m}`}`,
  )
  const barMeters = scaleBarMeters(view.k)

  return (
    <div className={cn('space-y-3', fill && 'h-full')}>
      <div
        ref={containerRef}
        className={cn(
          'relative h-[520px] cursor-grab touch-none overflow-hidden rounded-md border bg-canvas select-none active:cursor-grabbing',
          className,
        )}
        {...handlers}
      >
        {size.width > 0 && (
          <svg
            width={size.width}
            height={size.height}
            className="absolute inset-0"
            role="img"
            aria-label={`Планировка ${formatNumber(layout.width_m)} × ${formatNumber(layout.height_m)} м`}
          >
            <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
              <StaticLayer layout={layout} showGraph={graph} />
              {highlight && <HighlightLayer layout={layout} highlight={highlight} k={view.k} />}
              {typeof children === 'function' ? children(view) : children}
            </g>
            <ZoneLabels layout={layout} view={view} />
          </svg>
        )}

        <div
          data-map-control
          className={cn(
            'absolute top-2 right-2 flex items-center gap-1 rounded-lg border bg-raised p-1 shadow-lg',
            toolbarClassName,
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle size="sm" pressed={graph} onPressedChange={setGraph} aria-label="Граф маршрутов">
                <Waypoints /> Граф маршрутов
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Узлы и рёбра, по которым считаются маршруты роботов</TooltipContent>
          </Tooltip>
          <Button size="icon-sm" variant="ghost" onClick={() => zoomCenter(1.4)} aria-label="Приблизить">
            <Plus />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => zoomCenter(1 / 1.4)} aria-label="Отдалить">
            <Minus />
          </Button>
          <Button size="sm" variant="ghost" onClick={fit} aria-label="Показать целиком">
            <Maximize2 /> Целиком
          </Button>
        </div>

        <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-raised/90 px-2 py-1 text-[11px]">
          <div className="h-1.5 border-x border-b border-foreground" style={{ width: barMeters * view.k }} />
          <div className="num mt-0.5">{formatNumber(barMeters)} м</div>
        </div>
        <div className="num pointer-events-none absolute right-2 bottom-2 rounded-md bg-raised/90 px-2 py-1 text-[11px] text-muted-foreground">
          Здание {formatNumber(layout.width_m)} × {formatNumber(layout.height_m)} м
        </div>
      </div>
      {legend && <MapLegend layout={layout} showGraph={graph} />}
    </div>
  )
}

const StaticLayer = memo(function StaticLayer({ layout, showGraph }: { layout: LayoutGeometry; showGraph: boolean }) {
  const zones = useMemo(() => {
    const ordered = [...layout.zones].sort((a, b) => Number(a.kind === 'corridor') - Number(b.kind === 'corridor'))
    return ordered.map((zone) => ({ zone, d: polygonPath(zone.polygon) }))
  }, [layout.zones])
  const racks = useMemo(() => (layout.racks ?? []).map((rack) => polygonPath(rack.polygon)).join(''), [layout.racks])
  const markers = useMemo(
    () => layout.nodes.filter((n): n is LayoutNode & { kind: MarkerKind } => isMarkerKind(n.kind)),
    [layout.nodes],
  )
  const graph = useMemo(() => {
    if (!showGraph) return null
    return {
      edges: [...edgePaths(layout)],
      dots: dotsPath(layout.nodes.filter((n) => !isMarkerKind(n.kind))),
    }
  }, [layout, showGraph])

  return (
    <g>
      <rect
        x={0}
        y={0}
        width={layout.width_m}
        height={layout.height_m}
        fill="var(--card)"
        stroke="var(--muted-foreground)"
        strokeWidth={1.2}
        {...nonScaling}
      />
      {zones.map(({ zone, d }) => {
        const color = ZONE_COLOR[zone.kind]
        const corridor = zone.kind === 'corridor'
        return (
          <path
            key={zone.id}
            d={d}
            fill={color}
            fillOpacity={corridor ? 0.1 : 0.22}
            stroke={color}
            strokeOpacity={corridor ? 0.3 : 0.7}
            strokeWidth={1}
            {...nonScaling}
          >
            <title>{zone.name}</title>
          </path>
        )
      })}
      {racks && <path d={racks} fill="oklch(0.72 0.04 250)" fillOpacity={0.55} />}
      {graph && (
        <g fill="none" strokeLinecap="round" opacity={0.85}>
          {graph.edges.map(([kind, d]) => (
            <path
              key={kind}
              d={d}
              stroke={EDGE_STYLE[kind].color}
              strokeWidth={EDGE_STYLE[kind].width}
              strokeDasharray={EDGE_STYLE[kind].dash}
              {...nonScaling}
            />
          ))}
          <path d={graph.dots} stroke="var(--muted-foreground)" strokeWidth={3} {...nonScaling} />
        </g>
      )}
      {markers.map((node) => (
        <Marker key={node.id} node={node} />
      ))}
    </g>
  )
})

function Marker({ node }: { node: LayoutNode & { kind: MarkerKind } }) {
  const color = MARKER_COLOR[node.kind]
  const title = [MARKER_LABEL[node.kind], node.label].filter(Boolean).join(': ')
  const common = { fill: color, stroke: 'var(--card)', strokeWidth: 1, ...nonScaling }
  const s = node.kind === 'charger' ? 1.3 : 2.2
  const h = s / 2
  let shape: ReactNode
  if (node.kind === 'pick_station' || node.kind === 'dropoff') {
    shape = <circle cx={node.x} cy={node.y} r={h} {...common} />
  } else if (node.kind === 'charger') {
    shape = (
      <path
        d={`M${node.x} ${node.y - h * 1.3}l${h * 1.3} ${h * 1.3}l${-h * 1.3} ${h * 1.3}l${-h * 1.3} ${-h * 1.3}z`}
        {...common}
      />
    )
  } else {
    shape = <rect x={node.x - h} y={node.y - h} width={s} height={s} rx={0.3} {...common} />
  }
  return (
    <g>
      {shape}
      <title>{title}</title>
    </g>
  )
}

function HighlightLayer({ layout, highlight, k }: { layout: LayoutGeometry; highlight: LayoutHighlight; k: number }) {
  const zoneIds = useMemo(() => new Set(highlight.zones ?? []), [highlight.zones])
  const nodeIds = useMemo(() => new Set(highlight.nodes ?? []), [highlight.nodes])
  const edgeD = useMemo(() => {
    if (!highlight.edges?.length) return ''
    return [...edgePaths(layout, new Set(highlight.edges)).values()].join('')
  }, [layout, highlight.edges])
  return (
    <g fill="none" stroke="var(--primary)" pointerEvents="none">
      {layout.zones
        .filter((z) => zoneIds.has(z.id))
        .map((z) => (
          <path key={z.id} d={polygonPath(z.polygon)} strokeWidth={2.5} {...nonScaling} />
        ))}
      {edgeD && <path d={edgeD} strokeWidth={3} strokeLinecap="round" {...nonScaling} />}
      {layout.nodes
        .filter((n) => nodeIds.has(n.id))
        .map((n) => (
          <circle key={n.id} cx={n.x} cy={n.y} r={7 / k} strokeWidth={2} {...nonScaling} />
        ))}
    </g>
  )
}

const LABEL_CHAR_PX = 6.6

function ZoneLabels({ layout, view }: { layout: LayoutGeometry; view: LayoutMapView }) {
  const items = useMemo(
    () =>
      layout.zones
        .filter((z) => z.kind !== 'corridor')
        .map((z) => ({ id: z.id, name: z.name, center: polygonCenter(z.polygon), size: polygonSize(z.polygon) })),
    [layout.zones],
  )
  return (
    <g pointerEvents="none" fontSize={11} fontWeight={600} textAnchor="middle" dominantBaseline="middle">
      {items.map((item) => {
        const widthPx = item.size[0] * view.k
        const heightPx = item.size[1] * view.k
        if (heightPx < 14 || widthPx < 36) return null
        const fits = item.name.length * LABEL_CHAR_PX < widthPx - 8
        const text = fits
          ? item.name
          : `${item.name.slice(0, Math.max(3, Math.floor((widthPx - 8) / LABEL_CHAR_PX) - 1))}…`
        return (
          <text
            key={item.id}
            x={item.center[0] * view.k + view.tx}
            y={item.center[1] * view.k + view.ty}
            fill="var(--foreground)"
            stroke="var(--card)"
            strokeWidth={3}
            paintOrder="stroke"
            strokeLinejoin="round"
          >
            {text}
          </text>
        )
      })}
    </g>
  )
}

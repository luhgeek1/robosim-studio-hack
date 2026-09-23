import { Maximize2, Minus, Plus } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { Layout, LayoutNode, SimulationHeatmap } from '@/api/types'
import { formatNumber } from '@/lib/format'
import { poseAt, usePlayback, type RobotTrack } from '../playback'
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
import { useViewport, type LayoutMapView } from './useViewport'

const nonScaling = { vectorEffect: 'non-scaling-stroke' } as const

// ТЗ 3.6.1 asks for a 2D view: zones, routes, robots, operation and charging points. Same clock as the 3D twin.
export function Map2D({
  layout,
  tracks,
  heat,
  showGraph,
  selectedRobot,
  onSelectRobot,
}: {
  layout: Layout
  tracks?: RobotTrack[]
  heat?: SimulationHeatmap | null
  showGraph: boolean
  selectedRobot?: string | null
  onSelectRobot?: (id: string | null) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { size, view, fit, zoomCenter, handlers } = useViewport(
    containerRef,
    layout.width_m,
    layout.height_m,
    `${layout.id}:${layout.version}`,
  )
  const barMeters = scaleBarMeters(view.k)
  return (
    <div
      ref={containerRef}
      className="absolute inset-0 cursor-grab touch-none overflow-hidden bg-[#eef1f3] select-none active:cursor-grabbing"
      {...handlers}
    >
      {size.width > 0 && (
        <svg
          width={size.width}
          height={size.height}
          className="absolute inset-0"
          role="img"
          aria-label="2D-схема объекта"
        >
          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
            <StaticLayer layout={layout} showGraph={showGraph && !heat} />
            {heat && <HeatLayer layout={layout} heat={heat} />}
            {tracks && <RobotsLayer tracks={tracks} k={view.k} selected={selectedRobot} onSelect={onSelectRobot} />}
          </g>
          <ZoneLabels layout={layout} view={view} />
        </svg>
      )}
      <div
        data-map-control
        className="absolute top-4 left-4 z-10 flex items-center gap-0.5 rounded-xl border border-white/80 bg-white/95 p-1 shadow-card"
      >
        <MapButton label="Приблизить" onClick={() => zoomCenter(1.4)}>
          <Plus size={16} />
        </MapButton>
        <MapButton label="Отдалить" onClick={() => zoomCenter(1 / 1.4)}>
          <Minus size={16} />
        </MapButton>
        <MapButton label="Показать целиком" onClick={fit}>
          <Maximize2 size={15} />
        </MapButton>
      </div>
      <div className="pointer-events-none absolute top-16 left-4 rounded-md bg-white/90 px-2 py-1 text-[11px] text-ink-2 shadow-card">
        <div className="h-1.5 border-x border-b border-ink" style={{ width: barMeters * view.k }} />
        <div className="num mt-0.5">{formatNumber(barMeters)} м</div>
      </div>
    </div>
  )
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-2 transition hover:bg-black/[0.05] hover:text-ink"
    >
      {children}
    </button>
  )
}

const StaticLayer = memo(function StaticLayer({ layout, showGraph }: { layout: Layout; showGraph: boolean }) {
  const zones = useMemo(
    () =>
      [...layout.zones]
        .sort((a, b) => Number(a.kind === 'corridor') - Number(b.kind === 'corridor'))
        .map((zone) => ({ zone, d: polygonPath(zone.polygon) })),
    [layout.zones],
  )
  const racks = useMemo(() => (layout.racks ?? []).map((rack) => polygonPath(rack.polygon)).join(''), [layout.racks])
  const markers = useMemo(
    () => layout.nodes.filter((n): n is LayoutNode & { kind: MarkerKind } => isMarkerKind(n.kind)),
    [layout.nodes],
  )
  const graph = useMemo(
    () =>
      showGraph
        ? { edges: [...edgePaths(layout)], dots: dotsPath(layout.nodes.filter((n) => !isMarkerKind(n.kind))) }
        : null,
    [layout, showGraph],
  )
  return (
    <g>
      <rect
        x={0}
        y={0}
        width={layout.width_m}
        height={layout.height_m}
        fill="#f7f9fa"
        stroke="#17171a"
        strokeWidth={1.5}
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
            fillOpacity={corridor ? 0.1 : 0.18}
            stroke={color}
            strokeOpacity={corridor ? 0.3 : 0.7}
            strokeWidth={1}
            {...nonScaling}
          >
            <title>{zone.name}</title>
          </path>
        )
      })}
      {racks && <path d={racks} fill="#334b60" fillOpacity={0.55} />}
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
          <path d={graph.dots} stroke="#7b7b82" strokeWidth={3} {...nonScaling} />
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
  const common = { fill: color, stroke: '#ffffff', strokeWidth: 1, ...nonScaling }
  const s = node.kind === 'charger' ? 1.3 : 2.2
  const h = s / 2
  let shape: ReactNode
  if (node.kind === 'pick_station' || node.kind === 'dropoff')
    shape = <circle cx={node.x} cy={node.y} r={h} {...common} />
  else if (node.kind === 'charger')
    shape = (
      <path
        d={`M${node.x} ${node.y - h * 1.3}l${h * 1.3} ${h * 1.3}l${-h * 1.3} ${h * 1.3}l${-h * 1.3} ${-h * 1.3}z`}
        {...common}
      />
    )
  else shape = <rect x={node.x - h} y={node.y - h} width={s} height={s} rx={0.3} {...common} />
  return (
    <g>
      {shape}
      <title>{title}</title>
    </g>
  )
}

const HeatLayer = memo(function HeatLayer({ layout, heat }: { layout: Layout; heat: SimulationHeatmap }) {
  const lines = useMemo(() => {
    const nodes = new Map(layout.nodes.map((n) => [n.id, n]))
    const edges = new Map(layout.edges.map((e) => [e.id, e]))
    return heat.edges
      .filter((e) => (e.intensity ?? 0) > 0.02)
      .map((h) => {
        const edge = edges.get(h.edge_id)
        const a = edge && nodes.get(edge.from)
        const b = edge && nodes.get(edge.to)
        if (!a || !b) return null
        const v = h.intensity ?? 0
        return { id: h.edge_id, a, b, v, wait: h.wait_s, traffic: h.traffic }
      })
      .filter((x) => x !== null)
  }, [layout, heat])
  return (
    <g strokeLinecap="round" fill="none">
      {lines.map((l) => (
        <line
          key={l.id}
          x1={l.a.x}
          y1={l.a.y}
          x2={l.b.x}
          y2={l.b.y}
          stroke={l.v > 0.6 ? '#d24b3f' : l.v > 0.3 ? '#d18a1f' : '#287d9c'}
          strokeOpacity={0.35 + l.v * 0.65}
          strokeWidth={1.5 + l.v * 5}
          {...nonScaling}
        >
          <title>{`Проездов: ${l.traffic}, ожидание ${Math.round(l.wait)} с`}</title>
        </line>
      ))}
    </g>
  )
})

function RobotsLayer({
  tracks,
  k,
  selected,
  onSelect,
}: {
  tracks: RobotTrack[]
  k: number
  selected?: string | null
  onSelect?: (id: string | null) => void
}) {
  const refs = useRef(new Map<string, SVGGElement>())
  const headings = useRef(new Map<string, number>())
  useEffect(() => {
    let frame = 0
    const draw = () => {
      const t = usePlayback.getState().t
      for (const track of tracks) {
        const el = refs.current.get(track.id)
        if (!el) continue
        const pose = poseAt(track, t, headings.current.get(track.id) ?? 0)
        headings.current.set(track.id, pose.heading)
        el.setAttribute('transform', `translate(${pose.x} ${pose.y}) rotate(${(pose.heading * 180) / Math.PI})`)
        el.dataset.state = pose.state
        el.dataset.loaded = String(pose.loaded)
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [tracks])
  const r = 5 / k
  return (
    <g>
      {tracks.map((track) => (
        <g
          key={track.id}
          ref={(el) => {
            if (el) refs.current.set(track.id, el)
            else refs.current.delete(track.id)
          }}
          className="robot-2d cursor-pointer"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onSelect?.(selected === track.id ? null : track.id)}
        >
          <circle r={r} className="robot-body" stroke="#ffffff" strokeWidth={1.5} {...nonScaling} />
          <path d={`M${r * 0.2} ${-r * 0.55}L${r * 1.6} 0L${r * 0.2} ${r * 0.55}z`} fill="#17171a" opacity={0.7} />
          {selected === track.id && <circle r={r * 2} fill="none" stroke="#1d3fb5" strokeWidth={2} {...nonScaling} />}
          <title>{track.id}</title>
        </g>
      ))}
    </g>
  )
}

const LABEL_CHAR_PX = 6.6

function ZoneLabels({ layout, view }: { layout: Layout; view: LayoutMapView }) {
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
            fill="#17171a"
            stroke="#ffffff"
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

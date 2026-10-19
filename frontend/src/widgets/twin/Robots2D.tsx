import { BODY, LOADED, type HeatEdge, heatStyle, heatText } from './map-styles'
import { memo, useEffect, useMemo, useRef } from 'react'
import { poseAt, usePlayback, type RobotTrack } from '@/entities/simulation'
import type { LayoutGeometry, SimulationHeatmap } from '@/shared/api/types'

const nonScaling = { vectorEffect: 'non-scaling-stroke' } as const

// Robots on the 2D plan read the same playback clock as the 3D twin and are moved outside React, once per frame.
export function RobotsLayer({
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
        el.firstElementChild?.setAttribute('fill', pose.state === 'moving' && pose.loaded ? LOADED : BODY[pose.state])
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
          className="cursor-pointer"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onSelect?.(selected === track.id ? null : track.id)}
        >
          <circle r={r} fill={BODY.idle} stroke="#ffffff" strokeWidth={1.5} {...nonScaling} />
          <path d={`M${r * 0.2} ${-r * 0.55}L${r * 1.6} 0L${r * 0.2} ${r * 0.55}z`} fill="#141413" opacity={0.7} />
          {selected === track.id && <circle r={r * 2} fill="none" stroke="#1d3fb5" strokeWidth={2} {...nonScaling} />}
          <title>{`${track.id} · ${track.productName}`}</title>
        </g>
      ))}
    </g>
  )
}

export const HeatLayer = memo(function HeatLayer({
  layout,
  heat,
  onPick,
}: {
  layout: LayoutGeometry
  heat: SimulationHeatmap
  onPick?: (edge: HeatEdge) => void
}) {
  const lines = useMemo(() => {
    const nodes = new Map(layout.nodes.map((n) => [n.id, n]))
    const edges = new Map(layout.edges.map((e) => [e.id, e]))
    const maxTraffic = Math.max(1, ...heat.edges.map((e) => e.traffic ?? 0))
    const maxWait = Math.max(0, ...heat.edges.map((e) => e.wait_s ?? 0))
    return heat.edges
      .filter((e) => (e.traffic ?? 0) / maxTraffic > 0.02 || (e.wait_s ?? 0) > 0)
      .map((h) => {
        const edge = edges.get(h.edge_id)
        const a = edge && nodes.get(edge.from)
        const b = edge && nodes.get(edge.to)
        if (!a || !b) return null
        const item: HeatEdge = { id: h.edge_id, traffic: h.traffic ?? 0, wait: h.wait_s ?? 0 }
        return { item, a, b, style: heatStyle(item, maxTraffic, maxWait) }
      })
      .filter((x) => x !== null)
  }, [layout, heat])
  return (
    <g strokeLinecap="round" fill="none">
      {lines.map((l) => (
        <line
          key={l.item.id}
          x1={l.a.x}
          y1={l.a.y}
          x2={l.b.x}
          y2={l.b.y}
          stroke={l.style.color}
          strokeOpacity={l.style.opacity}
          strokeWidth={l.style.width}
          className="cursor-pointer"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onPick?.(l.item)}
          {...nonScaling}
        >
          <title>{heatText(l.item)}</title>
        </line>
      ))}
    </g>
  )
})

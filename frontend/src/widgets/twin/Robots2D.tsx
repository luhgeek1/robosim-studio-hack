import { memo, useEffect, useMemo, useRef } from 'react'
import { poseAt, usePlayback, type Pose, type RobotTrack } from '@/entities/simulation'
import type { LayoutGeometry, SimulationHeatmap } from '@/shared/api/types'

const nonScaling = { vectorEffect: 'non-scaling-stroke' } as const

export const BODY: Record<Pose['state'], string> = {
  moving: '#287d9c',
  load: '#8a5cd6',
  unload: '#8a5cd6',
  idle: '#9aa3ad',
  charge: 'var(--warn)',
  wait: 'var(--crit)',
  fail: '#5b1a14',
}
export const LOADED = '#1d3fb5'

// What a colour means on the plan: the legend under the map reads this list.
export const ROBOT_LEGEND: [string, string][] = [
  [BODY.moving, 'едет пустым'],
  [LOADED, 'везёт паллету'],
  [BODY.load, 'берёт или ставит паллету'],
  [BODY.idle, 'свободен, ждёт задачу'],
  [BODY.wait, 'ждёт в заторе'],
  [BODY.charge, 'на зарядке'],
]

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

export type HeatEdge = { id: string; traffic: number; wait: number }

// Flow and congestion: width follows the number of passes, colour follows waiting — an edge many robots
// crossed without stopping is busy, not jammed.
export function heatStyle(edge: HeatEdge, maxTraffic: number, maxWait: number) {
  const flow = maxTraffic ? edge.traffic / maxTraffic : 0
  const jam = maxWait ? edge.wait / maxWait : 0
  return {
    color: edge.wait > 0 ? (jam > 0.35 ? 'var(--crit)' : 'var(--warn)') : '#287d9c',
    width: 1.5 + flow * 5,
    opacity: 0.35 + Math.max(flow, jam) * 0.6,
  }
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

export function heatText(edge: HeatEdge): string {
  const passes = `Проездов за прогон: ${edge.traffic}`
  if (edge.wait <= 0) return `${passes}. Роботы здесь не ждали: участок загружен, но затора нет`
  const perPass = edge.traffic ? edge.wait / edge.traffic : 0
  return `${passes}. Роботы ждали здесь ${Math.round(edge.wait)} с суммарно, ≈${perPass.toFixed(1)} с на проезд`
}

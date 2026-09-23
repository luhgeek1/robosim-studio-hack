import { create } from 'zustand'
import type { LayoutGeometry, SimEvent, SimulationReplay } from '@/shared/api/types'

export type RobotState = 'moving' | 'load' | 'unload' | 'charge' | 'wait' | 'idle' | 'fail'

type Move = { kind: 'move'; t0: number; t1: number; xs: number[]; ys: number[]; cum: number[] }
type Stay = { kind: 'stay'; t0: number; t1: number; x: number; y: number; state: RobotState }
type Segment = Move | Stay

export type RobotTrack = {
  id: string
  processKey: string
  productName: string
  home: [number, number]
  segments: Segment[]
  loaded: [number, number][]
  tasks: { t: number; taskId: string | null }[]
}

export type Pose = { x: number; y: number; heading: number; state: RobotState; loaded: boolean }

const STAY_STATE: Partial<Record<SimEvent['type'], RobotState>> = {
  load: 'load',
  unload: 'unload',
  charge: 'charge',
  wait: 'wait',
  idle: 'idle',
  fail: 'fail',
}

// The engine records moves as node paths with departure and arrival times; the player only interpolates them
// (D-006: the frontend replays backend events and never decides where a robot goes).
export function buildTracks(replay: SimulationReplay, layout: LayoutGeometry): RobotTrack[] {
  const nodes = new Map(layout.nodes.map((n) => [n.id, n]))
  const byRobot = new Map<string, SimEvent[]>()
  for (const e of replay.events) {
    if (!e.robot_id) continue
    const list = byRobot.get(e.robot_id) ?? []
    list.push(e)
    byRobot.set(e.robot_id, list)
  }
  return replay.robots.map((robot) => {
    const homeNode = robot.home_node ? nodes.get(robot.home_node) : undefined
    const home: [number, number] = homeNode ? [homeNode.x, homeNode.y] : [0, 0]
    const events = (byRobot.get(robot.id) ?? []).sort((a, b) => a.t - b.t)
    const segments: Segment[] = []
    const loaded: [number, number][] = []
    const tasks: RobotTrack['tasks'] = []
    let loadedSince: number | null = null
    for (const e of events) {
      if (e.type === 'move' && e.path && e.path.length > 1 && e.eta != null) {
        const pts = e.path.map((id) => nodes.get(id)).filter((n) => n !== undefined)
        if (pts.length < 2) continue
        const xs = pts.map((p) => p.x)
        const ys = pts.map((p) => p.y)
        const cum = [0]
        for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]))
        segments.push({ kind: 'move', t0: e.t, t1: Math.max(e.eta, e.t + 1e-3), xs, ys, cum })
        continue
      }
      const state = STAY_STATE[e.type]
      if (state && e.node) {
        const n = nodes.get(e.node)
        if (n) segments.push({ kind: 'stay', t0: e.t, t1: e.t + (e.dur ?? 0), x: n.x, y: n.y, state })
      }
      if (e.type === 'load') loadedSince = e.t + (e.dur ?? 0)
      if (e.type === 'unload' && loadedSince != null) {
        loaded.push([loadedSince, e.t + (e.dur ?? 0)])
        loadedSince = null
      }
      if (e.type === 'task_assigned') tasks.push({ t: e.t, taskId: e.task_id ?? null })
    }
    if (loadedSince != null) loaded.push([loadedSince, Number.POSITIVE_INFINITY])
    return {
      id: robot.id,
      processKey: robot.process_key,
      productName: robot.product_name,
      home,
      segments,
      loaded,
      tasks,
    }
  })
}

function lastIndexAtOrBefore(segments: Segment[], t: number): number {
  let lo = 0
  let hi = segments.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (segments[mid].t0 <= t) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return found
}

function endOf(seg: Segment): [number, number, number] {
  if (seg.kind === 'stay') return [seg.x, seg.y, 0]
  const n = seg.xs.length - 1
  return [seg.xs[n], seg.ys[n], Math.atan2(seg.ys[n] - seg.ys[n - 1], seg.xs[n] - seg.xs[n - 1])]
}

export function poseAt(track: RobotTrack, t: number, previousHeading = 0): Pose {
  const i = lastIndexAtOrBefore(track.segments, t)
  const loaded = track.loaded.some(([a, b]) => t >= a && t < b)
  if (i < 0) return { x: track.home[0], y: track.home[1], heading: previousHeading, state: 'idle', loaded }
  const seg = track.segments[i]
  if (t >= seg.t1) {
    const [x, y, h] = endOf(seg)
    return { x, y, heading: seg.kind === 'move' ? h : previousHeading, state: 'idle', loaded }
  }
  if (seg.kind === 'stay') return { x: seg.x, y: seg.y, heading: previousHeading, state: seg.state, loaded }
  const total = seg.cum[seg.cum.length - 1]
  const d = ((t - seg.t0) / (seg.t1 - seg.t0)) * total
  let k = 1
  while (k < seg.cum.length - 1 && seg.cum[k] < d) k++
  const span = seg.cum[k] - seg.cum[k - 1] || 1
  const f = Math.min(1, Math.max(0, (d - seg.cum[k - 1]) / span))
  const dx = seg.xs[k] - seg.xs[k - 1]
  const dy = seg.ys[k] - seg.ys[k - 1]
  return {
    x: seg.xs[k - 1] + dx * f,
    y: seg.ys[k - 1] + dy * f,
    heading: dx || dy ? Math.atan2(dy, dx) : previousHeading,
    state: 'moving',
    loaded,
  }
}

export const SPEEDS = [30, 60, 120, 300] as const

type Clock = {
  t: number
  total: number
  playing: boolean
  speed: number
  runId: string | null
  load: (runId: string, total: number) => void
  setT: (t: number) => void
  setPlaying: (playing: boolean) => void
  setSpeed: (speed: number) => void
  tick: (dtSeconds: number) => void
}

// One clock for both views and the KPI panel: 3D and 2D read `t` every frame without re-rendering React.
export const usePlayback = create<Clock>((set, get) => ({
  t: 0,
  total: 0,
  playing: false,
  speed: 60,
  runId: null,
  load: (runId, total) => {
    if (get().runId === runId) return
    set({ runId, total, t: 0, playing: true })
  },
  setT: (t) => set({ t: Math.max(0, Math.min(get().total, t)) }),
  setPlaying: (playing) => {
    if (playing && get().t >= get().total) set({ t: 0 })
    set({ playing })
  },
  setSpeed: (speed) => set({ speed }),
  tick: (dt) => {
    const { playing, t, total, speed } = get()
    if (!playing || total <= 0) return
    const next = t + dt * speed
    if (next >= total) set({ t: total, playing: false })
    else set({ t: next })
  },
}))

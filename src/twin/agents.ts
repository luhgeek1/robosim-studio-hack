import { AISLES, CORRIDOR_BOTTOM, CORRIDOR_TOP, PICK_POINTS, RACK_X0, RACK_X1, RECEIVE_POINTS, SHIP_POINTS, DOCK_POINTS } from './layout'

export type Vec2 = [number, number]

export type Task = 'toReceiving' | 'toStorage' | 'toPicking' | 'toShipping' | 'idle' | 'returning'

export type Agent = {
  id: number
  pos: Vec2
  heading: number
  path: Vec2[]
  seg: number
  segT: number
  task: Task
  loaded: boolean
  idleFor: number
  speed: number
  dwell: number
  aisle: number
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]

/** Manhattan-ish route through corridors and aisles. */
export function route(from: Vec2, to: Vec2, viaAisle?: number): Vec2[] {
  const corridor = from[1] < 0 || to[1] < 0 ? (Math.random() < 0.5 ? CORRIDOR_TOP : CORRIDOR_BOTTOM) : CORRIDOR_BOTTOM
  const pts: Vec2[] = [from]
  if (viaAisle !== undefined) {
    // from -> corridor -> aisle entry -> point in aisle -> continue
    const entryX = from[0] < RACK_X0 ? RACK_X0 - 1.5 : RACK_X1 + 1.5
    pts.push([from[0], corridor], [entryX, corridor], [entryX, viaAisle], [to[0], viaAisle])
    if (to[1] !== viaAisle) pts.push(to)
  } else {
    pts.push([from[0], corridor], [to[0], corridor], to)
  }
  return dedupe(pts)
}

function dedupe(pts: Vec2[]) {
  const out: Vec2[] = []
  for (const p of pts) {
    const l = out[out.length - 1]
    if (!l || Math.abs(l[0] - p[0]) > 1e-3 || Math.abs(l[1] - p[1]) > 1e-3) out.push(p)
  }
  return out
}

export function makeAgent(id: number): Agent {
  const dock = DOCK_POINTS[id % DOCK_POINTS.length]
  return {
    id,
    pos: [dock[0], dock[1]],
    heading: 0,
    path: [],
    seg: 0,
    segT: 0,
    task: 'idle',
    loaded: false,
    idleFor: 0.3 + id * 0.6,
    speed: 5.2,
    dwell: 0,
    aisle: AISLES[id % AISLES.length],
  }
}

/** Decide the next leg of the cycle. utilization 0..1 controls idle time between cycles. */
export function nextLeg(a: Agent, utilization: number) {
  const idle = Math.max(0, 1 - utilization)
  switch (a.task) {
    case 'idle':
    case 'returning': {
      const p = RECEIVE_POINTS[a.id % RECEIVE_POINTS.length]
      a.path = route(a.pos, [p[0], p[1] + rand(-1.2, 1.2)])
      a.task = 'toReceiving'
      a.loaded = false
      break
    }
    case 'toReceiving': {
      a.loaded = true
      a.aisle = pick(AISLES)
      const x = rand(RACK_X0 + 2, RACK_X1 - 2)
      a.path = route(a.pos, [x, a.aisle], a.aisle)
      a.task = 'toStorage'
      break
    }
    case 'toStorage': {
      a.loaded = false
      // pick a pallet from another aisle then go to picking
      const p = PICK_POINTS[Math.floor(Math.random() * PICK_POINTS.length)]
      const aisle = a.aisle
      const exitX = RACK_X1 + 1.5
      a.path = dedupe([a.pos, [exitX, aisle], [exitX, CORRIDOR_BOTTOM], [p[0], CORRIDOR_BOTTOM], [p[0], p[1]]])
      a.task = 'toPicking'
      break
    }
    case 'toPicking': {
      a.loaded = true
      const p = SHIP_POINTS[Math.floor(Math.random() * SHIP_POINTS.length)]
      a.path = dedupe([a.pos, [a.pos[0] + 1, a.pos[1]], [p[0] - 2, p[1]], [p[0], p[1]]])
      a.task = 'toShipping'
      break
    }
    case 'toShipping': {
      a.loaded = false
      // idle proportionally to spare capacity, then return via the bottom corridor
      a.idleFor = idle * rand(4, 9)
      a.task = 'returning'
      const dock = DOCK_POINTS[a.id % DOCK_POINTS.length]
      const target: Vec2 = idle > 0.25 ? [dock[0], dock[1]] : [RECEIVE_POINTS[a.id % 4][0] - 2, CORRIDOR_BOTTOM]
      a.path = dedupe([a.pos, [a.pos[0], CORRIDOR_BOTTOM], [target[0], CORRIDOR_BOTTOM], target])
      break
    }
  }
  a.seg = 0
  a.segT = 0
  a.dwell = 0.5 + Math.random() * 0.6
}

export function stepAgent(a: Agent, dt: number, utilization: number, speedMul: number) {
  if (a.dwell > 0) {
    a.dwell -= dt
    return
  }
  if (a.path.length < 2) {
    if (a.idleFor > 0) {
      a.idleFor -= dt
      return
    }
    nextLeg(a, utilization)
    return
  }
  const from = a.path[a.seg]
  const to = a.path[a.seg + 1]
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const len = Math.hypot(dx, dz)
  const v = a.speed * speedMul
  a.segT += (v * dt) / Math.max(0.001, len)
  const targetHeading = Math.atan2(dx, dz)
  let dh = targetHeading - a.heading
  while (dh > Math.PI) dh -= Math.PI * 2
  while (dh < -Math.PI) dh += Math.PI * 2
  a.heading += dh * Math.min(1, dt * 9)
  if (a.segT >= 1) {
    a.pos = [to[0], to[1]]
    a.seg += 1
    a.segT = 0
    if (a.seg >= a.path.length - 1) {
      a.path = []
      a.dwell = a.task === 'returning' ? 0 : 0.9
    }
  } else {
    a.pos = [from[0] + dx * a.segT, from[1] + dz * a.segT]
  }
}

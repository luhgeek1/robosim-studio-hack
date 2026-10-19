import { mm, type ModelProps, type Variant } from '../types'

export function amrLoad(L: number, W: number, payload: number) {
  return { pw: Math.max(1.2, L * 1.04), pd: Math.max(0.8, W * 1.12), stack: 0.25 + (payload / 2000) * 1.1 }
}

export function stackerLayout(v: ModelProps['v']) {
  const [L, W, H] = mm(v.spec.dims_mm, [1800, 900, 2000])
  // Beam level: a floor-lift product still places its pallet on the lowest beam, clear of the straddle legs.
  const lift = Math.max((v.spec.lift_mm ?? 1600) / 1000, 0.3)
  const bodyL = Math.min(L * 0.5, 1.1)
  const mastX = -L / 2 + bodyL + 0.05
  const loadX = mastX + 0.12 + 0.6
  const stack = 0.3 + ((v.spec.payload_kg ?? 1400) / 2000) * 0.9
  const dx = 1.4
  const xmin = -dx - L / 2
  const xmax = loadX + 0.62
  return { L, W, H, lift, bodyL, mastX, loadX, stack, dx, xmin, xmax }
}

export function tugLayout(v: ModelProps['v']) {
  const [L, W, H] = mm(v.spec.dims_mm, [1600, 800, 2200])
  const n = Math.max(1, Math.min(3, Math.round((v.spec.tow_kg ?? 3000) / 1600)))
  const cartL = 1.5
  const cartW = 0.9
  const gap = 0.6
  const total = L + n * (cartL + gap)
  return { L, W, H, n, cartL, cartW, gap, total }
}

export function asrsLayout(v: Variant) {
  const height = v.spec.height_m ?? 24
  const pitch = 1.55
  const levels = Math.floor((height - 0.4) / pitch)
  // A 24 m aisle is a thin line in a card: the crane is drawn full size in a cut of the lower levels.
  const shown = Math.min(levels, 5)
  const bays = 4
  const bayW = 1.35
  const depth = 1.3
  const aisle = 1.7
  const x0 = -((bays + 1) * bayW) / 2
  const length = (bays + 1) * bayW
  const visH = 0.3 + shown * pitch + 0.25
  return { height, pitch, levels, shown, bays, bayW, depth, aisle, x0, length, visH }
}

export function cubeLayout(v: Variant) {
  const nx = 6
  const nz = 5
  const cx = 0.7
  const cz = 0.5
  const binH = 0.33
  // A 14 m cube would dwarf the robots; the stack is drawn as a cut of the top layers.
  const layers = Math.min(Math.round((v.spec.height_m ?? 14) / binH), 8)
  return { nx, nz, cx, cz, binH, layers, gridH: layers * binH + 0.08 }
}

// Scene idea from the robot-lab variant (approach → scan → counted), rebuilt on the gallery kit and specs.

export function inventoryLayout(v: Variant) {
  const scan = v.spec.height_m ?? 12
  // Rows stand for the scan height at a readable scale: 12.5 m → 4 rows, 12 m → 3.
  const rows = Math.max(3, Math.min(5, Math.round(scan / 3.5)))
  const cols = 3
  const pitchX = 1.1
  const pitchY = 0.55
  const rackZ = -0.65
  const rackH = 0.45 + rows * pitchY + 0.2
  return { scan, rows, cols, pitchX, pitchY, rackZ, rackH, width: cols * pitchX + 0.3 }
}

/** Link lengths and thickness follow the reach and payload encoded in the model name (А25-1720 = 25 kg, 1720 mm). */
export function armLayout(v: Variant) {
  const R = (v.spec.reach_mm ?? 1500) / 1000
  const P = v.spec.payload_kg ?? 10
  const rb = 0.1 + R * 0.05 + Math.pow(P, 0.35) * 0.012
  const hb = 0.1 + R * 0.07
  const hS = hb + R * 0.16
  const a = R * 0.46
  const b = R * 0.42
  const w = 0.06 + R * 0.06
  const th = 0.055 + R * 0.028 + Math.pow(P, 0.4) * 0.01
  const box = 0.14 + Math.cbrt(P) * 0.065
  const pickR = R * 0.62
  const beltTop = Math.min(0.75, hS * 0.75)
  return { R, P, rb, hb, hS, a, b, w, th, box, pickR, beltTop }
}

export function droneLayout(v: Variant) {
  const arms = 8
  const payload = v.spec.payload_kg ?? 30
  const armL = 0.3 + Math.sqrt(payload) * 0.1
  const hover = 1.9
  return { arms, payload, armL, hover }
}

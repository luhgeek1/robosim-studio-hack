import { RoundedBox } from '@react-three/drei'
import { useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import {
  Beacon,
  BlobShadow,
  Cartons,
  Lane,
  LedStrip,
  Lidar,
  M,
  Pallet,
  Wheel,
  paint,
  seg,
  useDrive,
  useGlow,
  useTick,
  type Drive,
} from '../kit'
import { mm, type ModelProps } from '../types'

type G = THREE.Group

/** Low AMR chassis: dark skirt, white shell, accent end caps, side LED strips. Front is +x. */
export function AmrBody({ L, W, H, accent }: { L: number; W: number; H: number; accent: string }) {
  const clear = Math.min(0.02, H * 0.08)
  const skirtH = H * 0.42
  const shellH = H - clear - skirtH * 0.75
  const r = Math.min(0.045, W * 0.08)
  const capL = Math.min(L * 0.13, 0.16)
  return (
    <group>
      <RoundedBox
        args={[L, skirtH, W]}
        radius={Math.min(r, skirtH / 2.2)}
        smoothness={3}
        position={[0, clear + skirtH / 2, 0]}
        material={M.dark}
      />
      <RoundedBox
        args={[L - capL * 2 + 0.004, shellH, W * 0.99]}
        radius={Math.min(r, shellH / 2.2)}
        smoothness={4}
        position={[0, H - shellH / 2, 0]}
        material={M.shell}
      />
      {[-1, 1].map((s) => (
        <group key={s}>
          <RoundedBox
            args={[capL, shellH, W * 0.99]}
            radius={Math.min(r, shellH / 2.2, capL / 2.2)}
            smoothness={4}
            position={[s * (L / 2 - capL / 2), H - shellH / 2, 0]}
            material={paint(accent, 0.35, 0.05, 0.7)}
          />
          <mesh material={M.glass} position={[s * (L / 2 + 0.002), clear + skirtH * 0.55, 0]}>
            <boxGeometry args={[0.004, skirtH * 0.42, W * 0.6]} />
          </mesh>
          <LedStrip
            size={[L * 0.46, Math.max(0.008, H * 0.045), 0.004]}
            pos={[0, H - shellH * 0.72, s * (W * 0.495 + 0.002)]}
            color={accent}
          />
        </group>
      ))}
    </group>
  )
}

/* ---------- AMR under a pallet ---------- */

export function amrLoad(L: number, W: number, payload: number) {
  return { pw: Math.max(1.2, L * 1.04), pd: Math.max(0.8, W * 1.12), stack: 0.25 + (payload / 2000) * 1.1 }
}

export function AmrLift({ v, accent }: ModelProps) {
  const [L, W, H] = mm(v.spec.dims_mm, [1000, 650, 300])
  const lift = Math.max((v.spec.lift_mm ?? 60) / 1000, 0.04)
  const speed = v.spec.speed_mps ?? 1.5
  const { pw, pd, stack } = amrLoad(L, W, v.spec.payload_kg ?? 1000)
  const body = useRef<G>(null)
  const top = useRef<G>(null)
  const drive = useDrive()
  const T = 9
  // Smoothstep peaks at 1.5× its mean speed: the drive window is sized so the peak equals the robot's top speed.
  const P = (speed * 3) / 1.5
  useTick((t) => {
    const c = Math.floor(t / T)
    const p = t % T
    drive.current.odo = c * P + P * seg(p, 1.2, 4.2)
    if (body.current) body.current.rotation.y = Math.PI * (c + seg(p, 4.5, 6.3))
    if (top.current) top.current.position.y = H + lift * (seg(p, 0.2, 1.0) - seg(p, 6.6, 7.6))
  })
  const plateR = Math.min(L, W) * 0.42
  return (
    <group>
      <Lane drive={drive} length={Math.max(pw, 1.5) * 3.4} width={pd * 1.4} />
      <BlobShadow w={L * 1.35} d={W * 1.4} />
      <group ref={body}>
        <AmrBody L={L} W={W} H={H} accent={accent} />
      </group>
      <group ref={top} position={[0, H, 0]}>
        <mesh material={paint(accent, 0.4, 0.2, 0.3)} position={[0, 0.006, 0]}>
          <cylinderGeometry args={[plateR * 1.04, plateR * 1.04, 0.012, 40]} />
        </mesh>
        <mesh material={M.rubber} position={[0, 0.018, 0]}>
          <cylinderGeometry args={[plateR, plateR, 0.016, 40]} />
        </mesh>
        <group position={[0, 0.026, 0]}>
          <Pallet w={pw} d={pd} />
          <group position={[0, 0.144, 0]}>
            <Cartons w={pw * 0.96} d={pd * 0.96} h={stack} />
          </group>
        </group>
      </group>
    </group>
  )
}

/* ---------- G2P: robot drives under a shelf pod, lifts and turns it ---------- */

const BIN_COLORS = ['#f2b441', '#5aa36b', '#e7eaee', '#4f7bd9']

export function G2P({ v, accent }: ModelProps) {
  const [L, W, H] = mm(v.spec.dims_mm, [960, 660, 335])
  const speed = v.spec.speed_mps ?? 2
  const pod = { w: Math.max(1, L + 0.16), d: Math.max(1, W + 0.16), h: 2.0 }
  const shelfY = Math.max(0.46, H + 0.18)
  const receiverBottom = shelfY - 0.075
  const plateThickness = 0.04
  const restPlateTop = H + 0.055
  const clearance = receiverBottom - restPlateTop
  const liftHeight = Math.max(0.05, (v.spec.lift_mm ?? 60) / 1000)
  const plate = useRef<G>(null)
  const piston = useRef<THREE.Mesh>(null)
  const dIn = 1.7
  const dur = Math.min(1.5, Math.max(0.9, (dIn * 1.5) / speed))
  const robot = useRef<G>(null)
  const podG = useRef<G>(null)
  const T = 11
  useTick((t) => {
    const c = Math.floor(t / T)
    const p = t % T
    const spin = seg(p, 2.8, 5.4)
    // The shelf moves only after the lift table physically contacts its underside.
    const extension = (clearance + liftHeight) * (seg(p, 1.9, 2.7) - seg(p, 6.0, 6.8))
    const plateTop = restPlateTop + extension
    if (plate.current) plate.current.position.y = plateTop - plateThickness / 2
    const pistonLength = plateTop - plateThickness - H
    if (piston.current) {
      piston.current.position.y = H + pistonLength / 2
      piston.current.scale.y = pistonLength
    }
    if (robot.current) {
      robot.current.position.x = -dIn * (1 - seg(p, 0.3, 0.3 + dur)) - dIn * seg(p, 8.4, 8.4 + dur)
      robot.current.rotation.y = (spin - seg(p, 6.7, 7.9)) * (Math.PI / 2)
    }
    if (podG.current) {
      podG.current.rotation.y = (c + spin) * (Math.PI / 2)
      podG.current.position.y = Math.max(0, plateTop - receiverBottom)
    }
  })
  const shelves = [shelfY, shelfY + 0.4, shelfY + 0.8, shelfY + 1.2]
  return (
    <group position={[dIn / 2, 0, 0]}>
      <BlobShadow w={pod.w * 1.4} d={pod.d * 1.4} />
      <group ref={robot}>
        <BlobShadow w={L * 1.3} d={W * 1.35} opacity={0.3} />
        <AmrBody L={L} W={W} H={H} accent={accent} />
        <mesh material={M.dark} position={[0, H + 0.012, 0]}>
          <cylinderGeometry args={[0.14, 0.17, 0.024, 32]} />
        </mesh>
        <mesh ref={piston} material={M.chrome} position={[0, H + 0.0075, 0]} scale={[1, 0.015, 1]}>
          <cylinderGeometry args={[0.095, 0.095, 1, 32]} />
        </mesh>
        <group ref={plate} position={[0, restPlateTop - plateThickness / 2, 0]}>
          <mesh material={M.steel}>
            <cylinderGeometry args={[Math.min(L, W) * 0.38, Math.min(L, W) * 0.38, 0.03, 40]} />
          </mesh>
          <mesh material={M.rubber} position={[0, 0.015, 0]}>
            <cylinderGeometry args={[Math.min(L, W) * 0.36, Math.min(L, W) * 0.36, 0.01, 40]} />
          </mesh>
        </group>
      </group>
      <group ref={podG}>
        <mesh material={M.steel} position={[0, receiverBottom + 0.015, 0]}>
          <boxGeometry args={[pod.w * 0.94, 0.03, pod.d * 0.94]} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} material={M.dark} position={[side * pod.w * 0.4, shelfY - 0.03, 0]}>
            <boxGeometry args={[0.05, 0.06, pod.d * 0.94]} />
          </mesh>
        ))}
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <mesh key={`${sx}${sz}`} material={M.dark} position={[sx * pod.w * 0.47, pod.h / 2, sz * pod.d * 0.47]}>
              <boxGeometry args={[0.04, pod.h, 0.04]} />
            </mesh>
          )),
        )}
        {shelves.map((y, i) => (
          <group key={y} position={[0, y, 0]}>
            <mesh material={M.shell2}>
              <boxGeometry args={[pod.w * 0.98, 0.025, pod.d * 0.98]} />
            </mesh>
            {[-1, 1].flatMap((a) =>
              [-1, 1].map((b) => (
                <RoundedBox
                  key={`${a}${b}`}
                  args={[0.42, 0.28, 0.42]}
                  radius={0.025}
                  smoothness={2}
                  position={[a * 0.23, 0.155, b * 0.23]}
                  material={paint(BIN_COLORS[(i + (a + 1) + (b + 1) * 2) % BIN_COLORS.length], 0.5, 0, 0.3)}
                />
              )),
            )}
          </group>
        ))}
        <mesh material={paint(accent, 0.35, 0.1, 0.6)} position={[0, pod.h - 0.02, 0]}>
          <boxGeometry args={[pod.w, 0.05, pod.d]} />
        </mesh>
      </group>
    </group>
  )
}

/* ---------- Sorter with a tilt tray: parcels drop into floor chutes ---------- */

let chuteTex: THREE.Texture | null = null
function chuteTexture() {
  if (chuteTex) return chuteTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  for (let i = -128; i < 256; i += 24) {
    g.fillStyle = '#f1b62f'
    g.beginPath()
    g.moveTo(i, 0)
    g.lineTo(i + 12, 0)
    g.lineTo(i + 140, 128)
    g.lineTo(i + 128, 128)
    g.fill()
  }
  g.fillStyle = '#1d2227'
  g.fillRect(14, 14, 100, 100)
  chuteTex = new THREE.CanvasTexture(c)
  chuteTex.colorSpace = THREE.SRGBColorSpace
  return chuteTex
}

export function SorterTilt({ v, accent }: ModelProps) {
  const [L, W, H] = mm(v.spec.dims_mm, [420, 400, 200])
  const speed = v.spec.speed_mps ?? 2.5
  const payload = v.spec.payload_kg ?? 10
  const ps = 0.16 + Math.cbrt(payload / 10) * 0.12
  const parcel: [number, number, number] = [ps * 1.25, ps * 0.8, ps]
  const trayY = H + 0.02
  const drive = useDrive()
  const pivot = useRef<G>(null)
  const box = useRef<G>(null)
  const chutes = useRef<(THREE.Mesh | null)[]>([])
  const chuteMats = useMemo(
    () =>
      [0, 1].map(
        () => new THREE.MeshBasicMaterial({ map: chuteTexture(), transparent: true, depthWrite: false, opacity: 1 }),
      ),
    [],
  )
  const T = 6
  const P = (speed * 1.8) / 1.5
  const laneLen = Math.max(P * 1.6, 3)
  const chuteZ = -(W / 2 + 0.2)
  useTick((t) => {
    const c = Math.floor(t / T)
    const p = t % T
    drive.current.odo = c * P + P * seg(p, 0.2, 2.0)
    const x0 = (c + 1) * P - drive.current.odo
    chutes.current.forEach((m, i) => {
      if (!m) return
      const x = x0 - i * P
      m.position.x = x
      chuteMats[i].opacity = 1 - seg(Math.abs(x), laneLen * 0.25, laneLen * 0.45)
    })
    const tilt = seg(p, 2.3, 2.8) - seg(p, 3.4, 3.9)
    const a = -0.8 * tilt
    if (pivot.current) pivot.current.rotation.x = a
    const b = box.current
    if (!b) return
    // The parcel rides the tray while it tilts, slides past the hinge, then drops through the chute.
    const slide = seg(p, 2.75, 3.15)
    const fall = seg(p, 3.1, 3.55)
    const z0 = W / 2 - slide * (W / 2 + 0.06)
    const y0 = parcel[1] / 2 + 0.02
    const on = p < 3.1
    const ty = trayY + y0 * Math.cos(a) - z0 * Math.sin(a)
    const tz = -W / 2 + y0 * Math.sin(a) + z0 * Math.cos(a)
    b.position.set(0, on ? ty : ty - fall * (trayY + 0.6), on ? tz : tz + (chuteZ - tz) * fall)
    b.rotation.x = on ? a : a - fall * 0.9
    const pop = seg(p, 4.2, 4.6)
    b.scale.setScalar(p > 3.6 && p < 4.2 ? 0.001 : p >= 4.2 ? Math.max(0.001, pop) : 1)
    b.visible = !(p > 3.6 && p < 4.2)
  })
  return (
    <group>
      <Lane drive={drive} length={laneLen} width={W * 2.6} />
      {[0, 1].map((i) => (
        <mesh
          key={i}
          ref={(m) => {
            chutes.current[i] = m
          }}
          material={chuteMats[i]}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.004, chuteZ]}
          renderOrder={3}
        >
          <planeGeometry args={[parcel[0] * 1.6, parcel[2] * 1.9]} />
        </mesh>
      ))}
      <BlobShadow w={L * 1.4} d={W * 1.4} />
      <RoundedBox
        args={[L, H * 0.8, W]}
        radius={Math.min(0.05, H * 0.3)}
        smoothness={4}
        position={[0, H * 0.42, 0]}
        material={M.shell}
      />
      <mesh material={M.dark} position={[0, 0.03, 0]}>
        <boxGeometry args={[L * 0.96, 0.05, W * 0.96]} />
      </mesh>
      <LedStrip size={[0.004, H * 0.12, W * 0.6]} pos={[L / 2 + 0.002, H * 0.45, 0]} color={accent} rate={2.2} />
      <mesh material={M.glass} position={[L / 2 + 0.002, H * 0.25, 0]}>
        <boxGeometry args={[0.004, H * 0.14, W * 0.4]} />
      </mesh>
      <group ref={pivot} position={[0, trayY, -W / 2]}>
        <group position={[0, 0, W / 2]}>
          <RoundedBox
            args={[L * 1.06, 0.02, W * 1.02]}
            radius={0.008}
            smoothness={2}
            material={paint(accent, 0.35, 0.1, 0.6)}
          />
          {[-1, 1].map((s) => (
            <mesh key={s} material={paint(accent, 0.35, 0.1, 0.6)} position={[s * L * 0.53, 0.025, 0]}>
              <boxGeometry args={[0.012, 0.05, W * 1.02]} />
            </mesh>
          ))}
        </group>
      </group>
      <group ref={box}>
        <mesh material={M.carton} castShadow>
          <boxGeometry args={parcel} />
        </mesh>
        <mesh material={M.tape} position={[0, parcel[1] / 2 + 0.002, 0]}>
          <boxGeometry args={[parcel[0] * 1.01, 0.003, parcel[2] * 0.22]} />
        </mesh>
        <mesh
          material={paint('#ffffff', 0.6, 0, 0)}
          position={[parcel[0] * 0.2, parcel[1] / 2 + 0.003, parcel[2] * 0.25]}
        >
          <boxGeometry args={[parcel[0] * 0.3, 0.002, parcel[2] * 0.2]} />
        </mesh>
      </group>
    </group>
  )
}

/* ---------- Sorter with a lifting roller deck: transfers totes between conveyors at two heights ---------- */

function RollerBed({
  len,
  width,
  n,
  spin,
  rail,
}: {
  len: number
  width: number
  n: number
  spin: RefObject<number>
  rail: THREE.Material
}) {
  const rollers = useRef<(THREE.Mesh | null)[]>([])
  const r = 0.024
  useTick(() => {
    rollers.current.forEach((m) => {
      if (m) m.rotation.y = spin.current / r
    })
  })
  return (
    <group>
      {Array.from({ length: n }, (_, i) => (
        <group key={i} position={[0, -r, -len / 2 + (len / (n - 1)) * i]} rotation={[0, 0, Math.PI / 2]}>
          <mesh
            ref={(m) => {
              rollers.current[i] = m
            }}
            material={M.chrome}
          >
            <cylinderGeometry args={[r, r, width * 0.9, 14]} />
          </mesh>
        </group>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} material={rail} position={[s * width * 0.48, -r, 0]}>
          <boxGeometry args={[0.03, 0.07, len + 0.06]} />
        </mesh>
      ))}
    </group>
  )
}

export function SorterConveyor({ v, accent }: ModelProps) {
  const [L, W] = mm(v.spec.dims_mm, [590, 810, 870])
  const lo = (v.spec.lift_min_mm ?? 200) / 1000
  const hi = (v.spec.lift_mm ?? 1000) / 1000
  const lowY = lo + (hi - lo) * 0.25
  const highY = lo + (hi - lo) * 0.85
  const baseH = Math.max(0.12, lo * 0.8)
  const tableLen = 0.8
  const zL = -(W / 2 + 0.03 + tableLen / 2)
  const zR = -zL
  const boxS: [number, number, number] = [0.4, 0.28, 0.36]
  const deck = useRef<G>(null)
  const colIn = useRef<THREE.Mesh>(null)
  const colOut = useRef<THREE.Mesh>(null)
  const box = useRef<G>(null)
  const spin = useRef(0)
  const accentMat = paint(accent, 0.35, 0.1, 0.6)
  const T = 8
  useTick((t) => {
    const p = t % T
    const deckY = lowY + (highY - lowY) * (seg(p, 1.7, 3.0) - seg(p, 5.0, 6.3))
    if (deck.current) deck.current.position.y = deckY
    const colH = deckY - baseH - 0.03
    if (colIn.current) {
      colIn.current.scale.y = colH
      colIn.current.position.y = baseH + colH / 2
    }
    if (colOut.current) {
      colOut.current.scale.y = colH * 0.55
      colOut.current.position.y = baseH + (colH * 0.55) / 2
    }
    let z: number
    let y: number
    let s = 1
    if (p < 5.2) {
      z = zL * (1 - seg(p, 0.3, 1.5)) + zR * seg(p, 3.2, 4.4) + 0.35 * seg(p, 4.4, 5.2)
      y = p > 4.4 ? highY : p < 1.5 ? lowY : deckY
      s = 1 - seg(p, 4.8, 5.2)
    } else {
      z = zL
      y = lowY
      s = seg(p, 6.2, 6.8)
    }
    spin.current = z
    if (box.current) {
      box.current.position.set(0, y + boxS[1] / 2, z)
      box.current.scale.setScalar(Math.max(0.001, s))
    }
  })
  return (
    <group>
      <BlobShadow w={L * 1.4} d={W * 1.3} />
      <AmrBody L={L} W={W} H={baseH} accent={accent} />
      <mesh ref={colOut} material={M.dark} position={[0, baseH, 0]}>
        <boxGeometry args={[0.2, 1, 0.2]} />
      </mesh>
      <mesh ref={colIn} material={M.chrome} position={[0, baseH, 0]}>
        <boxGeometry args={[0.14, 1, 0.14]} />
      </mesh>
      <group ref={deck}>
        <mesh material={M.dark} position={[0, -0.075, 0]}>
          <boxGeometry args={[L * 0.9, 0.03, W * 0.94]} />
        </mesh>
        <RollerBed len={W * 0.9} width={L * 0.98} n={8} spin={spin} rail={accentMat} />
        <LedStrip size={[0.004, 0.02, W * 0.8]} pos={[L * 0.5, -0.06, 0]} color={accent} rate={2} />
      </group>
      {[
        { z: zL, y: lowY },
        { z: zR, y: highY },
      ].map((tb) => (
        <group key={tb.z} position={[0, tb.y, tb.z]}>
          <RollerBed len={tableLen} width={L * 0.95} n={7} spin={spin} rail={M.shell2} />
          {[-1, 1].flatMap((sx) =>
            [-1, 1].map((sz) => (
              <mesh key={`${sx}${sz}`} material={M.steel} position={[sx * L * 0.42, -tb.y / 2, sz * tableLen * 0.45]}>
                <boxGeometry args={[0.035, tb.y, 0.035]} />
              </mesh>
            )),
          )}
        </group>
      ))}
      <group ref={box}>
        <RoundedBox args={boxS} radius={0.02} smoothness={2} material={paint('#4f7bd9', 0.5, 0, 0.3)} />
        <mesh material={paint('#ffffff', 0.5, 0, 0)} position={[boxS[0] / 2 + 0.001, 0.02, 0]}>
          <boxGeometry args={[0.002, 0.08, 0.14]} />
        </mesh>
      </group>
    </group>
  )
}

/* ---------- Autonomous stacker / FMR: mast height follows lift height ---------- */

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

export function Stacker({ v, accent }: ModelProps) {
  const { L, W, H, lift, bodyL, mastX, loadX, stack, dx, xmin, xmax } = stackerLayout(v)
  const speed = v.spec.speed_mps ?? 1.5
  const bodyH = Math.min(1.3, H * 0.5)
  const mastH = Math.max(H - 0.05, bodyH + 0.3)
  const du = 1.0 + lift * 0.3
  const dur = Math.max(1.0, (Math.max(dx, 1) * 1.5) / speed)
  const b0 = 0.6
  const b1 = b0 + du
  const c0 = b1 + 0.3
  const c1 = c0 + dur
  const d0 = c1 + 0.2
  const d1 = d0 + 0.6
  const e0 = d1 + 0.2
  const e1 = e0 + dur
  const f0 = e1 + 0.2
  const f1 = f0 + du
  const half = f1 + 0.8
  const robot = useRef<G>(null)
  const carriage = useRef<G>(null)
  const stages = useRef<(G | null)[]>([])
  // Telescopic mast: enough nested stages that each still overlaps the one below at full lift.
  const maxExt = Math.max(0, lift + 0.1 + 1.2 - mastH)
  const nStages = maxExt > 0 ? Math.ceil(maxExt / (mastH * 0.8)) : 0
  const load = useRef<G>(null)
  const drive = useDrive()
  const spot = useGlow('#3a8bff', 2.4)
  useTick((t) => {
    let carY: number
    let rx = 0
    let px: number
    let py: number
    const k = Math.floor(t / half)
    const p = t % half
    const put = k % 2 === 0
    carY = put
      ? 0.06 + (lift + 0.04) * seg(p, b0, b1) - 0.14 * seg(p, d0, d1) - (lift - 0.1) * seg(p, f0, f1)
      : 0.06 + (lift - 0.1) * seg(p, b0, b1) + 0.14 * seg(p, d0, d1) - (lift + 0.04) * seg(p, f0, f1)
    rx = -dx + dx * seg(p, c0, c1) - dx * seg(p, e0, e1)
    const racked = put ? p >= d0 : p < d1
    px = racked ? loadX : rx + loadX
    py = racked ? Math.max(carY, lift) : carY
    drive.current.odo = rx
    if (robot.current) robot.current.position.x = rx
    if (carriage.current) carriage.current.position.y = carY
    const ext = Math.max(0, carY + 1.2 - mastH)
    stages.current.forEach((g, i) => {
      if (g) g.position.y = (ext * (i + 1)) / nStages
    })
    if (load.current) load.current.position.set(px, py, 0)
    spot.emissiveIntensity = 1.6 + Math.sin(t * 6) * 0.6
  })

  const bodyMat = paint(accent, 0.38, 0.1, 0.6)
  const levels: number[] = []
  for (let y = 1.6; y < lift - 1.2; y += 1.6) levels.push(y)
  const rackH = lift + stack + 0.45
  return (
    <group position={[-(xmin + xmax) / 2, 0, 0]}>
      <group position={[loadX, 0, 0]}>
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <mesh key={`${sx}${sz}`} material={M.rackBlue} position={[sx * 0.5, rackH / 2, sz * 0.72]}>
              <boxGeometry args={[0.08, rackH, 0.08]} />
            </mesh>
          )),
        )}
        {[...levels, lift].flatMap((y) =>
          [-1, 1].map((sx) => (
            <mesh key={`${y}${sx}`} material={M.beamOrange} position={[sx * 0.5, y - 0.06, 0]}>
              <boxGeometry args={[0.06, 0.12, 1.52]} />
            </mesh>
          )),
        )}
        {levels.map((y) => (
          <group key={y} position={[0, y, 0]}>
            <Pallet w={1.2} d={0.8} />
            <group position={[0, 0.144, 0]}>
              <Cartons w={1.15} d={0.78} h={Math.min(stack, 1.1)} />
            </group>
          </group>
        ))}
      </group>
      <group ref={robot}>
        <BlobShadow w={L * 1.2} d={W * 1.35} />
        <RoundedBox
          args={[bodyL + 0.02, 0.2, W + 0.02]}
          radius={0.05}
          smoothness={3}
          position={[-L / 2 + bodyL / 2, 0.12, 0]}
          material={M.dark}
        />
        <RoundedBox
          args={[bodyL, bodyH, W]}
          radius={0.08}
          smoothness={4}
          position={[-L / 2 + bodyL / 2, 0.14 + bodyH / 2, 0]}
          material={bodyMat}
        />
        <RoundedBox
          args={[bodyL * 0.86, 0.05, W * 0.86]}
          radius={0.02}
          smoothness={3}
          position={[-L / 2 + bodyL / 2, 0.14 + bodyH + 0.02, 0]}
          material={M.shell}
        />
        <mesh material={M.glass} position={[-L / 2 + bodyL * 0.55, 0.14 + bodyH * 0.62, W / 2 + 0.002]}>
          <boxGeometry args={[bodyL * 0.42, bodyH * 0.22, 0.004]} />
        </mesh>
        <LedStrip
          size={[bodyL * 0.8, 0.025, 0.004]}
          pos={[-L / 2 + bodyL / 2, 0.14 + bodyH * 0.3, -(W / 2 + 0.002)]}
          color="#9fe3ff"
        />
        <Lidar pos={[-L / 2 + 0.2, 0.14 + bodyH + 0.04, 0]} r={0.06} />
        <Beacon pos={[-L / 2 + 0.2, 0.14 + bodyH + 0.04, W * 0.34]} r={0.05} />
        <Wheel r={0.14} w={0.1} pos={[-L / 2 + bodyL * 0.5, 0.14, W / 2 - 0.02]} drive={drive} />
        <Wheel r={0.14} w={0.1} pos={[-L / 2 + bodyL * 0.5, 0.14, -(W / 2 - 0.02)]} drive={drive} />
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh material={M.dark} position={[mastX + 0.6, 0.07, s * (W / 2 - 0.07)]}>
              <boxGeometry args={[1.15, 0.1, 0.1]} />
            </mesh>
            <Wheel r={0.05} w={0.07} pos={[mastX + 1.05, 0.05, s * (W / 2 - 0.07)]} drive={drive} />
            <mesh material={M.dark} position={[mastX, mastH / 2, s * W * 0.33]}>
              <boxGeometry args={[0.1, mastH, 0.07]} />
            </mesh>
          </group>
        ))}
        <mesh material={M.dark} position={[mastX, mastH - 0.04, 0]}>
          <boxGeometry args={[0.1, 0.08, W * 0.74]} />
        </mesh>
        {Array.from({ length: nStages }, (_, i) => {
          const z = W * (0.29 - (i + 1) * 0.03)
          return (
            <group
              key={i}
              ref={(g) => {
                stages.current[i] = g
              }}
            >
              {[-1, 1].map((s) => (
                <mesh
                  key={s}
                  material={i % 2 ? M.steel : M.chrome}
                  position={[mastX + 0.03 + i * 0.012, mastH / 2, s * z]}
                >
                  <boxGeometry args={[0.07 - i * 0.008, mastH, 0.05]} />
                </mesh>
              ))}
              <mesh material={M.steel} position={[mastX + 0.03 + i * 0.012, mastH - 0.03, 0]}>
                <boxGeometry args={[0.06, 0.06, z * 2 + 0.05]} />
              </mesh>
            </group>
          )
        })}
        <group ref={carriage}>
          {[0.1, 0.55, 1.0].map((y) => (
            <mesh key={y} material={M.dark} position={[mastX + 0.11, y, 0]}>
              <boxGeometry args={[0.04, 0.05, W * 0.72]} />
            </mesh>
          ))}
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh material={M.dark} position={[mastX + 0.11, 0.55, s * W * 0.34]}>
                <boxGeometry args={[0.04, 1.1, 0.04]} />
              </mesh>
              <mesh material={M.steel} position={[mastX + 0.12 + 0.575, -0.022, s * 0.22]}>
                <boxGeometry args={[1.15, 0.045, 0.12]} />
              </mesh>
            </group>
          ))}
        </group>
        <mesh material={spot} rotation={[-Math.PI / 2, 0, 0]} position={[L / 2 + 0.9, 0.004, 0]}>
          <circleGeometry args={[0.16, 32]} />
        </mesh>
      </group>
      <group ref={load}>
        <Pallet w={1.2} d={0.8} />
        <group position={[0, 0.144, 0]}>
          <Cartons w={1.15} d={0.78} h={stack} />
        </group>
      </group>
    </group>
  )
}

/* ---------- Tow tractor: number of carts follows towing capacity ---------- */

function Cart({ len, wid, drive }: { len: number; wid: number; drive: RefObject<Drive> }) {
  const deckY = 0.36
  return (
    <group>
      <BlobShadow w={len * 1.1} d={wid * 1.3} opacity={0.3} />
      <mesh material={M.rackBlue} position={[0, deckY, 0]}>
        <boxGeometry args={[len, 0.07, wid]} />
      </mesh>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Wheel key={`${sx}${sz}`} r={0.12} w={0.07} pos={[sx * len * 0.38, 0.12, sz * wid * 0.4]} drive={drive} />
        )),
      )}
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`p${sx}${sz}`} material={M.steel} position={[sx * len * 0.47, deckY + 0.7, sz * wid * 0.47]}>
            <boxGeometry args={[0.03, 1.4, 0.03]} />
          </mesh>
        )),
      )}
      {[0.45, 1.0, 1.38].map((y) =>
        [-1, 1].map((sz) => (
          <mesh key={`r${y}${sz}`} material={M.steel} position={[0, deckY + y, sz * wid * 0.47]}>
            <boxGeometry args={[len * 0.96, 0.025, 0.025]} />
          </mesh>
        )),
      )}
      <group position={[0, deckY + 0.035, 0]}>
        <Cartons w={len * 0.9} d={wid * 0.85} h={1.1} cols={3} rows={2} />
      </group>
    </group>
  )
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

export function Tug({ v, accent }: ModelProps) {
  const { L, W, H, n, cartL, cartW, gap, total } = tugLayout(v)
  const speed = v.spec.speed_mps ?? 2
  const drive = useDrive()
  const carts = useRef<(G | null)[]>([])
  const T = 8
  const P = (speed * 5) / 1.5
  useTick((t) => {
    const c = Math.floor(t / T)
    const p = t % T
    drive.current.odo = c * P + P * seg(p, 0.8, 5.8)
    const moving = seg(p, 0.8, 1.6) - seg(p, 5.0, 5.8)
    carts.current.forEach((g, i) => {
      if (g) g.rotation.y = Math.sin(drive.current.odo * 1.1 + i * 1.7) * 0.018 * moving
    })
  })
  const shift = (total - L) / 2
  const wheelR = 0.17
  const chassisH = 0.6
  const bodyMat = paint(accent, 0.38, 0.1, 0.6)
  return (
    <group>
      <Lane drive={drive} length={total * 1.7} width={Math.max(W, cartW) * 1.9} />
      <group position={[shift, 0, 0]}>
        <BlobShadow w={L * 1.2} d={W * 1.4} />
        <RoundedBox
          args={[L, chassisH, W]}
          radius={Math.min(0.1, chassisH / 3)}
          smoothness={4}
          position={[0, wheelR * 0.7 + chassisH / 2, 0]}
          material={bodyMat}
        />
        <RoundedBox
          args={[L * 0.62, 0.06, W * 0.9]}
          radius={0.025}
          smoothness={3}
          position={[-L * 0.1, wheelR * 0.7 + chassisH + 0.02, 0]}
          material={M.shell}
        />
        <RoundedBox
          args={[0.14, chassisH * 0.5, W * 1.02]}
          radius={0.04}
          smoothness={3}
          position={[L / 2, wheelR * 0.7 + chassisH * 0.3, 0]}
          material={M.dark}
        />
        <mesh material={M.glass} position={[L / 2 + 0.002, wheelR * 0.7 + chassisH * 0.72, 0]}>
          <boxGeometry args={[0.004, chassisH * 0.2, W * 0.7]} />
        </mesh>
        <LedStrip
          size={[0.006, 0.03, W * 0.8]}
          pos={[L / 2 + 0.004, wheelR * 0.7 + chassisH * 0.88, 0]}
          color="#e9f6ff"
          rate={0.6}
        />
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <Wheel
              key={`${sx}${sz}`}
              r={wheelR}
              w={0.11}
              pos={[sx * L * 0.33, wheelR, sz * (W / 2 + 0.02)]}
              drive={drive}
            />
          )),
        )}
        <group>
          <mesh material={M.dark} position={[L / 2 - 0.16, (H + wheelR + chassisH) / 2, 0]}>
            <boxGeometry args={[0.06, H - wheelR - chassisH, 0.06]} />
          </mesh>
          <Lidar pos={[L / 2 - 0.16, H - 0.1, 0]} r={0.07} />
          <Beacon pos={[-L / 2 + 0.2, wheelR * 0.7 + chassisH + 0.05, 0]} r={0.055} />
        </group>
        {Array.from({ length: n }, (_, i) => {
          const x = -L / 2 - gap - cartL / 2 - i * (cartL + gap)
          return (
            <group key={i}>
              <mesh material={M.dark} position={[x + cartL / 2 + gap / 2, 0.36, 0]}>
                <boxGeometry args={[gap + 0.1, 0.04, 0.04]} />
              </mesh>
              <group
                ref={(g) => {
                  carts.current[i] = g
                }}
                position={[x, 0, 0]}
              >
                <Cart len={cartL} wid={cartW} drive={drive} />
              </group>
            </group>
          )
        })}
      </group>
    </group>
  )
}

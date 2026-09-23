import { Environment, Lightformer, PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode, type RefObject } from 'react'
import * as THREE from 'three'
import { useGallery, type DragState } from './store'

/* ---------- timing ---------- */

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
export const ease = (x: number) => {
  const c = clamp01(x)
  return c * c * (3 - 2 * c)
}
/** Eased 0 → 1 progress of `t` through the window [a, b]. */
export const seg = (t: number, a: number, b: number) => ease((t - a) / (b - a))
/** 0 → 1 → 0 bump: up during [a, b], down during [c, d]. */
export const hold = (t: number, a: number, b: number, c: number, d: number) => seg(t, a, b) - seg(t, c, d)

/** Local animation clock that stops while the gallery is paused; `dt` is 0 on paused frames. */
export function useTick(cb: (t: number, dt: number) => void) {
  const t = useRef(0)
  useFrame((_, delta) => {
    const dt = useGallery.getState().paused ? 0 : Math.min(delta, 0.05) * useGallery.getState().speed
    t.current += dt
    cb(t.current, dt)
  })
}

/** Distance driven by a robot: the lane scrolls and the wheels roll from the same odometer. */
export type Drive = { speed: number; odo: number }
export function useDrive(): RefObject<Drive> {
  return useRef<Drive>({ speed: 0, odo: 0 })
}

/* ---------- materials ---------- */

const cache = new Map<string, THREE.Material>()
function cached<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key)
  if (!m) {
    m = make()
    cache.set(key, m)
  }
  return m as T
}

export const paint = (color: string, roughness = 0.42, metalness = 0.05, clearcoat = 0.5) =>
  cached(
    `p:${color}:${roughness}:${metalness}:${clearcoat}`,
    () => new THREE.MeshPhysicalMaterial({ color, roughness, metalness, clearcoat, clearcoatRoughness: 0.35 }),
  )

export const M = {
  get shell() {
    return paint('#f5f6f8', 0.32, 0.02, 0.8)
  },
  get shell2() {
    return paint('#dde2e7', 0.45, 0.05, 0.4)
  },
  get dark() {
    return paint('#2a3037', 0.55, 0.15, 0.2)
  },
  get rubber() {
    return paint('#1b1e22', 0.85, 0, 0)
  },
  get steel() {
    return paint('#aeb6bf', 0.3, 0.75, 0)
  },
  get chrome() {
    return paint('#dfe4ea', 0.15, 0.95, 0)
  },
  get glass() {
    return cached(
      'glass-dark',
      () => new THREE.MeshPhysicalMaterial({ color: '#15191e', roughness: 0.08, metalness: 0.2, clearcoat: 1 }),
    )
  },
  get wood() {
    return paint('#c8a06c', 0.85, 0, 0)
  },
  get carton() {
    return paint('#d6b27f', 0.8, 0, 0)
  },
  get tape() {
    return paint('#e9d2a8', 0.6, 0, 0)
  },
  get rackBlue() {
    return paint('#3d5a86', 0.5, 0.35, 0.2)
  },
  get beamOrange() {
    return paint('#e38b3a', 0.45, 0.2, 0.3)
  },
}

/** Emissive material owned by one component, so its glow can pulse independently. */
export function useGlow(color: string, intensity = 1.6) {
  return useMemo(
    () => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 }),
    [color, intensity],
  )
}

/* ---------- textures (generated, nothing is fetched) ---------- */

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

let radial: THREE.Texture | null = null
function radialFade() {
  radial ??= canvasTexture(256, 256, (g) => {
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128)
    grad.addColorStop(0, '#fff')
    grad.addColorStop(0.55, '#bbb')
    grad.addColorStop(1, '#000')
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 256)
  })
  return radial
}

let blob: THREE.Texture | null = null
function blobTexture() {
  blob ??= canvasTexture(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, 'rgba(20,26,34,0.9)')
    grad.addColorStop(0.5, 'rgba(20,26,34,0.45)')
    grad.addColorStop(1, 'rgba(20,26,34,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
  })
  return blob
}

let laneFade: THREE.Texture | null = null
function laneFadeTexture() {
  laneFade ??= canvasTexture(256, 4, (g) => {
    const grad = g.createLinearGradient(0, 0, 256, 0)
    grad.addColorStop(0, '#000')
    grad.addColorStop(0.3, '#fff')
    grad.addColorStop(0.7, '#fff')
    grad.addColorStop(1, '#000')
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 4)
  })
  return laneFade
}

/* ---------- scene furniture ---------- */

/** Soft contact shadow; `opacity` can be driven (a hovering drone fades its shadow). */
export function BlobShadow({
  w,
  d,
  opacity = 0.42,
  y = 0.003,
}: {
  w: number
  d: number
  opacity?: number
  y?: number
}) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} scale={[w, d, 1]} renderOrder={2}>
      <planeGeometry />
      <meshBasicMaterial map={blobTexture()} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  )
}

/** Floor markings that scroll under a robot: the robot stays in frame, the floor shows its speed. */
export function Lane({ drive, length, width }: { drive: RefObject<Drive>; length: number; width: number }) {
  const tile = 2
  const map = useMemo(() => {
    const t = canvasTexture(256, 128, (g) => {
      g.clearRect(0, 0, 256, 128)
      g.fillStyle = 'rgba(150,164,176,0.75)'
      g.fillRect(0, 4, 256, 6)
      g.fillRect(0, 118, 256, 6)
      g.fillStyle = 'rgba(230,172,70,0.9)'
      g.fillRect(0, 60, 128, 8)
    })
    t.wrapS = THREE.RepeatWrapping
    t.repeat.set(length / tile, 1)
    return t
  }, [length])
  useFrame(() => {
    map.offset.x = drive.current.odo / tile
  })
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} renderOrder={1}>
      <planeGeometry args={[length, width]} />
      <meshBasicMaterial map={map} alphaMap={laneFadeTexture()} transparent depthWrite={false} />
    </mesh>
  )
}

/** Wheel rolling along +x; axis is z. */
export function Wheel({
  r,
  w,
  pos,
  drive,
  hub = '#c3cad2',
}: {
  r: number
  w: number
  pos: [number, number, number]
  drive?: RefObject<Drive>
  hub?: string
}) {
  const ref = useRef<THREE.Group>(null)
  useFrame(() => {
    if (ref.current && drive) ref.current.rotation.y = -drive.current.odo / r
  })
  return (
    <group position={pos} rotation={[Math.PI / 2, 0, 0]}>
      <group ref={ref}>
        <mesh material={M.rubber} castShadow>
          <cylinderGeometry args={[r, r, w, 28]} />
        </mesh>
        <mesh material={paint(hub, 0.35, 0.6, 0)} position={[0, w * 0.01, 0]}>
          <cylinderGeometry args={[r * 0.62, r * 0.62, w * 1.04, 6]} />
        </mesh>
        <mesh material={M.dark}>
          <cylinderGeometry args={[r * 0.22, r * 0.22, w * 1.1, 12]} />
        </mesh>
      </group>
    </group>
  )
}

/** Spinning lidar puck with a glowing ring. */
export function Lidar({
  pos,
  r = 0.05,
  color = '#39d0ff',
}: {
  pos: [number, number, number]
  r?: number
  color?: string
}) {
  const top = useRef<THREE.Group>(null)
  const glow = useGlow(color, 2.2)
  useTick((t) => {
    if (top.current) top.current.rotation.y = t * 9
  })
  return (
    <group position={pos}>
      <mesh material={M.dark} position={[0, r * 0.35, 0]}>
        <cylinderGeometry args={[r, r * 1.08, r * 0.7, 24]} />
      </mesh>
      <group ref={top} position={[0, r * 0.95, 0]}>
        <mesh material={M.glass}>
          <cylinderGeometry args={[r * 0.86, r * 0.86, r * 0.55, 24]} />
        </mesh>
        <mesh material={glow} position={[r * 0.8, 0, 0]}>
          <boxGeometry args={[r * 0.14, r * 0.3, r * 0.5]} />
        </mesh>
        <mesh material={M.dark} position={[0, r * 0.34, 0]}>
          <cylinderGeometry args={[r * 0.9, r * 0.9, r * 0.14, 24]} />
        </mesh>
      </group>
    </group>
  )
}

/** Rotating warning beacon. */
export function Beacon({
  pos,
  r = 0.06,
  color = '#ff9a1f',
}: {
  pos: [number, number, number]
  r?: number
  color?: string
}) {
  const spin = useRef<THREE.Group>(null)
  const glow = useGlow(color, 3)
  const cap = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color, transparent: true, opacity: 0.45, roughness: 0.1, transmission: 0 }),
    [color],
  )
  useTick((t) => {
    if (spin.current) spin.current.rotation.y = t * 7
  })
  return (
    <group position={pos}>
      <mesh material={M.dark} position={[0, r * 0.2, 0]}>
        <cylinderGeometry args={[r * 1.1, r * 1.1, r * 0.4, 20]} />
      </mesh>
      <mesh material={cap} position={[0, r * 1.0, 0]}>
        <cylinderGeometry args={[r * 0.9, r, r * 1.3, 20]} />
      </mesh>
      <group ref={spin} position={[0, r, 0]}>
        <mesh material={glow} position={[r * 0.4, 0, 0]}>
          <boxGeometry args={[r * 0.5, r * 0.9, r * 0.2]} />
        </mesh>
      </group>
    </group>
  )
}

/** Thin emissive LED strip with a slow breathing pulse. */
export function LedStrip({
  size,
  pos,
  color,
  rate = 1.4,
}: {
  size: [number, number, number]
  pos: [number, number, number]
  color: string
  rate?: number
}) {
  const glow = useGlow(color, 1.6)
  useTick((t) => {
    glow.emissiveIntensity = 1.1 + 0.9 * (0.5 + 0.5 * Math.sin(t * rate * Math.PI))
  })
  return (
    <mesh material={glow} position={pos}>
      <boxGeometry args={size} />
    </mesh>
  )
}

/** Euro pallet: deck boards, nine blocks, three runners. Height 144 mm. */
export function Pallet({ w = 1.2, d = 0.8 }: { w?: number; d?: number }) {
  const boards = 5
  return (
    <group>
      {Array.from({ length: boards }, (_, i) => (
        <mesh
          key={`t${i}`}
          material={M.wood}
          position={[0, 0.133, -d / 2 + (d / (boards - 1)) * i * 0.92 + d * 0.04]}
          castShadow
        >
          <boxGeometry args={[w, 0.022, d * 0.14]} />
        </mesh>
      ))}
      {[-1, 0, 1].flatMap((ix) =>
        [-1, 0, 1].map((iz) => (
          <mesh key={`b${ix}${iz}`} material={M.wood} position={[ix * (w / 2 - 0.07), 0.072, iz * (d / 2 - 0.05)]}>
            <boxGeometry args={[0.14, 0.1, 0.1]} />
          </mesh>
        )),
      )}
      {[-1, 0, 1].map((iz) => (
        <mesh key={`r${iz}`} material={M.wood} position={[0, 0.011, iz * (d / 2 - 0.05)]}>
          <boxGeometry args={[w, 0.022, 0.1]} />
        </mesh>
      ))}
    </group>
  )
}

const CARTONS = ['#d6b27f', '#cfa56d', '#dcbc8c', '#c99f68']

/** Carton stack filling a w × d footprint up to height h; cartons get a tape stripe. */
export function Cartons({
  w,
  d,
  h,
  cols = 2,
  rows = 2,
}: {
  w: number
  d: number
  h: number
  cols?: number
  rows?: number
}) {
  const layers = Math.max(1, Math.round(h / 0.3))
  const lh = h / layers
  const cw = w / cols
  const cd = d / rows
  const items: ReactNode[] = []
  for (let l = 0; l < layers; l++)
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const k = l * 7 + i * 3 + j
        const x = -w / 2 + cw * (i + 0.5)
        const z = -d / 2 + cd * (j + 0.5)
        const y = lh * (l + 0.5)
        items.push(
          <group key={k} position={[x, y, z]}>
            <mesh material={paint(CARTONS[k % CARTONS.length], 0.82, 0, 0)} castShadow>
              <boxGeometry args={[cw * 0.97, lh * 0.97, cd * 0.97]} />
            </mesh>
            <mesh material={M.tape} position={[0, lh * 0.486, 0]}>
              <boxGeometry args={[cw * 0.975, 0.004, cd * 0.18]} />
            </mesh>
          </group>,
        )
      }
  return <group>{items}</group>
}

/** Translucent 1.75 m figure for scale. */
export function HumanScale({ pos }: { pos: [number, number, number] }) {
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#6f7d8b',
        transparent: true,
        opacity: 0.42,
        roughness: 0.6,
        depthWrite: false,
      }),
    [],
  )
  return (
    <group position={pos} rotation={[0, -0.5, 0]}>
      {[-0.1, 0.1].map((x) => (
        <mesh key={x} material={mat} position={[0, 0.44, x]}>
          <capsuleGeometry args={[0.075, 0.72, 4, 12]} />
        </mesh>
      ))}
      <mesh material={mat} position={[0, 1.18, 0]}>
        <capsuleGeometry args={[0.19, 0.42, 6, 16]} />
      </mesh>
      {[-0.26, 0.26].map((z) => (
        <mesh key={z} material={mat} position={[0, 1.12, z]} rotation={[z > 0 ? -0.08 : 0.08, 0, 0]}>
          <capsuleGeometry args={[0.055, 0.58, 4, 10]} />
        </mesh>
      ))}
      <mesh material={mat} position={[0, 1.63, 0]}>
        <sphereGeometry args={[0.11, 20, 16]} />
      </mesh>
    </group>
  )
}

/* ---------- studio: light, floor, camera fit, turntable ---------- */

export type Bounds = { w: number; h: number; d: number }

const V_FOV = 30

/** Framing: `scale` > 1 leaves room for overlays, `lower` moves the aim down so the robot sits higher in frame. */
export type Framing = { scale?: number; lower?: number }

export function Studio({
  bounds,
  drag,
  framing,
  children,
}: {
  bounds: Bounds
  drag: DragState
  framing?: Framing
  children: ReactNode
}) {
  const human = useGallery((s) => s.human)
  const cam = useRef<THREE.PerspectiveCamera>(null)
  const turn = useRef<THREE.Group>(null)
  const fit = useRef({ dist: 0, ty: 0, t: 0 })
  const humanPos: [number, number, number] = [-bounds.w * 0.18, 0, bounds.d / 2 + 0.55]
  const rH = Math.max(Math.hypot(bounds.w, bounds.d) / 2, human ? Math.hypot(humanPos[0], humanPos[2]) + 0.3 : 0)
  const h = Math.max(bounds.h, human ? 1.8 : 0)
  const floorR = Math.max(rH * 2.4, h * 1.2, 3)

  useFrame((_, delta) => {
    const c = cam.current
    if (!c) return
    const phi = 0.3
    const tanV = Math.tan(((V_FOV / 2) * Math.PI) / 180)
    const tanH = tanV * c.aspect
    const vReq = (h * Math.cos(phi) + 2 * rH * Math.sin(phi)) / (2 * tanV * 0.84)
    const hReq = rH / (tanH * 0.86)
    const goal = (Math.max(vReq, hReq) + rH * 0.55) * (framing?.scale ?? 1)
    const ty = h * (0.46 - (framing?.lower ?? 0))
    const f = fit.current
    const k = f.dist === 0 ? 1 : Math.min(1, delta * 4)
    f.dist += (goal - f.dist) * k
    f.ty += (ty - f.ty) * k
    c.position.set(0, f.ty + f.dist * Math.sin(phi), f.dist * Math.cos(phi))
    c.near = Math.max(0.05, f.dist / 100)
    c.far = f.dist * 10 + floorR * 2
    c.lookAt(0, f.ty, 0)
    c.updateProjectionMatrix()
    if (!useGallery.getState().paused) f.t += Math.min(delta, 0.05)
    if (turn.current) turn.current.rotation.y = -0.62 + Math.sin(f.t * 0.18) * 0.38 + drag.yaw
  })

  return (
    <>
      <PerspectiveCamera ref={cam} makeDefault fov={V_FOV} />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#ffffff', '#c9d2da', 0.9]} />
      <directionalLight position={[4, 8, 5]} intensity={1.9} />
      <directionalLight position={[-6, 3, -4]} intensity={0.6} color="#dbe8ff" />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.2} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[-6, 2, 3]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer form="rect" intensity={1.1} position={[6, 2, -2]} rotation-y={-Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer form="ring" intensity={0.8} color="#cfe0ff" position={[0, 3, -8]} scale={4} />
      </Environment>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[floorR, 64]} />
        <meshStandardMaterial color="#e3e8ec" roughness={0.9} alphaMap={radialFade()} transparent depthWrite={false} />
      </mesh>
      <group ref={turn}>
        {children}
        {human && <HumanScale pos={humanPos} />}
      </group>
    </>
  )
}

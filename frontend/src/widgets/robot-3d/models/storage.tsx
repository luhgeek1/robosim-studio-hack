import { RoundedBox } from '@react-three/drei'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Beacon, BlobShadow, LedStrip, Lidar, M, Wheel, paint, seg, useDrive, useGlow, useTick } from '../kit'
import { mm, type ModelProps, type Variant } from '../types'

type G = THREE.Group
type V3 = [number, number, number]
export type InstBox = { p: V3; s: V3; c?: string }

const hash = (a: number, b: number, c: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453
  return x - Math.floor(x)
}

/** Many boxes in one draw call; `hidden` indices collapse to nothing (a slot the animated load stands in for). */
export function InstBoxes({
  boxes,
  material,
  hidden,
}: {
  boxes: InstBox[]
  material: THREE.Material
  hidden?: number[]
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const col = new THREE.Color()
    boxes.forEach((b, i) => {
      const gone = hidden?.includes(i)
      m.compose(new THREE.Vector3(...b.p), q, new THREE.Vector3(...(gone ? ([0, 0, 0] as V3) : b.s)))
      mesh.setMatrixAt(i, m)
      if (b.c) mesh.setColorAt(i, col.set(b.c))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [boxes, hidden])
  return (
    <instancedMesh key={boxes.length} ref={ref} args={[undefined, undefined, boxes.length]} material={material}>
      <boxGeometry />
    </instancedMesh>
  )
}

/* ---------- AS/RS: stacker crane between two rack rows ---------- */

type Key = { d: number; x?: number; y?: number; f?: number; at?: 'io' | 'slot' | 'fork' }
type CraneState = { x: number; y: number; f: number; at: 'io' | 'slot' | 'fork' }

function play(keys: Key[], p: number, init: CraneState): CraneState {
  const s = { ...init }
  let t0 = 0
  for (const k of keys) {
    if (p < t0) break
    const u = seg(p, t0, t0 + k.d)
    if (k.x !== undefined) s.x += (k.x - s.x) * u
    if (k.y !== undefined) s.y += (k.y - s.y) * u
    if (k.f !== undefined) s.f += (k.f - s.f) * u
    if (k.at && p >= t0 + k.d) s.at = k.at
    t0 += k.d
  }
  return s
}
const total = (keys: Key[]) => keys.reduce((a, k) => a + k.d, 0)

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

export function Asrs({ v, accent }: ModelProps) {
  const { pitch, shown: levels, bays, bayW, depth, aisle, x0, length, visH } = asrsLayout(v)
  const sideZ = aisle / 2 + depth / 2
  const rackZ = -sideZ
  const ioZ = sideZ
  const bayX = (b: number) => x0 + bayW * (b + 1.5)
  const levelY = (l: number) => 0.3 + l * pitch
  const load: V3 = [0.8, pitch - 0.4, 1.2]
  const base = 0.14

  const { cargo, pallets, frame } = useMemo(() => {
    const cargo: InstBox[] = []
    const pallets: InstBox[] = []
    const frame: InstBox[] = []
    for (let b = 0; b < bays; b++)
      for (let l = 0; l < levels; l++) {
        const full = hash(0, b, l) > 0.2
        const h = full ? load[1] * (0.75 + 0.25 * hash(b, l, 0)) : 0
        const c = ['#d6b27f', '#cfa56d', '#dcbc8c', '#c7d3dc'][Math.floor(hash(l, 0, b) * 4)]
        cargo.push({ p: [bayX(b), levelY(l) + base + h / 2, rackZ], s: full ? [load[0], h, load[2]] : [0, 0, 0], c })
        pallets.push({ p: [bayX(b), levelY(l) + 0.07, rackZ], s: full ? [0.8, 0.14, 1.2] : [0, 0, 0] })
      }
    for (let b = 0; b <= bays; b++)
      for (const dz of [-depth / 2, depth / 2])
        frame.push({ p: [x0 + bayW * (b + 1), visH / 2, rackZ + dz], s: [0.08, visH, 0.08], c: '#3d5a86' })
    for (let l = 0; l < levels; l++)
      for (const dz of [-depth / 2, depth / 2])
        frame.push({
          p: [x0 + bayW * (1 + bays / 2), levelY(l) - 0.04, rackZ + dz],
          s: [bayW * bays, 0.08, 0.05],
          c: '#e38b3a',
        })
    return { cargo, pallets, frame }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bays, levels, depth, visH, bayW, x0, pitch])

  const [pair, setPair] = useState(0)
  const target = useMemo(() => {
    const b = Math.floor(hash(pair, 1, 2) * bays)
    const l = Math.floor(hash(pair, 3, 4) * levels)
    return { b, l, idx: b * levels + l }
  }, [pair, bays, levels])

  const ioX = x0 + bayW * 0.5
  const tx = bayX(target.b)
  const ty = levelY(target.l)
  const travel = 1.2 + Math.max(Math.abs(tx - ioX) / 3, ty / 1.2)
  const store: Key[] = [
    { d: 0.6 },
    { d: 0.8, f: 1 },
    { d: 0.4, y: 0.3 + 0.12, at: 'fork' },
    { d: 0.8, f: 0 },
    { d: travel, x: tx, y: ty + 0.12 },
    { d: 0.8, f: -1 },
    { d: 0.4, y: ty, at: 'slot' },
    { d: 0.8, f: 0 },
    { d: travel, x: ioX, y: 0.3 },
    { d: 0.6 },
  ]
  const retrieve: Key[] = [
    { d: 0.6 },
    { d: travel, x: tx, y: ty },
    { d: 0.8, f: -1 },
    { d: 0.4, y: ty + 0.12, at: 'fork' },
    { d: 0.8, f: 0 },
    { d: travel, x: ioX, y: 0.3 + 0.12 },
    { d: 0.8, f: 1 },
    { d: 0.4, y: 0.3, at: 'io' },
    { d: 0.8, f: 0 },
    { d: 0.6 },
  ]
  const Ts = total(store)
  const Tr = total(retrieve)

  const crane = useRef<G>(null)
  const lifter = useRef<G>(null)
  const forks = useRef<G>(null)
  const cable = useRef<THREE.Mesh>(null)
  const moving = useRef<G>(null)
  const clock = useRef({ start: 0, pair: 0 })
  const mastTop = visH + 0.25
  useTick((t) => {
    const ck = clock.current
    let p = t - ck.start
    if (p > Ts + Tr) {
      ck.start = t
      ck.pair += 1
      setPair(ck.pair)
      p = 0
    }
    const init: CraneState = { x: ioX, y: 0.3, f: 0, at: p < Ts ? 'io' : 'slot' }
    const s = p < Ts ? play(store, p, init) : play(retrieve, p - Ts, init)
    if (crane.current) crane.current.position.x = s.x
    if (lifter.current) lifter.current.position.y = s.y
    if (forks.current) forks.current.position.z = s.f * sideZ
    if (cable.current) {
      const len = mastTop - 0.2 - (s.y + 0.2)
      cable.current.scale.y = Math.max(0.01, len)
      cable.current.position.y = s.y + 0.2 + len / 2
    }
    const m = moving.current
    if (!m) return
    if (s.at === 'fork') m.position.set(s.x, s.y + base, s.f * sideZ)
    else if (s.at === 'slot') m.position.set(tx, ty + base, rackZ)
    else m.position.set(ioX, 0.3 + base, ioZ)
  })

  const cargoMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.8 }), [])
  const frameMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.3 }), [])
  const accentMat = paint(accent, 0.32, 0.2, 0.7)
  const trussMat = paint(accent, 0.4, 0.3, 0.4)
  const carW = 1.3
  const braces = Math.max(3, Math.round(visH / 0.9))
  const braceH = (visH - 0.4) / braces
  return (
    <group>
      <BlobShadow w={length * 1.05} d={(aisle + depth * 2) * 1.2} opacity={0.3} />
      <InstBoxes boxes={frame} material={frameMat} />
      <InstBoxes boxes={cargo} material={cargoMat} hidden={[target.idx]} />
      <InstBoxes boxes={pallets} material={M.wood} hidden={[target.idx]} />
      <mesh material={M.steel} position={[0, 0.04, 0]}>
        <boxGeometry args={[length + 0.6, 0.08, 0.16]} />
      </mesh>
      <mesh material={M.dark} position={[0, 0.005, 0]}>
        <boxGeometry args={[length + 0.8, 0.01, 0.5]} />
      </mesh>
      <mesh material={M.steel} position={[0, mastTop + 0.1, 0]}>
        <boxGeometry args={[length + 0.6, 0.1, 0.12]} />
      </mesh>
      {/* Pick-up / drop-off station on the open side of the aisle. */}
      <group position={[ioX, 0, ioZ]}>
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <mesh key={`${sx}${sz}`} material={M.steel} position={[sx * bayW * 0.36, 0.14, sz * depth * 0.42]}>
              <boxGeometry args={[0.05, 0.28, 0.05]} />
            </mesh>
          )),
        )}
        {Array.from({ length: 6 }, (_, i) => (
          <mesh
            key={i}
            material={M.chrome}
            position={[0, 0.27, -depth * 0.45 + (depth * 0.9 * i) / 5]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.03, 0.03, bayW * 0.75, 12]} />
          </mesh>
        ))}
        {[-1, 1].map((s) => (
          <mesh key={s} material={accentMat} position={[s * bayW * 0.4, 0.27, 0]}>
            <boxGeometry args={[0.04, 0.08, depth]} />
          </mesh>
        ))}
        <LedStrip size={[bayW * 0.8, 0.03, 0.02]} pos={[0, 0.2, depth / 2 + 0.02]} color="#6be39a" />
      </group>
      <group ref={crane} position={[ioX, 0, 0]}>
        <RoundedBox
          args={[1.7, 0.42, 0.62]}
          radius={0.08}
          smoothness={4}
          position={[0.1, 0.3, 0]}
          material={accentMat}
        />
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh material={M.dark} position={[0.1 + s * 0.88, 0.25, 0]}>
              <boxGeometry args={[0.08, 0.2, 0.4]} />
            </mesh>
            <mesh material={M.rubber} position={[0.1 + s * 0.55, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.12, 0.12, 0.2, 20]} />
            </mesh>
          </group>
        ))}
        <RoundedBox
          args={[0.46, 1.2, 0.5]}
          radius={0.05}
          smoothness={3}
          position={[-0.52, 1.1, 0]}
          material={M.shell}
        />
        <mesh material={M.glass} position={[-0.52, 1.35, 0.252]}>
          <boxGeometry args={[0.3, 0.24, 0.006]} />
        </mesh>
        <LedStrip size={[0.3, 0.03, 0.006]} pos={[-0.52, 1.12, 0.253]} color="#6be39a" rate={2} />
        {[-1, 1].map((s) => (
          <mesh key={s} material={trussMat} position={[0.3, (mastTop + 0.5) / 2, s * 0.22]}>
            <boxGeometry args={[0.12, mastTop - 0.5, 0.1]} />
          </mesh>
        ))}
        {Array.from({ length: braces + 1 }, (_, i) => (
          <mesh key={`h${i}`} material={trussMat} position={[0.3, 0.5 + i * braceH, 0]}>
            <boxGeometry args={[0.08, 0.05, 0.44]} />
          </mesh>
        ))}
        {Array.from({ length: braces }, (_, i) => (
          <mesh
            key={`d${i}`}
            material={M.steel}
            position={[0.3, 0.5 + (i + 0.5) * braceH, 0]}
            rotation={[(i % 2 ? 1 : -1) * Math.atan2(0.44, braceH), 0, 0]}
          >
            <boxGeometry args={[0.04, Math.hypot(braceH, 0.44), 0.03]} />
          </mesh>
        ))}
        <RoundedBox
          args={[0.9, 0.26, 0.5]}
          radius={0.05}
          smoothness={3}
          position={[0.3, mastTop - 0.05, 0]}
          material={accentMat}
        />
        <Beacon pos={[0.6, mastTop + 0.08, 0]} r={0.06} />
        <mesh ref={cable} material={M.dark} position={[0.18, 1, 0]}>
          <boxGeometry args={[0.02, 1, 0.02]} />
        </mesh>
        <group ref={lifter} position={[0, 0.3, 0]}>
          <RoundedBox
            args={[carW, 0.16, aisle * 0.82]}
            radius={0.04}
            smoothness={3}
            position={[-0.02, -0.1, 0]}
            material={M.dark}
          />
          <RoundedBox
            args={[0.3, 0.5, aisle * 0.6]}
            radius={0.05}
            smoothness={3}
            position={[0.3, 0.14, 0]}
            material={accentMat}
          />
          <LedStrip size={[0.006, 0.03, aisle * 0.5]} pos={[0.45 + 0.004, 0.2, 0]} color="#e9f6ff" rate={2} />
          <group ref={forks}>
            {[-0.25, 0.25].map((fx) => (
              <mesh key={fx} material={M.chrome} position={[fx - 0.05, -0.012, 0]}>
                <boxGeometry args={[0.16, 0.035, depth * 0.95]} />
              </mesh>
            ))}
          </group>
        </group>
      </group>
      <group ref={moving}>
        <mesh material={M.wood} position={[0, -0.07, 0]}>
          <boxGeometry args={[0.8, 0.14, 1.2]} />
        </mesh>
        <mesh material={paint('#8fc3a0', 0.5, 0, 0.3)} position={[0, load[1] * 0.45, 0]}>
          <boxGeometry args={[load[0], load[1] * 0.9, load[2]]} />
        </mesh>
      </group>
    </group>
  )
}

/* ---------- Cube storage: robots on a top grid dig bins out of stacks ---------- */

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

function CubeBot({ accent }: { accent: string }) {
  return (
    <group>
      <RoundedBox
        args={[0.64, 0.5, 0.46]}
        radius={0.05}
        smoothness={3}
        position={[0, 0.27, 0]}
        material={paint(accent, 0.35, 0.1, 0.7)}
      />
      <RoundedBox args={[0.6, 0.05, 0.42]} radius={0.02} smoothness={2} position={[0, 0.53, 0]} material={M.shell} />
      <LedStrip size={[0.004, 0.04, 0.3]} pos={[0.322, 0.4, 0]} color="#e9f6ff" rate={1.8} />
      <LedStrip size={[0.004, 0.04, 0.3]} pos={[-0.322, 0.4, 0]} color="#e9f6ff" rate={1.8} />
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`${sx}${sz}`}
            material={M.rubber}
            position={[sx * 0.24, 0.04, sz * 0.2]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[0.045, 0.045, 0.04, 14]} />
          </mesh>
        )),
      )}
    </group>
  )
}

export function Cube({ v, accent }: ModelProps) {
  const { nx, nz, cx, cz, binH, layers, gridH } = cubeLayout(v)
  const colX = (i: number) => (i - (nx - 1) / 2) * cx
  const colZ = (j: number) => (j - (nz - 1) / 2) * cz
  const A = { i: 2, j: 0 }
  const B = { i: 2, j: 3 }
  const bins = useMemo(() => {
    const out: InstBox[] = []
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++)
        for (let l = 0; l < layers; l++)
          out.push({
            p: [(i - (nx - 1) / 2) * cx, l * binH + binH / 2 + 0.02, (j - (nz - 1) / 2) * cz],
            s: [cx * 0.88, binH * 0.92, cz * 0.86],
            c: ['#3f6fc9', '#2f5aa8', '#4a7bd6', '#f2b441'][Math.floor(hash(i, j, l) * 3.3)],
          })
    return out
  }, [nx, nz, layers, binH, cx, cz])
  const idx = (i: number, j: number, l: number) => (i * nz + j) * layers + l
  const frame = useMemo(() => {
    const out: InstBox[] = []
    for (let i = 0; i <= nx; i++)
      for (let j = 0; j <= nz; j++)
        out.push({ p: [(i - nx / 2) * cx, gridH / 2, (j - nz / 2) * cz], s: [0.03, gridH, 0.03], c: '#c9d1d9' })
    for (let i = 0; i <= nx; i++) out.push({ p: [(i - nx / 2) * cx, gridH, 0], s: [0.05, 0.04, nz * cz], c: '#aeb8c2' })
    for (let j = 0; j <= nz; j++) out.push({ p: [0, gridH, (j - nz / 2) * cz], s: [nx * cx, 0.04, 0.05], c: '#aeb8c2' })
    return out
  }, [nx, nz, cx, cz, gridH])

  const botA = useRef<G>(null)
  const botB = useRef<G>(null)
  const grip = useRef<G>(null)
  const cables = useRef<THREE.Mesh>(null)
  const bin = useRef<G>(null)
  const T = 9
  const topY = gridH + 0.02
  const binTopY = (layers - 1) * binH + binH / 2 + 0.02
  useTick((t) => {
    const k = Math.floor(t / T)
    const p = t % T
    const fwd = k % 2 === 0
    const from = fwd ? A : B
    const to = fwd ? B : A
    const move = seg(p, 3.0, 5.0)
    const z = colZ(from.j) + (colZ(to.j) - colZ(from.j)) * move
    // Gripper drops into the column, lifts the bin into the robot, then lowers it into the other column.
    const down = seg(p, 0.3, 1.2) - seg(p, 1.5, 2.5) + seg(p, 5.3, 6.2) - seg(p, 6.5, 7.4)
    const up = 0.3
    const depth = topY + up - (binTopY + binH / 2)
    const gy = up - down * depth
    if (botB.current) botB.current.position.set(colX(A.i), topY, z)
    if (grip.current) grip.current.position.y = gy
    if (cables.current) {
      const len = Math.max(0.01, 0.35 - gy)
      cables.current.scale.y = len
      cables.current.position.y = gy + len / 2
    }
    const carried = p >= 1.2 && p < 6.2
    if (bin.current) {
      const yInBot = topY + gy - binH / 2
      if (carried) bin.current.position.set(colX(A.i), yInBot, z)
      else bin.current.position.set(colX(A.i), binTopY, p < 1.2 ? colZ(from.j) : colZ(to.j))
    }
    const ax = seg(p, 0.5, 3.5) - seg(p, 5.0, 8.0)
    if (botA.current) botA.current.position.set(colX(0) + (colX(nx - 1) - colX(0)) * ax, topY, colZ(nz - 1))
  })
  const binMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.45 }), [])
  const frameMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.5 }), [])
  return (
    <group>
      <BlobShadow w={nx * cx * 1.2} d={nz * cz * 1.3} opacity={0.35} />
      <InstBoxes boxes={bins} material={binMat} hidden={[idx(A.i, A.j, layers - 1), idx(B.i, B.j, layers - 1)]} />
      <InstBoxes boxes={frame} material={frameMat} />
      <group ref={bin}>
        <mesh material={paint('#f2b441', 0.45, 0, 0.3)}>
          <boxGeometry args={[cx * 0.88, binH * 0.92, cz * 0.86]} />
        </mesh>
      </group>
      <group ref={botB}>
        <CubeBot accent={accent} />
        <group ref={grip}>
          <mesh material={M.dark}>
            <boxGeometry args={[cx * 0.84, 0.04, cz * 0.8]} />
          </mesh>
        </group>
        <mesh ref={cables} material={M.steel}>
          <boxGeometry args={[0.012, 1, 0.012]} />
        </mesh>
      </group>
      <group ref={botA}>
        <CubeBot accent="#5aa36b" />
      </group>
    </group>
  )
}

/* ---------- Inventory robot: drives along a rack, raises the camera head to each label, marks it counted ---------- */
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

type Stop = { col: number; row: number; x: number; y: number; start: number; arrive: number; done: number }

export function Inventory({ v, accent }: ModelProps) {
  const { rows, cols, pitchX, pitchY, rackZ, rackH, width } = inventoryLayout(v)
  const [L, W] = mm(v.spec.dims_mm, [870, 670, 420])
  const speed = v.spec.speed_mps ?? 0.8
  const robotZ = 0.95
  const mastX = -L * 0.2
  const mastZ = -W * 0.15
  const colX = (c: number) => (c - (cols - 1) / 2) * pitchX
  const rowY = (r: number) => 0.62 + r * pitchY
  // Serpentine: the robot drives only between columns, the head climbs and descends within one.
  const plan = useMemo(() => {
    const stops: Stop[] = []
    let t = 0.4
    for (let c = 0; c < cols; c++)
      for (let k = 0; k < rows; k++) {
        const row = c % 2 ? rows - 1 - k : k
        const move = k === 0 && c > 0 ? Math.max(0.9, (pitchX * 1.5) / speed) : 0.7
        stops.push({
          col: c,
          row,
          x: (c - (cols - 1) / 2) * pitchX,
          y: 0.62 + row * pitchY,
          start: t,
          arrive: t + move,
          done: t + move + 1.3,
        })
        t += move + 1.3 + 0.25
      }
    return { stops, T: t + 2.2 }
  }, [rows, cols, pitchX, pitchY, speed])

  const robot = useRef<G>(null)
  const head = useRef<G>(null)
  const beam = useRef<G>(null)
  const line = useRef<THREE.Mesh>(null)
  const fill = useRef<THREE.Mesh>(null)
  const boxes = useRef<(THREE.Mesh | null)[]>([])
  const dots = useRef<(THREE.Mesh | null)[]>([])
  const ticks = useRef<(G | null)[]>([])
  const phaseDots = useRef<(THREE.Mesh | null)[]>([])
  const drive = useDrive()
  const idle = useMemo(() => new THREE.MeshBasicMaterial({ color: '#a5957f' }), [])
  const active = useGlow('#29d9e6', 2.2)
  const okGlow = useGlow('#22b67a', 1.6)
  const headlight = useGlow('#fff6e0', 1.8)
  const carton = paint('#cfb48e', 0.8, 0, 0)
  const counted = paint('#a9c9b6', 0.7, 0, 0.2)
  const beamMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#24cee7',
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [],
  )
  const lineMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#00e5f5', toneMapped: false }), [])
  const dim = useMemo(() => new THREE.MeshBasicMaterial({ color: '#d6dde2' }), [])
  const idx = (c: number, r: number) => c * rows + r

  useTick((t) => {
    const { stops, T } = plan
    const p = t % T
    let k = 0
    while (k + 1 < stops.length && stops[k + 1].start <= p) k++
    const cur = stops[k]
    const last = stops[stops.length - 1]
    const resetting = p > last.done + 0.6
    const prev = resetting ? last : k === 0 ? stops[0] : stops[k - 1]
    const target = resetting ? stops[0] : cur
    const u = resetting ? seg(p, last.done + 0.6, T - 0.2) : seg(p, cur.start, cur.arrive)
    const x = prev.x + (target.x - prev.x) * u
    const y = prev.y + (target.y - prev.y) * u
    drive.current.odo = x
    if (robot.current) robot.current.position.x = x
    if (head.current) head.current.position.set(x, y, robotZ)
    const scanning = !resetting && p >= cur.arrive && p < cur.done
    if (beam.current) {
      beam.current.visible = scanning
      beam.current.position.set(x + mastX, y, 0)
    }
    if (line.current) line.current.position.y = Math.sin((p - cur.arrive) * 5) * 0.095
    let doneCount = 0
    stops.forEach((st, i) => {
      const checked = !resetting && p >= st.done
      if (checked) doneCount++
      const cell = idx(st.col, st.row)
      const box = boxes.current[cell]
      if (box) box.material = checked ? counted : carton
      const dot = dots.current[cell]
      if (dot) dot.material = checked ? okGlow : scanning && i === k ? active : idle
      const tick = ticks.current[cell]
      if (tick) tick.visible = checked
    })
    const frac = resetting ? 1 - u : doneCount / stops.length
    if (fill.current) {
      fill.current.scale.x = Math.max(0.001, frac)
      fill.current.position.x = -0.6 + 0.6 * frac
    }
    const phase = resetting || doneCount === stops.length ? 2 : scanning ? 1 : 0
    phaseDots.current.forEach((m, i) => {
      if (m) m.material = i === phase ? (i === 2 ? okGlow : active) : dim
    })
  })

  const bars = Array.from({ length: 13 }, (_, b) => b)
  return (
    <group position={[0, 0, -0.1]}>
      <BlobShadow w={width + 0.4} d={1.2} opacity={0.25} />
      {[-width / 2, width / 2].flatMap((x) =>
        [rackZ - 0.3, rackZ + 0.3].map((z) => (
          <mesh key={`${x}${z}`} material={M.rackBlue} position={[x, rackH / 2, z]}>
            <boxGeometry args={[0.07, rackH, 0.07]} />
          </mesh>
        )),
      )}
      {Array.from({ length: rows }, (_, r) => (
        <mesh key={r} material={M.shell2} position={[0, rowY(r) - 0.21, rackZ]}>
          <boxGeometry args={[width, 0.05, 0.72]} />
        </mesh>
      ))}
      {Array.from({ length: cols }, (_, c) =>
        Array.from({ length: rows }, (_, r) => (
          <group key={`${c}-${r}`} position={[colX(c), rowY(r), rackZ]}>
            <mesh
              ref={(m) => {
                boxes.current[idx(c, r)] = m
              }}
              material={carton}
            >
              <boxGeometry args={[0.8, 0.36, 0.52]} />
            </mesh>
            <mesh material={M.tape}>
              <boxGeometry args={[0.1, 0.365, 0.525]} />
            </mesh>
            <mesh material={paint('#fffaf0', 0.6, 0, 0)} position={[0, 0, 0.265]}>
              <boxGeometry args={[0.34, 0.19, 0.01]} />
            </mesh>
            {bars.map((b) => (
              <mesh key={b} material={M.dark} position={[-0.13 + b * 0.021, 0, 0.272]}>
                <boxGeometry args={[b % 3 === 0 ? 0.014 : 0.007, 0.12, 0.004]} />
              </mesh>
            ))}
            <mesh
              ref={(m) => {
                dots.current[idx(c, r)] = m
              }}
              material={idle}
              position={[0.3, 0.095, 0.272]}
            >
              <circleGeometry args={[0.045, 20]} />
            </mesh>
            <group
              ref={(g) => {
                ticks.current[idx(c, r)] = g
              }}
              position={[0.3, -0.06, 0.28]}
              visible={false}
            >
              <mesh material={okGlow} position={[-0.018, -0.008, 0]} rotation={[0, 0, 0.8]}>
                <boxGeometry args={[0.045, 0.016, 0.006]} />
              </mesh>
              <mesh material={okGlow} position={[0.02, 0.012, 0]} rotation={[0, 0, -0.9]}>
                <boxGeometry args={[0.08, 0.016, 0.006]} />
              </mesh>
            </group>
          </group>
        )),
      )}
      {/* Progress board: counted share of the rack and the current phase (approach · scan · counted). */}
      <group position={[0, rackH + 0.32, rackZ]}>
        <RoundedBox args={[1.5, 0.36, 0.05]} radius={0.04} smoothness={3} material={M.shell} />
        <mesh material={dim} position={[0, -0.06, 0.028]}>
          <boxGeometry args={[1.2, 0.05, 0.004]} />
        </mesh>
        <mesh ref={fill} material={okGlow} position={[-0.6, -0.06, 0.031]}>
          <boxGeometry args={[1.2, 0.05, 0.004]} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh
            key={i}
            ref={(m) => {
              phaseDots.current[i] = m
            }}
            material={dim}
            position={[-0.12 + i * 0.12, 0.08, 0.028]}
          >
            <circleGeometry args={[0.035, 18]} />
          </mesh>
        ))}
      </group>
      <group ref={robot} position={[colX(0), 0, robotZ]}>
        <BlobShadow w={L * 1.3} d={W * 1.3} />
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <Wheel
              key={`${sx}${sz}`}
              r={0.11}
              w={0.08}
              pos={[sx * L * 0.34, 0.11, sz * (W / 2 - 0.07)]}
              drive={drive}
            />
          )),
        )}
        <RoundedBox args={[L, 0.2, W]} radius={0.06} smoothness={4} position={[0, 0.17, 0]} material={M.dark} />
        <RoundedBox
          args={[L * 0.97, 0.06, W * 0.97]}
          radius={0.025}
          smoothness={3}
          position={[0, 0.28, 0]}
          material={paint(accent, 0.35, 0.1, 0.7)}
        />
        <RoundedBox
          args={[L * 0.95, 0.22, W * 0.93]}
          radius={0.08}
          smoothness={5}
          position={[0, 0.41, 0]}
          material={M.shell}
        />
        {/* Viewer side: status screen with a progress strip. */}
        <RoundedBox
          args={[L * 0.44, 0.13, 0.012]}
          radius={0.005}
          smoothness={2}
          position={[L * 0.14, 0.41, W * 0.465 + 0.006]}
          material={M.glass}
        />
        <LedStrip
          size={[L * 0.34, 0.018, 0.004]}
          pos={[L * 0.14, 0.38, W * 0.465 + 0.014]}
          color="#22b67a"
          rate={1.2}
        />
        <mesh material={active} position={[L * 0.14 - L * 0.17, 0.44, W * 0.465 + 0.014]}>
          <circleGeometry args={[0.014, 14]} />
        </mesh>
        {/* Drive direction: sensor band, headlights and bumper. */}
        <RoundedBox
          args={[0.014, 0.07, W * 0.62]}
          radius={0.005}
          smoothness={2}
          position={[L * 0.475 + 0.004, 0.43, 0]}
          material={M.glass}
        />
        {[-1, 1].map((sz) => (
          <mesh
            key={sz}
            material={headlight}
            position={[L * 0.475 + 0.012, 0.43, sz * W * 0.22]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.022, 0.022, 0.008, 18]} />
          </mesh>
        ))}
        {[-1, 1].map((sx) => (
          <RoundedBox
            key={sx}
            args={[0.05, 0.08, W * 0.9]}
            radius={0.02}
            smoothness={2}
            position={[sx * (L / 2 + 0.01), 0.16, 0]}
            material={M.rubber}
          />
        ))}
        <Lidar pos={[L * 0.3, 0.52, W * 0.18]} r={0.06} />
        <group position={[mastX, 0, mastZ]}>
          <RoundedBox
            args={[0.24, 0.1, 0.24]}
            radius={0.03}
            smoothness={3}
            position={[0, 0.56, 0]}
            material={paint(accent, 0.35, 0.1, 0.7)}
          />
          <RoundedBox
            args={[0.13, rackH - 0.5, 0.13]}
            radius={0.04}
            smoothness={3}
            position={[0, 0.5 + (rackH - 0.5) / 2, 0]}
            material={M.shell}
          />
          <mesh material={M.dark} position={[0, 0.5 + (rackH - 0.5) / 2, -0.068]}>
            <boxGeometry args={[0.03, rackH - 0.6, 0.012]} />
          </mesh>
          <mesh material={okGlow} position={[0, rackH + 0.02, 0]}>
            <sphereGeometry args={[0.035, 16, 12]} />
          </mesh>
        </group>
      </group>
      <group ref={head} position={[colX(0), rowY(0), robotZ]}>
        <group position={[mastX, 0, mastZ]}>
          <RoundedBox args={[0.24, 0.2, 0.24]} radius={0.06} smoothness={4} material={M.shell} />
          <mesh material={paint(accent, 0.35, 0.1, 0.7)}>
            <boxGeometry args={[0.245, 0.04, 0.245]} />
          </mesh>
          <mesh material={active} position={[0, 0.06, 0.121]}>
            <circleGeometry args={[0.018, 14]} />
          </mesh>
          <group position={[0, 0, -0.16]}>
            <RoundedBox
              args={[0.4, 0.17, 0.12]}
              radius={0.04}
              smoothness={3}
              material={paint(accent, 0.35, 0.1, 0.7)}
            />
            <mesh material={M.glass} position={[0, 0, -0.061]}>
              <boxGeometry args={[0.34, 0.13, 0.006]} />
            </mesh>
            {[-0.1, 0.1].map((x) => (
              <mesh key={x} material={active} position={[x, 0, -0.07]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.045, 0.045, 0.014, 24]} />
              </mesh>
            ))}
            <mesh material={headlight} position={[0, 0, -0.07]}>
              <boxGeometry args={[0.05, 0.05, 0.01]} />
            </mesh>
          </group>
        </group>
      </group>
      <group ref={beam} visible={false}>
        <mesh material={beamMat} position={[0, 0, (robotZ - 0.3 + rackZ + 0.27) / 2]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.2, robotZ - 0.3 - (rackZ + 0.27), 4, 1, true]} />
        </mesh>
        <mesh ref={line} material={lineMat} position={[0, 0, rackZ + 0.285]}>
          <boxGeometry args={[0.43, 0.012, 0.008]} />
        </mesh>
      </group>
    </group>
  )
}

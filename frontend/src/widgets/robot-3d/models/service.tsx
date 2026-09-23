import { RoundedBox } from '@react-three/drei'
import { useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import {
  Beacon,
  BlobShadow,
  Lane,
  LedStrip,
  Lidar,
  M,
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

/** Spots on the floor ahead of a cleaner: they scroll with the lane and vanish under the robot. */
function Debris({
  drive,
  front,
  span,
  halfW,
  color,
  size,
  count = 7,
  leaves = false,
}: {
  drive: RefObject<Drive>
  front: number
  span: number
  halfW: number
  color: string
  size: number
  count?: number
  leaves?: boolean
}) {
  const refs = useRef<(THREE.Mesh | null)[]>([])
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        z: (((i * 0.618) % 1) * 2 - 1) * halfW,
        s: 0.6 + ((i * 0.37) % 0.8),
        r: i * 1.3,
      })),
    [count, halfW],
  )
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.9, transparent: true, opacity: 0.85, depthWrite: false }),
    [color],
  )
  useTick(() => {
    refs.current.forEach((m, i) => {
      if (!m) return
      const u = ((((i * span) / count - drive.current.odo) % span) + span) % span
      m.position.x = front + u
      m.scale.setScalar(size * seeds[i].s * Math.min(1, u / 0.05, (span - u) / (span * 0.2)))
    })
  })
  return (
    <group>
      {seeds.map((sd, i) => (
        <mesh
          key={i}
          ref={(m) => {
            refs.current[i] = m
          }}
          material={mat}
          rotation={[-Math.PI / 2, 0, sd.r]}
          position={[front, leaves ? 0.006 : 0.004, sd.z]}
          renderOrder={3}
        >
          {leaves ? <circleGeometry args={[0.5, 5]} /> : <circleGeometry args={[0.5, 18]} />}
        </mesh>
      ))}
    </group>
  )
}

/** Rotating side brush: dark disc with bristle tufts. */
function Brush({
  r,
  pos,
  dir = 1,
  tilt = 0,
}: {
  r: number
  pos: [number, number, number]
  dir?: number
  tilt?: number
}) {
  const ref = useRef<G>(null)
  useTick((t) => {
    if (ref.current) ref.current.rotation.y = t * 9 * dir
  })
  return (
    <group position={pos} rotation={[tilt, 0, 0]}>
      <group ref={ref}>
        <mesh material={M.dark}>
          <cylinderGeometry args={[r * 0.35, r * 0.35, 0.03, 20]} />
        </mesh>
        {Array.from({ length: 10 }, (_, i) => (
          <mesh
            key={i}
            material={paint('#3a3f45', 0.9, 0, 0)}
            rotation={[0, (i / 10) * Math.PI * 2, 0.12]}
            position={[0, -0.01, 0]}
          >
            <boxGeometry args={[r * 2, 0.012, 0.018]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** Battery gauge: lit segments follow the runtime (10 segments = 10 h and more). */
function Battery({ hours, pos, w }: { hours: number; pos: [number, number, number]; w: number }) {
  const lit = Math.max(1, Math.min(10, Math.round(hours)))
  const on = useGlow('#35c27a', 1.4)
  return (
    <group position={pos}>
      {Array.from({ length: 10 }, (_, i) => (
        <mesh key={i} material={i < lit ? on : M.dark} position={[0, 0, -w / 2 + (w / 10) * (i + 0.5)]}>
          <boxGeometry args={[0.012, 0.006, (w / 10) * 0.7]} />
        </mesh>
      ))}
    </group>
  )
}

/* ---------- Indoor floor scrubber ---------- */

export function Cleaner({ v, accent }: ModelProps) {
  const [L, W, H] = mm(v.spec.dims_mm, [700, 560, 750])
  const speed = v.spec.speed_mps ?? 0.6
  const drive = useDrive()
  const eyes = useRef<(THREE.Mesh | null)[]>([])
  const water = useRef<THREE.Mesh>(null)
  const eyeMat = useGlow('#7fe3ff', 2)
  const T = 10
  const P = (speed * 8) / 1.5
  const span = Math.max(1.8, L * 2.6)
  useTick((t) => {
    const c = Math.floor(t / T)
    const p = t % T
    drive.current.odo = c * P + P * seg(p, 0.5, 8.5)
    const blink = t % 3.2 < 0.12 ? 0.1 : 1
    eyes.current.forEach((m) => {
      if (m) m.scale.y = blink
    })
    if (water.current) water.current.rotation.x = Math.sin(t * 3) * 0.04
  })
  const r = Math.min(W, H) * 0.22
  const shine = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#bfe3ff',
        roughness: 0.05,
        metalness: 0,
        clearcoat: 1,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    [],
  )
  return (
    <group>
      <Lane drive={drive} length={span * 2.2} width={W * 2} />
      <mesh material={shine} rotation={[-Math.PI / 2, 0, 0]} position={[-L / 2 - span / 2, 0.003, 0]} renderOrder={2}>
        <planeGeometry args={[span, W * 0.95]} />
      </mesh>
      <Debris drive={drive} front={L / 2 + 0.02} span={span} halfW={W * 0.4} color="#6b5a45" size={0.09} />
      <BlobShadow w={L * 1.3} d={W * 1.35} />
      <RoundedBox args={[L, 0.12, W]} radius={0.05} smoothness={3} position={[0, 0.08, 0]} material={M.dark} />
      <RoundedBox
        args={[L * 0.98, H - 0.14, W * 0.98]}
        radius={r}
        smoothness={5}
        position={[0, 0.12 + (H - 0.14) / 2, 0]}
        material={M.shell}
      />
      <RoundedBox
        args={[L * 0.4, (H - 0.14) * 0.62, W * 1.0]}
        radius={Math.min(r, 0.06)}
        smoothness={4}
        position={[-L * 0.22, 0.12 + (H - 0.14) * 0.42, 0]}
        material={paint(accent, 0.35, 0.05, 0.7)}
      />
      <mesh ref={water} position={[-L * 0.22, 0.12 + (H - 0.14) * 0.4, W * 0.5 + 0.003]}>
        <boxGeometry args={[L * 0.28, (H - 0.14) * 0.3, 0.006]} />
        <meshPhysicalMaterial color="#7cc7ff" roughness={0.05} transparent opacity={0.8} clearcoat={1} />
      </mesh>
      <RoundedBox
        args={[0.02, H * 0.34, W * 0.7]}
        radius={0.008}
        smoothness={3}
        position={[L / 2 - 0.004, H * 0.62, 0]}
        material={M.glass}
      />
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          ref={(m) => {
            eyes.current[s > 0 ? 1 : 0] = m
          }}
          material={eyeMat}
          position={[L / 2 + 0.008, H * 0.66, s * W * 0.13]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <circleGeometry args={[Math.min(0.035, W * 0.06), 20]} />
        </mesh>
      ))}
      <LedStrip size={[0.006, 0.012, W * 0.4]} pos={[L / 2 + 0.006, H * 0.52, 0]} color={accent} rate={1.2} />
      <Lidar pos={[L * 0.2, H - 0.02, 0]} r={Math.min(0.05, W * 0.08)} />
      <Battery hours={v.spec.runtime_h ?? 3} pos={[-L * 0.3, H + 0.001, 0]} w={W * 0.5} />
      <Brush r={W * 0.2} pos={[L * 0.34, 0.025, W * 0.24]} dir={1} />
      <Brush r={W * 0.2} pos={[L * 0.34, 0.025, -W * 0.24]} dir={-1} />
      <mesh material={M.rubber} position={[-L / 2 - 0.03, 0.03, 0]}>
        <boxGeometry args={[0.04, 0.04, W * 1.08]} />
      </mesh>
    </group>
  )
}

/* ---------- Street sweeper ---------- */

export function Sweeper({ v, accent }: ModelProps) {
  const [L, W, H] = mm(v.spec.dims_mm, [2200, 1100, 1600])
  const speed = v.spec.speed_mps ?? 1.4
  const drive = useDrive()
  const T = 9
  const P = (speed * 7) / 1.5
  const span = L * 2
  useTick((t) => {
    const c = Math.floor(t / T)
    drive.current.odo = c * P + P * seg(t % T, 0.5, 7.5)
  })
  const wr = H * 0.17
  const bodyMat = paint(accent, 0.38, 0.1, 0.6)
  return (
    <group>
      <Lane drive={drive} length={span * 2.2} width={W * 1.9} />
      <Debris
        drive={drive}
        front={L / 2 + 0.3}
        span={span}
        halfW={W * 0.6}
        color="#c9822e"
        size={0.14}
        count={10}
        leaves
      />
      <BlobShadow w={L * 1.2} d={W * 1.35} />
      <RoundedBox
        args={[L * 0.95, H * 0.3, W]}
        radius={0.08}
        smoothness={3}
        position={[0, wr + H * 0.12, 0]}
        material={M.dark}
      />
      <RoundedBox
        args={[L * 0.55, H * 0.55, W * 0.96]}
        radius={0.14}
        smoothness={4}
        position={[-L * 0.18, wr + H * 0.52, 0]}
        material={bodyMat}
      />
      <RoundedBox
        args={[L * 0.3, H * 0.62, W * 0.9]}
        radius={0.16}
        smoothness={5}
        position={[L * 0.28, wr + H * 0.5, 0]}
        material={M.shell}
      />
      <mesh material={M.glass} position={[L * 0.43 + 0.003, wr + H * 0.62, 0]}>
        <boxGeometry args={[0.01, H * 0.2, W * 0.7]} />
      </mesh>
      <LedStrip size={[0.01, 0.03, W * 0.75]} pos={[L * 0.43 + 0.008, wr + H * 0.46, 0]} color="#fff4d6" rate={0.8} />
      <mesh material={M.steel} position={[-L * 0.18, wr + H * 0.81, 0]}>
        <boxGeometry args={[L * 0.4, 0.03, W * 0.7]} />
      </mesh>
      <Lidar pos={[L * 0.3, wr + H * 0.81, 0]} r={0.08} />
      <Beacon pos={[-L * 0.3, wr + H * 0.8, W * 0.3]} r={0.07} />
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Wheel key={`${sx}${sz}`} r={wr} w={0.16} pos={[sx * L * 0.3, wr, sz * (W / 2 - 0.04)]} drive={drive} />
        )),
      )}
      <Brush r={W * 0.28} pos={[L * 0.45, 0.04, W * 0.42]} dir={-1} tilt={0.12} />
      <Brush r={W * 0.28} pos={[L * 0.45, 0.04, -W * 0.42]} dir={1} tilt={-0.12} />
      <mesh material={M.dark} position={[L * 0.42, 0.12, 0]}>
        <boxGeometry args={[0.1, 0.1, W * 0.6]} />
      </mesh>
    </group>
  )
}

/* ---------- Service humanoid ---------- */

export function Humanoid({ v, accent }: ModelProps) {
  const h = (v.spec.dims_mm?.[2] ?? 1550) / 1000
  const k = h / 1.55
  const root = useRef<G>(null)
  const head = useRef<G>(null)
  const armR = useRef<G>(null)
  const foreR = useRef<G>(null)
  const armL = useRef<G>(null)
  const eyes = useRef<(THREE.Mesh | null)[]>([])
  const screen = useGlow('#6fb7ff', 1.3)
  const eyeMat = useGlow('#e8fbff', 2.5)
  const T = 8
  useTick((t) => {
    const p = t % T
    if (root.current) {
      root.current.position.y = Math.sin(t * 2.2) * 0.006
      root.current.rotation.y = Math.sin(t * 0.4) * 0.35
    }
    if (head.current) {
      head.current.rotation.y = Math.sin(t * 0.9) * 0.45
      head.current.rotation.z = Math.sin(t * 0.7) * 0.08
    }
    const wave = seg(p, 1, 1.6) - seg(p, 4.2, 4.9)
    if (armR.current) {
      armR.current.rotation.x = -wave * 2.5
      armR.current.rotation.z = wave * 0.2
    }
    if (foreR.current) foreR.current.rotation.x = -wave * (0.5 + 0.45 * Math.sin(t * 9))
    if (armL.current) armL.current.rotation.x = Math.sin(t * 1.3) * 0.08
    const blink = t % 3.6 < 0.13 ? 0.08 : 1
    eyes.current.forEach((m) => {
      if (m) m.scale.y = blink
    })
    screen.emissive.setHSL(0.58 + Math.sin(t * 0.5) * 0.05, 0.8, 0.55)
  })
  const accentMat = paint(accent, 0.35, 0.05, 0.7)
  return (
    <group scale={k}>
      <BlobShadow w={0.8} d={0.8} />
      <group ref={root}>
        <mesh material={M.dark} position={[0, 0.06, 0]}>
          <cylinderGeometry args={[0.3, 0.32, 0.12, 40]} />
        </mesh>
        <mesh material={M.shell} position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.2, 0.29, 0.38, 40]} />
        </mesh>
        <LedStrip size={[0.004, 0.02, 0.2]} pos={[0.27, 0.16, 0]} color={accent} rate={1} />
        <mesh material={accentMat} position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.205, 0.205, 0.04, 40]} />
        </mesh>
        <RoundedBox args={[0.34, 0.62, 0.46]} radius={0.12} smoothness={5} position={[0, 0.84, 0]} material={M.shell} />
        <RoundedBox
          args={[0.02, 0.3, 0.3]}
          radius={0.01}
          smoothness={3}
          position={[0.165, 0.86, 0]}
          material={M.glass}
        />
        <mesh material={screen} position={[0.177, 0.86, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.26, 0.24]} />
        </mesh>
        {[0.95, 0.9, 0.85].map((y, i) => (
          <mesh key={y} material={M.shell} position={[0.179, y, -0.04 + i * 0.02]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[0.14 - i * 0.03, 0.018]} />
          </mesh>
        ))}
        <mesh material={M.dark} position={[0, 1.2, 0]}>
          <cylinderGeometry args={[0.05, 0.06, 0.08, 20]} />
        </mesh>
        <group ref={head} position={[0, 1.24, 0]}>
          <RoundedBox
            args={[0.3, 0.28, 0.32]}
            radius={0.12}
            smoothness={5}
            position={[0, 0.15, 0]}
            material={M.shell}
          />
          <RoundedBox
            args={[0.03, 0.18, 0.24]}
            radius={0.012}
            smoothness={3}
            position={[0.14, 0.15, 0]}
            material={M.glass}
          />
          {[-1, 1].map((s) => (
            <mesh
              key={s}
              ref={(m) => {
                eyes.current[s > 0 ? 1 : 0] = m
              }}
              material={eyeMat}
              position={[0.157, 0.17, s * 0.055]}
              rotation={[0, Math.PI / 2, 0]}
            >
              <circleGeometry args={[0.028, 20]} />
            </mesh>
          ))}
          <mesh material={eyeMat} position={[0.157, 0.11, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[0.06, 0.008]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} material={accentMat} position={[0, 0.15, s * 0.165]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.05, 0.05, 0.02, 24]} />
            </mesh>
          ))}
        </group>
        {[-1, 1].map((s) => (
          <group key={s} ref={s > 0 ? armR : armL} position={[0, 1.04, s * 0.27]}>
            <mesh material={accentMat}>
              <sphereGeometry args={[0.06, 20, 16]} />
            </mesh>
            <mesh material={M.shell} position={[0, -0.14, 0]}>
              <capsuleGeometry args={[0.045, 0.18, 6, 14]} />
            </mesh>
            <group ref={s > 0 ? foreR : undefined} position={[0, -0.28, 0]}>
              <mesh material={M.dark}>
                <sphereGeometry args={[0.04, 16, 12]} />
              </mesh>
              <mesh material={M.shell} position={[0, -0.12, 0]}>
                <capsuleGeometry args={[0.04, 0.15, 6, 14]} />
              </mesh>
              <mesh material={M.dark} position={[0, -0.25, 0]}>
                <sphereGeometry args={[0.045, 16, 12]} />
              </mesh>
            </group>
          </group>
        ))}
      </group>
    </group>
  )
}

/* ---------- Delivery rover ---------- */

export function Courier({ v, accent }: ModelProps) {
  const [L, W, H] = mm(v.spec.dims_mm, [800, 600, 750])
  const speed = v.spec.speed_mps ?? 1.5
  const drive = useDrive()
  const lid = useRef<G>(null)
  const parcel = useRef<G>(null)
  const flag = useRef<G>(null)
  const T = 8
  const P = (speed * 4.5) / 1.5
  useTick((t) => {
    const c = Math.floor(t / T)
    const p = t % T
    drive.current.odo = c * P + P * seg(p, 0.3, 4.8)
    const open = seg(p, 5.2, 5.9) - seg(p, 7.0, 7.7)
    if (lid.current) lid.current.rotation.z = open * 1.7
    if (parcel.current) parcel.current.position.y = open * 0.12
    const moving = seg(p, 0.3, 1.0) - seg(p, 4.1, 4.8)
    if (flag.current) flag.current.rotation.z = -0.1 - moving * 0.35 + Math.sin(t * 7) * 0.08 * (0.3 + moving)
  })
  const wr = 0.1
  const bodyY = wr * 1.25
  const bodyH = H - bodyY - 0.03
  const lidMat = paint(accent, 0.35, 0.05, 0.7)
  const wheelsX = [-L * 0.36, 0, L * 0.36]
  return (
    <group>
      <Lane drive={drive} length={Math.max(L, 1) * 5} width={W * 2} />
      <BlobShadow w={L * 1.3} d={W * 1.4} />
      {wheelsX.flatMap((x) =>
        [-1, 1].map((s) => <Wheel key={`${x}${s}`} r={wr} w={0.07} pos={[x, wr, s * (W / 2 + 0.01)]} drive={drive} />),
      )}
      <group>
        <RoundedBox
          args={[L * 0.96, 0.08, W * 0.8]}
          radius={0.03}
          smoothness={3}
          position={[0, bodyY - 0.02, 0]}
          material={M.dark}
        />
        <RoundedBox
          args={[L, bodyH, W]}
          radius={0.09}
          smoothness={5}
          position={[0, bodyY + bodyH / 2, 0]}
          material={M.shell}
        />
        <RoundedBox
          args={[0.02, bodyH * 0.25, W * 0.7]}
          radius={0.01}
          smoothness={3}
          position={[L / 2 - 0.005, bodyY + bodyH * 0.55, 0]}
          material={M.glass}
        />
        {[-1, 1].map((s) => (
          <LedStrip
            key={s}
            size={[0.006, 0.03, 0.1]}
            pos={[L / 2 + 0.003, bodyY + bodyH * 0.55, s * W * 0.22]}
            color="#fff6d8"
            rate={0.6}
          />
        ))}
        <mesh material={lidMat} position={[0, bodyY + bodyH * 0.2, 0]}>
          <boxGeometry args={[L * 1.002, 0.03, W * 1.002]} />
        </mesh>
        <group ref={parcel} position={[0, bodyY + bodyH - 0.2, 0]}>
          <mesh material={M.carton}>
            <boxGeometry args={[L * 0.5, 0.26, W * 0.55]} />
          </mesh>
        </group>
        <group ref={lid} position={[-L / 2 + 0.03, bodyY + bodyH + 0.005, 0]}>
          <RoundedBox
            args={[L * 0.9, 0.04, W * 0.92]}
            radius={0.018}
            smoothness={3}
            position={[L * 0.45, 0, 0]}
            material={lidMat}
          />
        </group>
        <group position={[-L * 0.38, bodyY + bodyH, W * 0.36]}>
          <mesh material={M.dark} position={[0, 0.4, 0]}>
            <cylinderGeometry args={[0.006, 0.008, 0.8, 8]} />
          </mesh>
          <group ref={flag} position={[0, 0.78, 0]}>
            <mesh material={paint('#ff7a1f', 0.6, 0, 0)} position={[-0.08, -0.04, 0]}>
              <boxGeometry args={[0.16, 0.08, 0.004]} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  )
}

/* ---------- Security patrol robot ---------- */

export function Security({ v, accent }: ModelProps) {
  const [L, W, H] = mm(v.spec.dims_mm, [900, 700, 1650])
  const speed = v.spec.speed_mps ?? 1.5
  const drive = useDrive()
  const turret = useRef<G>(null)
  const cone = useRef<THREE.Mesh>(null)
  const red = useGlow('#ff3b3b', 2)
  const blue = useGlow('#3b7bff', 2)
  const T = 10
  const P = (speed * 4) / 1.5
  useTick((t) => {
    const c = Math.floor(t / T)
    const p = t % T
    drive.current.odo = c * P + P * seg(p, 0.3, 4.3)
    const scan = seg(p, 4.6, 5.4)
    if (turret.current)
      turret.current.rotation.y = scan * Math.sin((p - 4.6) * 1.1) * 1.3 + (1 - scan) * Math.sin(t * 0.8) * 0.3
    const phase = Math.floor(t * 6) % 4
    red.emissiveIntensity = phase === 0 || phase === 2 ? 3 : 0.2
    blue.emissiveIntensity = phase === 1 || phase === 3 ? 3 : 0.2
    if (cone.current) (cone.current.material as THREE.MeshBasicMaterial).opacity = 0.1 + 0.05 * Math.sin(t * 5)
  })
  const wr = 0.16
  const bodyR = Math.min(L, W) * 0.42
  const bodyH = H - 0.62
  const coneMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.12, depthWrite: false }),
    [],
  )
  return (
    <group>
      <Lane drive={drive} length={L * 6} width={W * 2} />
      <BlobShadow w={L * 1.3} d={W * 1.4} />
      <RoundedBox args={[L, 0.28, W]} radius={0.1} smoothness={4} position={[0, wr + 0.08, 0]} material={M.dark} />
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Wheel key={`${sx}${sz}`} r={wr} w={0.12} pos={[sx * L * 0.32, wr, sz * (W / 2 + 0.02)]} drive={drive} />
        )),
      )}
      <mesh material={M.shell} position={[0, wr + 0.22 + bodyH / 2, 0]}>
        <cylinderGeometry args={[bodyR * 0.86, bodyR, bodyH, 48]} />
      </mesh>
      <mesh material={paint(accent, 0.35, 0.1, 0.7)} position={[0, wr + 0.22 + bodyH * 0.35, 0]}>
        <cylinderGeometry args={[bodyR * 0.97, bodyR * 0.985, 0.12, 48]} />
      </mesh>
      <mesh material={M.glass} position={[bodyR * 0.9, wr + 0.22 + bodyH * 0.62, 0]} rotation={[0, 0, -0.08]}>
        <boxGeometry args={[0.02, bodyH * 0.22, bodyR * 0.8]} />
      </mesh>
      <mesh material={red} position={[0, wr + 0.22 + bodyH + 0.02, bodyR * 0.45]}>
        <boxGeometry args={[bodyR * 0.6, 0.04, 0.12]} />
      </mesh>
      <mesh material={blue} position={[0, wr + 0.22 + bodyH + 0.02, -bodyR * 0.45]}>
        <boxGeometry args={[bodyR * 0.6, 0.04, 0.12]} />
      </mesh>
      <group ref={turret} position={[0, wr + 0.22 + bodyH, 0]}>
        <mesh material={M.dark} position={[0, 0.06, 0]}>
          <cylinderGeometry args={[0.1, 0.12, 0.12, 24]} />
        </mesh>
        <mesh material={M.shell} position={[0, 0.2, 0]}>
          <sphereGeometry args={[0.14, 32, 24]} />
        </mesh>
        <mesh material={M.glass} position={[0.11, 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.06, 0.07, 0.08, 24]} />
        </mesh>
        <mesh ref={cone} material={coneMat} position={[1.3, 0.2 - 0.25, 0]} rotation={[0, 0, Math.PI / 2 + 0.2]}>
          <coneGeometry args={[0.55, 2.2, 32, 1, true]} />
        </mesh>
        <Lidar pos={[-0.02, 0.34, 0]} r={0.05} />
      </group>
    </group>
  )
}

import { RoundedBox } from '@react-three/drei'
import { useMemo, useRef, type ReactNode, type RefObject } from 'react'
import * as THREE from 'three'
import {
  Beacon,
  BlobShadow,
  FadeDisc,
  Lane,
  LedStrip,
  Lidar,
  M,
  Wheel,
  ik2,
  paint,
  seg,
  useDrive,
  useGlow,
  useTick,
} from '../kit'
import { mm, type ModelProps } from '../types'
import { AmrBody } from './warehouse'

type G = THREE.Group

/** Two-link arm in the x–y plane of its group: shoulder at the origin, links along +x. */
function ArmLinks({
  a,
  b,
  th,
  mat,
  joint,
  shoulder,
  elbow,
  wrist,
  children,
}: {
  a: number
  b: number
  th: number
  mat: THREE.Material
  joint: THREE.Material
  shoulder: RefObject<G | null>
  elbow: RefObject<G | null>
  wrist?: RefObject<G | null>
  children?: ReactNode
}) {
  return (
    <group ref={shoulder}>
      <mesh material={joint} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[th * 0.9, th * 0.9, th * 2, 20]} />
      </mesh>
      <RoundedBox
        args={[a, th * 1.3, th * 1.3]}
        radius={th * 0.5}
        smoothness={3}
        position={[a / 2, 0, 0]}
        material={mat}
      />
      <group ref={elbow} position={[a, 0, 0]}>
        <mesh material={joint} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[th * 0.75, th * 0.75, th * 1.7, 20]} />
        </mesh>
        <RoundedBox args={[b, th, th]} radius={th * 0.45} smoothness={3} position={[b / 2, 0, 0]} material={mat} />
        <group ref={wrist} position={[b, 0, 0]}>
          {children}
        </group>
      </group>
    </group>
  )
}

/* ---------- Special purpose: tracked rescue / EOD platform with an arm ---------- */

export function Ugv({ v, accent }: ModelProps) {
  const [L, W, H] = mm(v.spec.dims_mm, [1200, 700, 900])
  const shoulder = useRef<G>(null)
  const elbow = useRef<G>(null)
  const wrist = useRef<G>(null)
  const claw = useRef<(G | null)[]>([])
  const cam = useRef<G>(null)
  const item = useRef<G>(null)
  const drive = useDrive()
  const a = L * 0.5
  const b = L * 0.45
  const trackH = H * 0.3
  // Tracks and the object stand a centimetre off the floor: a rounded bottom resting on it z-fights with the floor fade.
  const lift0 = 0.012
  const shoulderY = trackH + H * 0.2
  const T = 8
  useTick((t) => {
    const p = t % T
    drive.current.odo = 0.6 * Math.sin((t * Math.PI) / T)
    const reach = seg(p, 0.5, 2) - seg(p, 4, 5.5)
    const lift = seg(p, 2.6, 3.4) - seg(p, 5.6, 6.4)
    // Wrist target: stowed over the body → down in front → lifted with the object.
    const tx = L * 0.15 + reach * L * 0.55
    // The shoulder sits at shoulderY: at full reach the wrist comes down to 0.25 m so the claws close round the object.
    const ty = 0.25 - reach * shoulderY + lift * 0.35
    const j = ik2(tx - L * 0.1, ty, a, b)
    if (shoulder.current) shoulder.current.rotation.z = j.s
    if (elbow.current) elbow.current.rotation.z = -j.e
    if (wrist.current) wrist.current.rotation.z = -Math.PI / 2 - (j.s - j.e)
    const grip = seg(p, 2.1, 2.5) - seg(p, 6.4, 6.8)
    claw.current.forEach((g, i) => {
      if (g) g.rotation.x = (i ? 1 : -1) * (0.5 - grip * 0.38)
    })
    if (item.current) {
      const held = p > 2.5 && p < 6.6
      item.current.position.set(held ? tx : L * 0.7, held ? shoulderY + ty - 0.17 : 0.06 + lift0, 0)
    }
    if (cam.current) cam.current.rotation.y = Math.sin(t * 0.7) * 0.7
  })
  const bodyMat = paint(accent, 0.35, 0.1, 0.7)
  const th = 0.035 + L * 0.02
  return (
    <group position={[-L * 0.2, 0, 0]}>
      <BlobShadow w={L * 1.4} d={W * 1.4} />
      {[-1, 1].map((s) => (
        <group key={s} position={[0, trackH / 2 + lift0, s * (W / 2 - 0.08)]}>
          <RoundedBox args={[L, trackH, 0.16]} radius={trackH * 0.45} smoothness={6} material={M.rubber} />
          {[-0.33, 0, 0.33].map((x) => (
            <Wheel key={x} r={trackH * 0.3} w={0.22} pos={[x * L, 0, 0]} drive={drive} />
          ))}
        </group>
      ))}
      <RoundedBox
        args={[L * 0.8, H * 0.24, W * 0.72]}
        radius={0.06}
        smoothness={4}
        position={[-L * 0.02, trackH + H * 0.1, 0]}
        material={bodyMat}
      />
      <LedStrip size={[0.01, 0.025, W * 0.5]} pos={[L * 0.38, trackH + H * 0.12, 0]} color="#fff6e0" rate={0.8} />
      <Beacon pos={[-L * 0.3, trackH + H * 0.22, W * 0.22]} r={0.045} />
      <mesh material={M.dark} position={[-L * 0.25, trackH + H * 0.5, -W * 0.18]}>
        <cylinderGeometry args={[0.02, 0.025, H * 0.55, 10]} />
      </mesh>
      <group ref={cam} position={[-L * 0.25, trackH + H * 0.78, -W * 0.18]}>
        <RoundedBox args={[0.14, 0.09, 0.1]} radius={0.03} smoothness={3} material={M.shell} />
        <mesh material={M.glass} position={[0.075, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.025, 0.03, 0.02, 16]} />
        </mesh>
      </group>
      <group position={[L * 0.1, shoulderY, 0]}>
        <ArmLinks a={a} b={b} th={th} mat={bodyMat} joint={M.dark} shoulder={shoulder} elbow={elbow} wrist={wrist}>
          <mesh material={M.dark} position={[0.04, 0, 0]}>
            <boxGeometry args={[0.08, 0.06, 0.08]} />
          </mesh>
          {[0, 1].map((i) => (
            <group
              key={i}
              ref={(g) => {
                claw.current[i] = g
              }}
              position={[0.08, 0, (i ? 1 : -1) * 0.03]}
            >
              <mesh material={M.steel} position={[0.05, 0, 0]}>
                <boxGeometry args={[0.1, 0.02, 0.015]} />
              </mesh>
            </group>
          ))}
        </ArmLinks>
      </group>
      <group ref={item}>
        <RoundedBox args={[0.14, 0.12, 0.12]} radius={0.02} smoothness={2} material={paint('#e0533d', 0.5, 0.1, 0.3)} />
      </group>
    </group>
  )
}

/* ---------- Retail: robot café kiosk, an arm makes a drink behind glass ---------- */

export function RoboCafe({ v, accent }: ModelProps) {
  const [L, W, H] = mm(v.spec.dims_mm, [2000, 1400, 2300])
  const shoulder = useRef<G>(null)
  const elbow = useRef<G>(null)
  const cup = useRef<G>(null)
  const stream = useRef<THREE.Mesh>(null)
  const screen = useGlow('#6fb7ff', 1.4)
  const counterY = H * 0.42
  const a = L * 0.22
  const b = L * 0.2
  const base = { x: 0, y: counterY + 0.25 }
  const stack = { x: -L * 0.3, y: counterY + 0.12 }
  const tap = { x: 0.02, y: counterY + 0.12 }
  const hatch = { x: L * 0.32, y: counterY + 0.12 }
  const T = 9
  useTick((t) => {
    const p = t % T
    const k1 = seg(p, 0.4, 1.6)
    const k2 = seg(p, 4.0, 5.2)
    const k3 = seg(p, 6.8, 8.2)
    const x = stack.x + (tap.x - stack.x) * k1 + (hatch.x - tap.x) * k2 + (stack.x - hatch.x) * k3
    const y = stack.y + 0.12 * Math.sin(Math.PI * (k1 + k2 + k3 - Math.floor(k1 + k2 + k3)))
    const j = ik2(x - base.x, y + 0.1 - base.y, a, b)
    if (shoulder.current) shoulder.current.rotation.z = j.s
    if (elbow.current) elbow.current.rotation.z = -j.e
    const carrying = p > 0.3 && p < 5.4
    if (cup.current) {
      cup.current.visible = carrying || p > 8.3
      cup.current.position.set(carrying ? x : stack.x, carrying ? y : stack.y, 0)
    }
    if (stream.current) stream.current.visible = p > 1.9 && p < 3.7
  })
  const glass = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#cfe6f2',
        transparent: true,
        opacity: 0.22,
        roughness: 0.05,
        depthWrite: false,
      }),
    [],
  )
  const bodyMat = paint(accent, 0.35, 0.1, 0.7)
  return (
    <group>
      <BlobShadow w={L * 1.2} d={W * 1.2} />
      <RoundedBox
        args={[L, counterY, W]}
        radius={0.08}
        smoothness={4}
        position={[0, counterY / 2 + 0.01, 0]}
        material={M.shell}
      />
      <RoundedBox args={[L, 0.3, W]} radius={0.08} smoothness={4} position={[0, H - 0.15, 0]} material={bodyMat} />
      <LedStrip size={[L * 0.6, 0.05, 0.01]} pos={[0, H - 0.15, W / 2 + 0.005]} color="#fff6e0" rate={0.6} />
      {[-1, 1].map((s) => (
        <mesh key={s} material={M.shell} position={[s * (L / 2 - 0.05), (counterY + H - 0.3) / 2, 0]}>
          <boxGeometry args={[0.1, H - 0.3 - counterY, W]} />
        </mesh>
      ))}
      <mesh material={M.shell2} position={[0, (counterY + H - 0.3) / 2, -W / 2 + 0.03]}>
        <boxGeometry args={[L - 0.2, H - 0.3 - counterY, 0.06]} />
      </mesh>
      <mesh material={glass} position={[0, (counterY + H - 0.3) / 2, W / 2 - 0.02]}>
        <boxGeometry args={[L - 0.2, H - 0.3 - counterY, 0.02]} />
      </mesh>
      <RoundedBox
        args={[0.34, 0.5, 0.04]}
        radius={0.02}
        smoothness={2}
        position={[L / 2 - 0.35, counterY * 0.6, W / 2 + 0.02]}
        material={M.glass}
      />
      <mesh material={screen} position={[L / 2 - 0.35, counterY * 0.6, W / 2 + 0.041]}>
        <planeGeometry args={[0.28, 0.42]} />
      </mesh>
      <mesh material={M.dark} position={[hatch.x, counterY + 0.02, W / 2 - 0.1]}>
        <boxGeometry args={[0.3, 0.02, 0.2]} />
      </mesh>
      <LedStrip size={[0.3, 0.02, 0.01]} pos={[hatch.x, counterY + 0.25, W / 2 - 0.01]} color="#35c27a" rate={2} />
      <group position={[tap.x, counterY + 0.62, -W * 0.1]}>
        <RoundedBox args={[0.3, 0.36, 0.3]} radius={0.04} smoothness={3} material={M.dark} />
        <mesh material={M.steel} position={[0, -0.22, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.08, 10]} />
        </mesh>
      </group>
      <mesh ref={stream} material={paint('#6b4226', 0.4, 0, 0.3)} position={[tap.x, counterY + 0.3, -W * 0.1]}>
        <cylinderGeometry args={[0.008, 0.008, 0.26, 8]} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} material={M.shell} position={[stack.x, counterY + 0.06 + i * 0.03, -W * 0.1]}>
          <cylinderGeometry args={[0.045, 0.035, 0.1, 16]} />
        </mesh>
      ))}
      <group position={[base.x, 0, -W * 0.1]}>
        <mesh material={M.dark} position={[0, counterY + 0.12, 0]}>
          <cylinderGeometry args={[0.07, 0.09, 0.25, 20]} />
        </mesh>
        <group position={[0, base.y, 0]}>
          <ArmLinks a={a} b={b} th={0.035} mat={M.shell} joint={bodyMat} shoulder={shoulder} elbow={elbow} />
        </group>
        <group ref={cup}>
          <mesh material={M.shell}>
            <cylinderGeometry args={[0.045, 0.035, 0.1, 16]} />
          </mesh>
          <mesh material={paint('#6b4226', 0.4, 0, 0.3)} position={[0, 0.048, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.005, 16]} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

/* ---------- Railway: rover beside the track opens a coupling between wagons ---------- */

export function RailRover({ v, accent }: ModelProps) {
  const [L, W, H] = mm(v.spec.dims_mm, [1400, 900, 900])
  const rover = useRef<G>(null)
  const shoulder = useRef<G>(null)
  const elbow = useRef<G>(null)
  const lever = useRef<G>(null)
  const drive = useDrive()
  const trackZ = -1.35
  const couplerY = 1.05
  const a = 0.75
  const b = 0.7
  const T = 10
  useTick((t) => {
    const p = t % T
    const x = -2.2 * (1 - seg(p, 0.3, 2.8)) + 2.2 * seg(p, 7.2, 9.7)
    drive.current.odo = x
    if (rover.current) rover.current.position.x = x
    const reach = seg(p, 3.0, 4.2) - seg(p, 5.8, 7.0)
    const pull = seg(p, 4.4, 5.2) - seg(p, 5.8, 6.4)
    const tz = -0.2 - reach * (Math.abs(trackZ) - 0.45)
    const ty = H * 0.3 + reach * (couplerY - H - 0.1) + pull * 0.12
    const j = ik2(-tz, ty, a, b)
    if (shoulder.current) shoulder.current.rotation.z = j.s
    if (elbow.current) elbow.current.rotation.z = -j.e
    if (lever.current) lever.current.rotation.x = pull * 0.9
  })
  const bodyMat = paint(accent, 0.35, 0.1, 0.7)
  const wagonL = 3.2
  return (
    <group position={[0, 0, 0.6]}>
      <FadeDisc w={9} d={4.5} color="#a79d8e" opacity={0.7} />
      <group position={[0, 0, trackZ]}>
        {Array.from({ length: 12 }, (_, i) => (
          <mesh key={i} material={M.wood} position={[-4.1 + i * 0.75, 0.05, 0]}>
            <boxGeometry args={[0.22, 0.1, 2.3]} />
          </mesh>
        ))}
        {[-0.76, 0.76].map((z) => (
          <mesh key={z} material={M.steel} position={[0, 0.16, z]}>
            <boxGeometry args={[9, 0.12, 0.07]} />
          </mesh>
        ))}
        {[-1, 1].map((s) => (
          <group key={s} position={[s * (wagonL / 2 + 0.55), 0, 0]}>
            <RoundedBox
              args={[wagonL, 2.3, 2.6]}
              radius={0.06}
              smoothness={3}
              position={[0, 1.9, 0]}
              material={paint('#6f7f8c', 0.6, 0.2, 0.2)}
            />
            <mesh material={M.dark} position={[0, 0.72, 0]}>
              <boxGeometry args={[wagonL * 0.9, 0.3, 1.6]} />
            </mesh>
            {[-0.35, 0.35].flatMap((x) =>
              [-0.76, 0.76].map((z) => (
                <mesh
                  key={`${x}${z}`}
                  material={M.dark}
                  position={[x * wagonL, 0.46, z]}
                  rotation={[Math.PI / 2, 0, 0]}
                >
                  <cylinderGeometry args={[0.3, 0.3, 0.12, 20]} />
                </mesh>
              )),
            )}
            <mesh material={M.dark} position={[-s * (wagonL / 2 + 0.25), couplerY, 0]}>
              <boxGeometry args={[0.5, 0.18, 0.22]} />
            </mesh>
          </group>
        ))}
        <group ref={lever} position={[0, couplerY + 0.1, 0.3]}>
          <mesh material={paint('#e0533d', 0.5, 0.1, 0.3)} position={[0, 0, 0.2]}>
            <boxGeometry args={[0.04, 0.04, 0.45]} />
          </mesh>
        </group>
      </group>
      <group ref={rover}>
        <BlobShadow w={L * 1.3} d={W * 1.3} />
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <Wheel
              key={`${sx}${sz}`}
              r={0.16}
              w={0.12}
              pos={[sx * L * 0.33, 0.16, sz * (W / 2 - 0.02)]}
              drive={drive}
            />
          )),
        )}
        <RoundedBox
          args={[L, H * 0.45, W * 0.92]}
          radius={0.08}
          smoothness={4}
          position={[0, 0.2 + H * 0.225, 0]}
          material={bodyMat}
        />
        <RoundedBox
          args={[L * 0.9, 0.05, W * 0.8]}
          radius={0.02}
          smoothness={2}
          position={[0, 0.2 + H * 0.46, 0]}
          material={M.shell}
        />
        <Lidar pos={[L * 0.35, 0.2 + H * 0.48, 0]} r={0.06} />
        <Beacon pos={[-L * 0.35, 0.2 + H * 0.48, 0]} r={0.05} />
        <group position={[0, H, -W * 0.2]} rotation={[0, Math.PI / 2, 0]}>
          <mesh material={M.dark} position={[0, -0.1, 0]}>
            <cylinderGeometry args={[0.08, 0.1, 0.2, 18]} />
          </mesh>
          <ArmLinks a={a} b={b} th={0.045} mat={bodyMat} joint={M.dark} shoulder={shoulder} elbow={elbow}>
            <mesh material={M.steel} position={[0.06, 0, 0]}>
              <boxGeometry args={[0.12, 0.05, 0.05]} />
            </mesh>
          </ArmLinks>
        </group>
      </group>
    </group>
  )
}

/* ---------- Passenger transport: driverless car with a roof sensor rack ---------- */

export function Shuttle({ v, accent }: ModelProps) {
  const [L, W, H] = mm(v.spec.dims_mm, [4600, 1900, 1600])
  const speed = v.spec.speed_mps ?? 8
  const drive = useDrive()
  const body = useRef<G>(null)
  const T = 9
  const P = (Math.min(speed, 10) * 7) / 1.5
  useTick((t) => {
    const c = Math.floor(t / T)
    drive.current.odo = c * P + P * seg(t % T, 0.5, 7.5)
    if (body.current) body.current.position.y = Math.sin(t * 9) * 0.004
  })
  const wr = Math.min(0.34, H * 0.2)
  const lowH = H * 0.42
  const bodyMat = paint(accent, 0.25, 0.15, 0.9)
  const tint = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#1c2833',
        roughness: 0.05,
        metalness: 0.3,
        clearcoat: 1,
        transparent: true,
        opacity: 0.85,
      }),
    [],
  )
  const lamp = useGlow('#fff6e0', 1.8)
  const bodyR = Math.min(0.2, lowH * 0.45)
  const lampY = wr * 0.8 + lowH - bodyR - 0.05
  const lampZ = W / 2 - bodyR - W * 0.07 - 0.03
  const tail = useGlow('#ff3b3b', 1.4)
  return (
    <group>
      <Lane drive={drive} length={L * 3} width={W * 1.8} />
      <BlobShadow w={L * 1.1} d={W * 1.25} />
      {[-L * 0.32, L * 0.32].flatMap((x) =>
        [-1, 1].map((s) => <Wheel key={`${x}${s}`} r={wr} w={0.22} pos={[x, wr, s * (W / 2 - 0.12)]} drive={drive} />),
      )}
      <group ref={body}>
        <RoundedBox
          args={[L, lowH, W]}
          radius={bodyR}
          smoothness={6}
          position={[0, wr * 0.8 + lowH / 2, 0]}
          material={bodyMat}
        />
        <RoundedBox
          args={[L * 0.58, H - wr * 0.8 - lowH, W * 0.9]}
          radius={Math.min(0.22, (H - wr * 0.8 - lowH) * 0.45)}
          smoothness={6}
          position={[-L * 0.04, wr * 0.8 + lowH + (H - wr * 0.8 - lowH) / 2 - 0.03, 0]}
          material={tint}
        />
        <RoundedBox
          args={[L * 0.3, 0.08, W * 0.7]}
          radius={0.03}
          smoothness={3}
          position={[-L * 0.04, H + 0.02, 0]}
          material={M.dark}
        />
        <Lidar pos={[-L * 0.04, H + 0.06, 0]} r={0.1} />
        {[-1, 1].map((s) => (
          <group key={s}>
            {/* Lamps sit just proud of the flat part of the nose and tail; flush faces z-fight. */}
            <mesh material={lamp} position={[L / 2 + 0.006, lampY, s * lampZ]}>
              <boxGeometry args={[0.012, 0.06, W * 0.14]} />
            </mesh>
            <mesh material={tail} position={[-L / 2 - 0.006, lampY, s * lampZ]}>
              <boxGeometry args={[0.012, 0.05, W * 0.13]} />
            </mesh>
            <Lidar pos={[L / 2 - 0.3, wr * 0.8 + lowH, s * (W / 2 - 0.05)]} r={0.05} />
          </group>
        ))}
      </group>
    </group>
  )
}

/* ---------- Medical: lower-limb exoskeleton walking on a treadmill ---------- */

export function Exo({ v, accent }: ModelProps) {
  const h = (v.spec.dims_mm?.[2] ?? 1750) / 1000
  const k = h / 1.75
  const legs = useRef<{ hip: G | null; knee: G | null }[]>([
    { hip: null, knee: null },
    { hip: null, knee: null },
  ])
  const pelvis = useRef<G>(null)
  const drive = useDrive()
  useTick((t) => {
    drive.current.odo = t * 0.5
    const w = t * 3.2
    legs.current.forEach((l, i) => {
      const ph = w + i * Math.PI
      if (l.hip) l.hip.rotation.z = Math.sin(ph) * 0.42
      if (l.knee) l.knee.rotation.z = -Math.max(0, Math.sin(ph + 1.2)) * 0.8
    })
    if (pelvis.current) pelvis.current.position.y = 1.0 + Math.abs(Math.sin(w)) * 0.015
  })
  const skin = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#8f9ba7',
        transparent: true,
        opacity: 0.35,
        roughness: 0.6,
        depthWrite: false,
      }),
    [],
  )
  const frame = paint(accent, 0.3, 0.2, 0.7)
  const motor = M.dark
  return (
    <group scale={k}>
      <BlobShadow w={1.4} d={0.9} />
      <RoundedBox args={[1.5, 0.12, 0.7]} radius={0.04} smoothness={3} position={[0, 0.07, 0]} material={M.dark} />
      <group position={[0, 0.125, 0]}>
        <Lane drive={drive} length={1.4} width={0.6} />
      </group>
      {[-1, 1].map((s) => (
        <mesh key={s} material={M.steel} position={[0.55, 0.6, s * 0.33]}>
          <cylinderGeometry args={[0.02, 0.02, 1.0, 10]} />
        </mesh>
      ))}
      <mesh material={M.steel} position={[0.55, 1.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.68, 10]} />
      </mesh>
      <group ref={pelvis} position={[0, 1.0, 0]}>
        <mesh material={skin} position={[0, 0.3, 0]}>
          <capsuleGeometry args={[0.16, 0.45, 6, 14]} />
        </mesh>
        <RoundedBox args={[0.3, 0.12, 0.42]} radius={0.04} smoothness={3} material={frame} />
        <RoundedBox
          args={[0.12, 0.22, 0.26]}
          radius={0.04}
          smoothness={3}
          position={[-0.18, 0.08, 0]}
          material={M.shell}
        />
        <LedStrip size={[0.005, 0.02, 0.14]} pos={[-0.245, 0.12, 0]} color="#35c27a" rate={1.5} />
        {[-1, 1].map((s, i) => (
          <group
            key={s}
            ref={(g) => {
              legs.current[i].hip = g
            }}
            position={[0, -0.02, s * 0.12]}
            rotation={[0, 0, 0]}
          >
            <mesh material={motor} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, s * 0.1]}>
              <cylinderGeometry args={[0.06, 0.06, 0.05, 20]} />
            </mesh>
            <mesh material={skin} position={[0, -0.22, 0]}>
              <capsuleGeometry args={[0.07, 0.3, 6, 12]} />
            </mesh>
            <mesh material={frame} position={[0, -0.22, s * 0.1]}>
              <boxGeometry args={[0.04, 0.4, 0.02]} />
            </mesh>
            <group
              ref={(g) => {
                legs.current[i].knee = g
              }}
              position={[0, -0.44, 0]}
            >
              <mesh material={motor} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, s * 0.1]}>
                <cylinderGeometry args={[0.05, 0.05, 0.05, 20]} />
              </mesh>
              <mesh material={skin} position={[0, -0.2, 0]}>
                <capsuleGeometry args={[0.055, 0.3, 6, 12]} />
              </mesh>
              <mesh material={frame} position={[0, -0.2, s * 0.1]}>
                <boxGeometry args={[0.035, 0.38, 0.02]} />
              </mesh>
              <RoundedBox
                args={[0.24, 0.04, 0.1]}
                radius={0.015}
                smoothness={2}
                position={[0.05, -0.41, 0]}
                material={frame}
              />
            </group>
          </group>
        ))}
      </group>
    </group>
  )
}

/* ---------- Neutral: fallback robot for a class that has no model yet ---------- */

// A soft, generic service-robot silhouette: egg body on a low base with a light ring, a visor that looks around.
function NeutralCapsule({ v, accent }: ModelProps) {
  const [L, W, H] = mm(v.spec.dims_mm, [800, 600, 1200])
  const R = Math.min(L, W) * 0.5
  const bot = useRef<G>(null)
  const head = useRef<G>(null)
  const scan = useRef<G>(null)
  const eyes = useRef<(THREE.Mesh | null)[]>([])
  const eyeMat = useGlow('#e8fbff', 2.6)
  const ring = useGlow(accent, 1.6)
  const beam = useGlow(accent, 2.4)
  useTick((t) => {
    if (bot.current) {
      bot.current.position.x = Math.sin(t * 0.45) * R * 0.9
      bot.current.rotation.y = Math.cos(t * 0.45) * 0.25
      bot.current.position.y = Math.sin(t * 2.1) * 0.004
    }
    if (head.current) head.current.rotation.y = Math.sin(t * 0.8) * 0.55
    if (scan.current) scan.current.rotation.y = t * 3
    const blink = t % 3.6 < 0.12 ? 0.12 : 1
    eyes.current.forEach((m) => {
      if (m) m.scale.y = blink
    })
    ring.emissiveIntensity = 1.2 + 0.8 * (0.5 + 0.5 * Math.sin(t * 1.8))
  })
  // Egg body: radius at height y follows the ellipsoid, so the ring and the visor hug the shell.
  const cy = H * 0.5
  const ry = H * 0.36
  const rx = R * 0.82
  const shellAt = (y: number) => rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2))
  const waistY = H * 0.42
  const visorY = H * 0.63
  const visorR = shellAt(visorY) + 0.006
  const eyeR = visorR + 0.004
  return (
    <group ref={bot}>
      <BlobShadow w={R * 2.6} d={R * 2.6} />
      <mesh material={M.dark} position={[0, H * 0.075, 0]}>
        <cylinderGeometry args={[R * 0.92, R, H * 0.12, 48]} />
      </mesh>
      <mesh material={ring} position={[0, H * 0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[R * 0.99, 0.01, 8, 64]} />
      </mesh>
      <mesh material={M.shell2} position={[0, H * 0.15, 0]}>
        <cylinderGeometry args={[R * 0.72, R * 0.86, H * 0.05, 48]} />
      </mesh>
      <mesh material={M.shell} position={[0, cy, 0]} scale={[rx, ry, rx]}>
        <sphereGeometry args={[1, 48, 32]} />
      </mesh>
      <mesh material={paint(accent, 0.35, 0.1, 0.7)} position={[0, waistY, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[shellAt(waistY) + 0.004, 0.014, 10, 64]} />
      </mesh>
      <group ref={head}>
        <mesh material={M.glass} position={[0, visorY, 0]}>
          <cylinderGeometry args={[visorR, visorR, H * 0.12, 48, 1, true, Math.PI / 2 - 0.85, 1.7]} />
        </mesh>
        {[-1, 1].map((sd, i) => {
          const ang = Math.PI / 2 + sd * 0.26
          return (
            <mesh
              key={sd}
              ref={(m) => {
                eyes.current[i] = m
              }}
              material={eyeMat}
              position={[Math.sin(ang) * eyeR, visorY + H * 0.005, Math.cos(ang) * eyeR]}
              rotation={[0, ang, 0]}
            >
              <boxGeometry args={[R * 0.14, H * 0.045, 0.004]} />
            </mesh>
          )
        })}
        <mesh material={M.chrome} position={[0, cy + ry - 0.004, 0]}>
          <cylinderGeometry args={[R * 0.3, R * 0.34, 0.02, 32]} />
        </mesh>
        <mesh material={M.glass} position={[0, cy + ry + 0.006, 0]}>
          <sphereGeometry args={[R * 0.26, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <group ref={scan} position={[0, cy + ry + 0.05, 0]}>
          <mesh material={beam} position={[R * 0.1, 0, 0]}>
            <boxGeometry args={[R * 0.16, 0.012, 0.02]} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

/* Variant A: a universal mobile platform carrying a glass «function module» with a glowing core. */
function NeutralPlatform({ v, accent }: ModelProps) {
  const [L, W, H] = mm(v.spec.dims_mm, [1000, 700, 900])
  const baseH = Math.min(0.32, H * 0.3)
  const drive = useDrive()
  const core = useRef<THREE.Mesh>(null)
  const coreMat = useGlow(accent, 1.4)
  const T = 9
  const P = (1.2 * 6) / 1.5
  useTick((t) => {
    const c = Math.floor(t / T)
    drive.current.odo = c * P + P * seg(t % T, 0.5, 6.5)
    if (core.current) {
      core.current.rotation.y = t * 0.8
      core.current.rotation.x = t * 0.5
      core.current.position.y = Math.sin(t * 1.6) * 0.02
    }
    coreMat.emissiveIntensity = 1.1 + 0.7 * (0.5 + 0.5 * Math.sin(t * 2.2))
  })
  const glass = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#dcebf5',
        transparent: true,
        opacity: 0.28,
        roughness: 0.05,
        clearcoat: 1,
        depthWrite: false,
      }),
    [],
  )
  const modH = H - baseH - 0.08
  const midY = baseH + 0.04 + modH / 2
  return (
    <group>
      <Lane drive={drive} length={Math.max(L, 1) * 3.6} width={W * 1.8} />
      <BlobShadow w={L * 1.3} d={W * 1.35} />
      <AmrBody L={L} W={W} H={baseH} accent={accent} />
      <RoundedBox
        args={[L * 0.84, 0.04, W * 0.84]}
        radius={0.015}
        smoothness={2}
        position={[0, baseH + 0.02, 0]}
        material={M.dark}
      />
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} material={M.dark} position={[sx * L * 0.37, midY, sz * W * 0.37]}>
            <boxGeometry args={[0.035, modH, 0.035]} />
          </mesh>
        )),
      )}
      <RoundedBox
        args={[L * 0.8, 0.05, W * 0.8]}
        radius={0.02}
        smoothness={2}
        position={[0, H - 0.025, 0]}
        material={M.shell2}
      />
      <mesh material={glass} position={[0, midY, 0]}>
        <boxGeometry args={[L * 0.7, modH * 0.96, W * 0.7]} />
      </mesh>
      <group position={[0, midY, 0]}>
        <mesh ref={core} material={coreMat}>
          <icosahedronGeometry args={[Math.min(L, W, modH) * 0.2, 0]} />
        </mesh>
      </group>
      <Lidar pos={[L * 0.28, H, 0]} r={0.06} />
      <LedStrip size={[L * 0.6, 0.02, 0.006]} pos={[0, H - 0.025, W * 0.4 + 0.004]} color={accent} rate={1.2} />
    </group>
  )
}

/* Variant B: a friendly boxy helper on wheels with a face screen. */
function NeutralBuddy({ v, accent }: ModelProps) {
  const [L, W, H] = mm(v.spec.dims_mm, [700, 600, 900])
  const wr = H * 0.09
  const drive = useDrive()
  const body = useRef<G>(null)
  const look = useRef<G>(null)
  const antenna = useRef<G>(null)
  const eyes = useRef<(THREE.Mesh | null)[]>([])
  const eyeMat = useGlow('#8ff0ff', 2.6)
  const T = 8
  const P = (1.0 * 5) / 1.5
  useTick((t) => {
    const c = Math.floor(t / T)
    const p = t % T
    drive.current.odo = c * P + P * seg(p, 0.5, 5.5)
    const moving = seg(p, 0.5, 1.2) - seg(p, 4.8, 5.5)
    if (body.current) body.current.position.y = Math.abs(Math.sin(t * 7)) * 0.012 * moving
    if (look.current) look.current.position.z = Math.sin(t * 0.9) * W * 0.06 * (1 - moving)
    if (antenna.current) antenna.current.rotation.x = Math.sin(t * 6) * 0.12 * (0.3 + moving)
    const blink = t % 3.1 < 0.12 ? 0.12 : 1
    eyes.current.forEach((m) => {
      if (m) m.scale.y = blink
    })
  })
  const bodyY = wr * 1.5
  const bodyH = H - bodyY - 0.12
  const r = Math.min(L, W, bodyH) * 0.2
  const bodyMat = paint(accent, 0.35, 0.1, 0.7)
  return (
    <group>
      <Lane drive={drive} length={Math.max(L, 1) * 4} width={W * 2} />
      <BlobShadow w={L * 1.3} d={W * 1.35} />
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Wheel
            key={`${sx}${sz}`}
            r={wr}
            w={0.06}
            pos={[sx * L * 0.32, wr, sz * (W / 2 - 0.02)]}
            drive={drive}
            hub={accent}
          />
        )),
      )}
      <group ref={body}>
        <RoundedBox
          args={[L * 0.96, 0.06, W * 0.9]}
          radius={0.025}
          smoothness={2}
          position={[0, bodyY - 0.01, 0]}
          material={M.dark}
        />
        <RoundedBox
          args={[L, bodyH, W]}
          radius={r}
          smoothness={6}
          position={[0, bodyY + bodyH / 2, 0]}
          material={M.shell}
        />
        <RoundedBox
          args={[L * 1.004, bodyH * 0.12, W * 1.004]}
          radius={Math.min(r, bodyH * 0.05)}
          smoothness={3}
          position={[0, bodyY + bodyH * 0.1, 0]}
          material={bodyMat}
        />
        <RoundedBox
          args={[0.02, bodyH * 0.42, W - r * 2]}
          radius={0.008}
          smoothness={3}
          position={[L / 2 + 0.004, bodyY + bodyH * 0.6, 0]}
          material={M.glass}
        />
        <group ref={look} position={[L / 2 + 0.016, bodyY + bodyH * 0.63, 0]}>
          {[-1, 1].map((sd, i) => (
            <mesh
              key={sd}
              ref={(m) => {
                eyes.current[i] = m
              }}
              material={eyeMat}
              position={[0, 0, sd * W * 0.14]}
            >
              <boxGeometry args={[0.006, bodyH * 0.13, W * 0.1]} />
            </mesh>
          ))}
          <mesh material={eyeMat} position={[0, -bodyH * 0.12, 0]}>
            <boxGeometry args={[0.006, bodyH * 0.025, W * 0.16]} />
          </mesh>
        </group>
        <group ref={antenna} position={[-L * 0.15, bodyY + bodyH, 0]}>
          <mesh material={M.dark} position={[0, 0.07, 0]}>
            <cylinderGeometry args={[0.007, 0.009, 0.14, 8]} />
          </mesh>
          <mesh material={eyeMat} position={[0, 0.15, 0]}>
            <sphereGeometry args={[0.025, 14, 10]} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

/** Neutral robot: the design is picked by the gallery variant; catalog products get the first one. */
export function Neutral(props: ModelProps) {
  if (props.v.id === 'neutral-b') return <NeutralBuddy {...props} />
  if (props.v.id === 'neutral-c') return <NeutralCapsule {...props} />
  return <NeutralPlatform {...props} />
}

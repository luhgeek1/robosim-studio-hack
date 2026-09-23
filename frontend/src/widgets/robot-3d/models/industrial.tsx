import { RoundedBox } from '@react-three/drei'
import { useRef } from 'react'
import * as THREE from 'three'
import { BlobShadow, LedStrip, M, Pallet, paint, seg, useGlow, useTick } from '../kit'
import type { ModelProps, Variant } from '../types'

type G = THREE.Group

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

/** Planar two-link IK with the tool pointing straight down; elbow-up solution. */
function ik(r: number, y: number, L: ReturnType<typeof armLayout>) {
  const dx = r
  const dy = y + L.w - L.hS
  const d = Math.min(Math.hypot(dx, dy), L.a + L.b - 1e-3)
  const cosE = (d * d - L.a * L.a - L.b * L.b) / (2 * L.a * L.b)
  const e = Math.acos(Math.max(-1, Math.min(1, cosE)))
  const s = Math.atan2(dy, dx) + Math.atan2(L.b * Math.sin(e), L.a + L.b * Math.cos(e))
  return { s, e, wr: -Math.PI / 2 - (s - e) }
}

export function Arm({ v, accent }: ModelProps) {
  const L = armLayout(v)
  const { R, rb, hb, hS, a, b, w, th, box, pickR, beltTop } = L
  const yawA = -1.05
  const yawB = 1.05
  const hover = beltTop + box + R * 0.22
  const placeR = R * 0.6
  const slots = [
    [-0.53, -0.53],
    [0.53, -0.53],
    [-0.53, 0.53],
    [0.53, 0.53],
  ]
  const turret = useRef<G>(null)
  const shoulder = useRef<G>(null)
  const elbow = useRef<G>(null)
  const wrist = useRef<G>(null)
  const carried = useRef<THREE.Mesh>(null)
  const beltBox = useRef<G>(null)
  const placed = useRef<(THREE.Mesh | null)[]>([])
  const cup = useGlow('#ff7a45', 1.2)
  const T = 6.6
  useTick((t) => {
    const c = Math.floor(t / T)
    const p = t % T
    const k = c % 4
    const [sx, sz] = slots[k]
    // Target on the pallet in the arm's radial frame at yaw B.
    const placeY = 0.144 + box
    const down1 = seg(p, 0, 0.6) - seg(p, 0.9, 1.5)
    const down2 = seg(p, 3.2, 3.8) - seg(p, 4.1, 4.7)
    const swing = seg(p, 1.5, 3.2) - seg(p, 4.7, 6.3)
    const yaw = yawA + (yawB - yawA) * swing
    const rr = pickR + (placeR + sx * box * 1.05 - pickR) * swing
    const lateral = sz * box * 1.05 * swing
    const y = hover - down1 * (hover - (beltTop + box)) - down2 * (hover - placeY)
    const r = Math.hypot(rr, lateral)
    const yawAdj = yaw + Math.atan2(lateral, rr)
    const j = ik(r, y, L)
    if (turret.current) turret.current.rotation.y = -yawAdj
    if (shoulder.current) shoulder.current.rotation.z = j.s
    if (elbow.current) elbow.current.rotation.z = -j.e
    if (wrist.current) wrist.current.rotation.z = j.wr
    const holding = p > 0.75 && p < 3.95
    cup.color.set(holding ? '#35c27a' : '#ff7a45')
    cup.emissive.set(holding ? '#35c27a' : '#ff7a45')
    if (carried.current) carried.current.visible = holding
    const bb = beltBox.current
    if (bb) {
      bb.visible = !holding && (p < 0.75 || p > 5.2)
      bb.scale.setScalar(p > 5.2 ? Math.max(0.001, seg(p, 5.2, 5.9)) : 1)
    }
    placed.current.forEach((m, i) => {
      if (m) m.visible = i < k || (i === k && p >= 3.95)
    })
  })
  const linkMat = paint(accent, 0.35, 0.15, 0.6)
  const jointMat = M.dark
  const pallet: [number, number] = [Math.cos(yawB) * placeR, Math.sin(yawB) * placeR]
  const beltLen = R * 0.75
  return (
    <group>
      <BlobShadow w={rb * 3} d={rb * 3} />
      <group position={[pallet[0], 0, pallet[1]]} rotation={[0, -yawB, 0]}>
        <BlobShadow w={box * 3.2} d={box * 3.2} opacity={0.3} />
        <Pallet w={Math.max(1.2, box * 2.3)} d={Math.max(0.8, box * 2.3)} />
        {slots.map(([sx, sz], i) => (
          <mesh
            key={i}
            ref={(m) => {
              placed.current[i] = m
            }}
            material={M.carton}
            position={[sx * box * 1.05, 0.144 + box / 2, sz * box * 1.05]}
          >
            <boxGeometry args={[box * 0.98, box * 0.98, box * 0.98]} />
          </mesh>
        ))}
      </group>
      <group position={[Math.cos(yawA) * pickR, 0, Math.sin(yawA) * pickR]} rotation={[0, -yawA, 0]}>
        <mesh material={M.dark} position={[0, beltTop - 0.03, 0]}>
          <boxGeometry args={[box * 1.5, 0.06, beltLen]} />
        </mesh>
        <mesh material={M.rubber} position={[0, beltTop + 0.002, 0]}>
          <boxGeometry args={[box * 1.4, 0.004, beltLen]} />
        </mesh>
        <LedStrip size={[0.01, 0.015, beltLen * 0.9]} pos={[box * 0.76, beltTop - 0.03, 0]} color="#6be39a" />
        {[-1, 1].flatMap((sz) =>
          [-1, 1].map((sx) => (
            <mesh
              key={`${sx}${sz}`}
              material={M.steel}
              position={[sx * box * 0.6, (beltTop - 0.06) / 2, sz * beltLen * 0.42]}
            >
              <boxGeometry args={[0.04, beltTop - 0.06, 0.04]} />
            </mesh>
          )),
        )}
      </group>
      <mesh material={M.dark} position={[0, hb / 2, 0]}>
        <cylinderGeometry args={[rb * 1.1, rb * 1.25, hb, 40]} />
      </mesh>
      <group ref={turret}>
        <mesh material={linkMat} position={[0, hb + (hS - hb) / 2, 0]}>
          <cylinderGeometry args={[rb * 0.82, rb * 0.95, hS - hb, 36]} />
        </mesh>
        <group ref={shoulder} position={[0, hS, 0]}>
          <mesh material={jointMat} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[th * 1.05, th * 1.05, th * 2.3, 28]} />
          </mesh>
          <RoundedBox
            args={[a, th * 1.5, th * 1.5]}
            radius={th * 0.5}
            smoothness={4}
            position={[a / 2, 0, 0]}
            material={linkMat}
          />
          <group ref={elbow} position={[a, 0, 0]}>
            <mesh material={jointMat} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[th * 0.85, th * 0.85, th * 1.9, 28]} />
            </mesh>
            <RoundedBox
              args={[b, th * 1.1, th * 1.1]}
              radius={th * 0.45}
              smoothness={4}
              position={[b / 2, 0, 0]}
              material={linkMat}
            />
            <group ref={wrist} position={[b, 0, 0]}>
              <mesh material={jointMat} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[th * 0.6, th * 0.6, th * 1.3, 24]} />
              </mesh>
              <mesh material={M.steel} position={[w / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[th * 0.35, th * 0.45, w, 20]} />
              </mesh>
              <group position={[w, 0, 0]}>
                <mesh material={M.dark} position={[0.01, 0, 0]}>
                  <boxGeometry args={[0.02, box * 0.8, box * 0.8]} />
                </mesh>
                <mesh material={cup} position={[0.022, 0, 0]}>
                  <boxGeometry args={[0.004, box * 0.6, box * 0.6]} />
                </mesh>
                <mesh ref={carried} material={M.carton} position={[0.024 + box / 2, 0, 0]}>
                  <boxGeometry args={[box * 0.98, box * 0.98, box * 0.98]} />
                </mesh>
              </group>
            </group>
          </group>
        </group>
      </group>
      <group
        ref={beltBox}
        position={[Math.cos(yawA) * pickR, beltTop + box / 2, Math.sin(yawA) * pickR]}
        rotation={[0, -yawA, 0]}
      >
        <mesh material={M.carton}>
          <boxGeometry args={[box * 0.98, box * 0.98, box * 0.98]} />
        </mesh>
        <mesh material={M.tape} position={[0, box * 0.49, 0]}>
          <boxGeometry args={[box, 0.004, box * 0.2]} />
        </mesh>
      </group>
    </group>
  )
}

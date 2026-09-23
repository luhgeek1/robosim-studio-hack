import { RoundedBox } from '@react-three/drei'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
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
} from '../kit'
import { mm, type ModelProps, type Variant } from '../types'

type G = THREE.Group

/* ---------- Cab-less autonomous truck: pallet count follows payload ---------- */

export function Truck({ v, accent }: ModelProps) {
  const [L, W, H] = mm(v.spec.dims_mm, [5000, 1800, 2200])
  const speed = v.spec.speed_mps ?? 5
  const pallets = Math.max(2, Math.min(8, Math.round((v.spec.payload_kg ?? 2000) / 333)))
  const cols = Math.ceil(pallets / 2)
  const drive = useDrive()
  const body = useRef<G>(null)
  const blink = useGlow('#ffb020', 2)
  const headlight = useGlow('#fff6e0', 1.6)
  const T = 9
  const P = (speed * 7) / 1.5
  useTick((t) => {
    const c = Math.floor(t / T)
    const p = t % T
    drive.current.odo = c * P + P * seg(p, 0.5, 7.5)
    const moving = seg(p, 0.5, 1.5) - seg(p, 6.5, 7.5)
    if (body.current) {
      body.current.position.y = Math.sin(t * 11) * 0.006 * moving
      body.current.rotation.z =
        -0.012 * (seg(p, 0.5, 1.2) - seg(p, 1.2, 2.2)) + 0.012 * (seg(p, 6.8, 7.4) - seg(p, 7.4, 8.2))
    }
    blink.emissiveIntensity = Math.floor(t * 2.5) % 2 ? 2.5 : 0.1
  })
  const wr = 0.38
  const floorY = wr + 0.42
  const boxL = L * 0.64
  const boxX = -L / 2 + boxL / 2 + 0.05
  const boxH = H - floorY - 0.05
  const noseL = L - boxL - 0.12
  const noseX = L / 2 - noseL / 2
  const bodyMat = paint(accent, 0.3, 0.1, 0.8)
  const noseR = 0.28
  const faceW = W * 0.98 - noseR * 2 - 0.08
  const faceX = L / 2 + 0.012
  return (
    <group>
      <Lane drive={drive} length={L * 3} width={W * 1.8} />
      <BlobShadow w={L * 1.1} d={W * 1.3} />
      {[-L * 0.3, L * 0.3].flatMap((x) =>
        [-1, 1].map((s) => (
          <Wheel key={`${x}${s}`} r={wr} w={0.24} pos={[x, wr, s * (W / 2 - 0.1)]} drive={drive} hub={accent} />
        )),
      )}
      <group ref={body}>
        <RoundedBox
          args={[L * 0.98, 0.3, W * 0.9]}
          radius={0.08}
          smoothness={3}
          position={[0, wr + 0.2, 0]}
          material={M.dark}
        />
        <mesh material={M.shell2} position={[boxX, floorY - 0.02, 0]}>
          <boxGeometry args={[boxL, 0.04, W]} />
        </mesh>
        <RoundedBox
          args={[boxL, 0.06, W]}
          radius={0.025}
          smoothness={3}
          position={[boxX, floorY + boxH, 0]}
          material={M.shell}
        />
        <RoundedBox
          args={[0.06, boxH, W]}
          radius={0.025}
          smoothness={3}
          position={[-L / 2 + 0.08, floorY + boxH / 2, 0]}
          material={M.shell}
        />
        <mesh material={M.shell} position={[boxX, floorY + boxH / 2, -W / 2 + 0.02]}>
          <boxGeometry args={[boxL, boxH, 0.04]} />
        </mesh>
        {Array.from({ length: cols + 1 }, (_, i) => (
          <mesh
            key={i}
            material={M.steel}
            position={[-L / 2 + 0.1 + (boxL / cols) * i, floorY + boxH / 2, W / 2 - 0.02]}
          >
            <boxGeometry args={[0.05, boxH, 0.04]} />
          </mesh>
        ))}
        <mesh material={bodyMat} position={[boxX, floorY + boxH - 0.12, W / 2 - 0.01]}>
          <boxGeometry args={[boxL, 0.12, 0.02]} />
        </mesh>
        {Array.from({ length: pallets }, (_, i) => {
          const col = Math.floor(i / 2)
          const row = i % 2
          return (
            <group
              key={i}
              position={[-L / 2 + 0.1 + (boxL / cols) * (col + 0.5), floorY, (row - 0.5) * (W * 0.46)]}
              rotation={[0, Math.PI / 2, 0]}
            >
              <Pallet w={0.8} d={Math.min(1.2, boxL / cols - 0.1)} />
              <group position={[0, 0.144, 0]}>
                <Cartons w={0.76} d={Math.min(1.15, boxL / cols - 0.14)} h={Math.min(1.1, boxH - 0.3)} />
              </group>
            </group>
          )
        })}
        <RoundedBox
          args={[noseL, H - wr - 0.1, W * 0.98]}
          radius={noseR}
          smoothness={6}
          position={[noseX, wr + 0.05 + (H - wr - 0.1) / 2, 0]}
          material={bodyMat}
        />
        {/* Face parts sit just proud of the nose's flat front (radius 0.28 eats the edges) — flush faces z-fight. */}
        <RoundedBox
          args={[0.03, (H - wr) * 0.26, faceW]}
          radius={0.012}
          smoothness={3}
          position={[faceX, wr + (H - wr) * 0.63, 0]}
          material={M.glass}
        />
        <RoundedBox
          args={[0.02, (H - wr) * 0.2, faceW * 0.92]}
          radius={0.01}
          smoothness={3}
          position={[faceX - 0.004, wr + (H - wr) * 0.36, 0]}
          material={M.dark}
        />
        <LedStrip
          size={[0.012, 0.035, faceW * 0.6]}
          pos={[faceX + 0.008, wr + (H - wr) * 0.42, 0]}
          color="#e9f6ff"
          rate={0.7}
        />
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh
              material={headlight}
              position={[faceX + 0.008, wr + (H - wr) * 0.32, s * faceW * 0.36]}
              rotation={[0, 0, Math.PI / 2]}
            >
              <cylinderGeometry args={[0.07, 0.07, 0.012, 24]} />
            </mesh>
            <mesh material={blink} position={[faceX + 0.008, wr + (H - wr) * 0.32, s * faceW * 0.24]}>
              <boxGeometry args={[0.012, 0.05, 0.08]} />
            </mesh>
          </group>
        ))}
        <RoundedBox
          args={[noseL * 0.6, 0.08, W * 0.8]}
          radius={0.03}
          smoothness={3}
          position={[noseX, H + 0.02, 0]}
          material={M.dark}
        />
        <Lidar pos={[noseX + noseL * 0.2, H + 0.06, 0]} r={0.09} />
        {[-1, 1].map((s) => (
          <Lidar key={s} pos={[L / 2 - 0.25, wr + 0.36, s * (W / 2 + 0.02)]} r={0.06} />
        ))}
      </group>
    </group>
  )
}

/* ---------- Multirotor UAV: arm count and span follow the variant ---------- */

export function droneLayout(v: Variant) {
  const arms = 8
  const payload = v.spec.payload_kg ?? 30
  const armL = 0.3 + Math.sqrt(payload) * 0.1
  const hover = 1.9
  return { arms, payload, armL, hover }
}

function Rotor({ pos, r, dir }: { pos: [number, number, number]; r: number; dir: number }) {
  const blades = useRef<G>(null)
  useTick((t) => {
    if (blades.current) blades.current.rotation.y = t * 40 * dir
  })
  const disc = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#9aa6b2',
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  )
  return (
    <group position={pos}>
      <mesh material={M.dark} position={[0, -0.03, 0]}>
        <cylinderGeometry args={[r * 0.14, r * 0.16, 0.08, 20]} />
      </mesh>
      <group ref={blades} position={[0, 0.02, 0]}>
        <mesh material={M.dark}>
          <boxGeometry args={[r * 2, 0.008, r * 0.14]} />
        </mesh>
      </group>
      <mesh material={disc} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.021, 0]}>
        <circleGeometry args={[r, 40]} />
      </mesh>
    </group>
  )
}

export function Drone({ v, accent }: ModelProps) {
  const { arms, payload, armL, hover } = droneLayout(v)
  const craft = useRef<G>(null)
  const cable = useRef<THREE.Mesh>(null)
  const pod = useRef<G>(null)
  const shadow = useRef<G>(null)
  const nav = useGlow('#35c27a', 2.5)
  const navR = useGlow('#ff3b3b', 2.5)
  const podS = 0.22 + Math.cbrt(payload) * 0.07
  const T = 10
  useTick((t) => {
    const p = t % T
    const y = hover + Math.sin(t * 1.6) * 0.06
    if (craft.current) {
      craft.current.position.y = y
      craft.current.rotation.z = Math.sin(t * 0.9) * 0.05
      craft.current.rotation.x = Math.sin(t * 1.2) * 0.04
    }
    // Winch lowers the parcel almost to the ground, then reels it back in.
    const drop = seg(p, 2, 4.5) - seg(p, 6, 8.5)
    const len = 0.05 + drop * (y - 0.35 - podS)
    if (cable.current) {
      cable.current.scale.y = len
      cable.current.position.y = -0.1 - len / 2
    }
    if (pod.current) pod.current.position.y = -0.1 - len - podS / 2
    const blinkOn = t % 1.2 < 0.12
    nav.emissiveIntensity = blinkOn ? 4 : 1
    navR.emissiveIntensity = blinkOn ? 4 : 1
    if (shadow.current) shadow.current.scale.setScalar(1 + (y - hover) * 0.8)
  })
  const bodyMat = paint(accent, 0.35, 0.1, 0.7)
  const r = Math.min(armL * 0.62, (Math.PI * armL) / arms)
  return (
    <group>
      <group ref={shadow}>
        <BlobShadow w={armL * 2.4} d={armL * 2.4} opacity={0.2} />
      </group>
      <group ref={craft} position={[0, hover, 0]}>
        <RoundedBox
          args={[0.34 + armL * 0.2, 0.12, 0.26 + armL * 0.15]}
          radius={0.05}
          smoothness={4}
          material={M.shell}
        />
        <RoundedBox
          args={[0.2 + armL * 0.12, 0.06, 0.18 + armL * 0.1]}
          radius={0.025}
          smoothness={3}
          position={[0, 0.08, 0]}
          material={bodyMat}
        />
        <LedStrip size={[0.006, 0.02, 0.1]} pos={[0.17 + armL * 0.1, 0, 0]} color="#e9f6ff" rate={2} />
        {Array.from({ length: arms }, (_, i) => {
          const a = (i / arms) * Math.PI * 2 + Math.PI / arms
          const x = Math.cos(a) * armL
          const z = Math.sin(a) * armL
          return (
            <group key={i}>
              <mesh material={M.dark} position={[x / 2, 0.02, z / 2]} rotation={[0, -a, Math.PI / 2]}>
                <cylinderGeometry args={[0.018, 0.022, armL, 10]} />
              </mesh>
              <Rotor pos={[x, 0.07, z]} r={r} dir={i % 2 ? 1 : -1} />
              {i === 0 || i === arms - 1 ? (
                <mesh material={i === 0 ? nav : navR} position={[x, -0.02, z]}>
                  <sphereGeometry args={[0.018, 12, 10]} />
                </mesh>
              ) : null}
            </group>
          )
        })}
        {[-1, 1].map((s) => (
          <group key={s}>
            <mesh material={M.dark} position={[0, -0.2, s * 0.16]}>
              <boxGeometry args={[0.02, 0.28, 0.02]} />
            </mesh>
            <mesh material={M.dark} position={[0, -0.34, s * 0.16]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.012, 0.012, 0.5 + armL * 0.3, 10]} />
            </mesh>
          </group>
        ))}
        <mesh ref={cable} material={M.dark} position={[0, -0.1, 0]}>
          <cylinderGeometry args={[0.004, 0.004, 1, 6]} />
        </mesh>
        <group ref={pod}>
          <RoundedBox args={[podS * 1.3, podS, podS]} radius={0.03} smoothness={3} material={bodyMat} />
          <mesh material={M.shell} position={[0, podS / 2 + 0.005, 0]}>
            <boxGeometry args={[podS * 1.25, 0.01, podS * 0.3]} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

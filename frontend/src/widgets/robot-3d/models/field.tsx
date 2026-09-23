import { RoundedBox } from '@react-three/drei'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  Beacon,
  BlobShadow,
  FadeDisc,
  LedStrip,
  Lidar,
  M,
  Scroller,
  Wheel,
  paint,
  seg,
  useDrive,
  useGlow,
  useTick,
} from '../kit'
import { mm, type ModelProps } from '../types'

type G = THREE.Group

/* ---------- Marine: uncrewed catamaran on the water ---------- */

export function Marine({ v, accent }: ModelProps) {
  const [L, W, H] = mm(v.spec.dims_mm, [3000, 1400, 1100])
  const speed = v.spec.speed_mps ?? 2.5
  const drive = useDrive()
  const boat = useRef<G>(null)
  const radar = useRef<G>(null)
  const T = 10
  const P = (speed * 8) / 1.5
  useTick((t) => {
    const c = Math.floor(t / T)
    drive.current.odo = c * P + P * seg(t % T, 0.5, 8.5)
    if (boat.current) {
      boat.current.position.y = Math.sin(t * 1.4) * 0.03
      boat.current.rotation.z = Math.sin(t * 1.1) * 0.025
      boat.current.rotation.x = Math.sin(t * 0.9) * 0.03
    }
    if (radar.current) radar.current.rotation.y = t * 2.5
  })
  const r = Math.min(H * 0.16, W * 0.16)
  const hullZ = W * 0.34
  const deckY = r * 1.5
  const green = useGlow('#35c27a', 2.2)
  const red = useGlow('#ff3b3b', 2.2)
  const foam = paint('#f4f8fa', 0.9, 0, 0)
  return (
    <group>
      <FadeDisc w={L * 3.2} d={L * 2.4} color="#6fa9c2" opacity={0.75} />
      <Scroller drive={drive} span={L * 2.6} count={5} lanes={[-hullZ, hullZ]}>
        {(i) => (
          <mesh material={foam} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, (i % 3) * 0.08 - 0.08]}>
            <circleGeometry args={[0.12 + (i % 4) * 0.04, 10]} />
          </mesh>
        )}
      </Scroller>
      <group ref={boat}>
        {[-1, 1].map((s) => (
          <group key={s} position={[0, r * 0.45, s * hullZ]}>
            <mesh material={M.shell} rotation={[0, 0, Math.PI / 2]}>
              <capsuleGeometry args={[r, L - r * 2, 8, 20]} />
            </mesh>
            <mesh material={paint(accent, 0.35, 0.1, 0.7)} position={[0, r * 0.2, s * r * 0.98]}>
              <boxGeometry args={[L * 0.8, r * 0.25, 0.01]} />
            </mesh>
          </group>
        ))}
        <RoundedBox
          args={[L * 0.72, 0.08, W * 0.92]}
          radius={0.03}
          smoothness={3}
          position={[-L * 0.04, deckY, 0]}
          material={M.shell2}
        />
        <RoundedBox
          args={[L * 0.32, H * 0.32, W * 0.5]}
          radius={0.08}
          smoothness={4}
          position={[L * 0.06, deckY + H * 0.16 + 0.04, 0]}
          material={paint(accent, 0.35, 0.1, 0.7)}
        />
        <mesh material={M.glass} position={[L * 0.22 + 0.004, deckY + H * 0.22, 0]}>
          <boxGeometry args={[0.01, H * 0.1, W * 0.36]} />
        </mesh>
        <mesh material={M.dark} position={[-L * 0.08, deckY + H * 0.5, 0]}>
          <cylinderGeometry args={[0.025, 0.035, H * 0.62, 12]} />
        </mesh>
        <group ref={radar} position={[-L * 0.08, deckY + H * 0.8, 0]}>
          <mesh material={M.shell}>
            <boxGeometry args={[0.07, 0.05, W * 0.42]} />
          </mesh>
        </group>
        <Lidar pos={[L * 0.18, deckY + H * 0.32 + 0.04, 0]} r={0.07} />
        <mesh material={green} position={[L * 0.3, deckY + 0.06, hullZ]}>
          <sphereGeometry args={[0.03, 12, 10]} />
        </mesh>
        <mesh material={red} position={[L * 0.3, deckY + 0.06, -hullZ]}>
          <sphereGeometry args={[0.03, 12, 10]} />
        </mesh>
      </group>
    </group>
  )
}

/* ---------- Agro: cab-less autonomous tractor over crop rows ---------- */

export function Agro({ v, accent }: ModelProps) {
  const [L, W, H] = mm(v.spec.dims_mm, [2600, 1500, 1700])
  const speed = v.spec.speed_mps ?? 1.6
  const drive = useDrive()
  const tool = useRef<G>(null)
  const T = 10
  const P = (speed * 8) / 1.5
  useTick((t) => {
    const c = Math.floor(t / T)
    drive.current.odo = c * P + P * seg(t % T, 0.5, 8.5)
    if (tool.current) tool.current.position.y = Math.sin(t * 7) * 0.008
  })
  const rr = H * 0.34
  const fr = H * 0.21
  const bodyMat = paint(accent, 0.35, 0.1, 0.7)
  const leaf = paint('#5aa36b', 0.7, 0, 0.2)
  const leaf2 = paint('#7cbd6a', 0.7, 0, 0.2)
  return (
    <group>
      <FadeDisc w={L * 3.4} d={W * 2.6} color="#8a6a4c" opacity={0.85} />
      <Scroller drive={drive} span={L * 3} count={9} lanes={[-W * 0.62, 0, W * 0.62]}>
        {(i) => (
          <group>
            <mesh material={i % 2 ? leaf : leaf2} position={[0, 0.09, 0]}>
              <sphereGeometry args={[0.1, 10, 8]} />
            </mesh>
            <mesh material={leaf} position={[0.06, 0.06, 0.05]}>
              <sphereGeometry args={[0.07, 8, 6]} />
            </mesh>
          </group>
        )}
      </Scroller>
      <BlobShadow w={L * 1.2} d={W * 1.3} />
      <RoundedBox
        args={[L * 0.8, 0.22, 0.3]}
        radius={0.06}
        smoothness={3}
        position={[0, rr * 0.9, 0]}
        material={M.dark}
      />
      <RoundedBox
        args={[L * 0.42, H * 0.34, W * 0.42]}
        radius={0.12}
        smoothness={5}
        position={[L * 0.2, rr * 0.9 + H * 0.17, 0]}
        material={bodyMat}
      />
      <mesh material={M.dark} position={[L * 0.41 + 0.003, rr * 0.9 + H * 0.16, 0]}>
        <boxGeometry args={[0.01, H * 0.16, W * 0.3]} />
      </mesh>
      <LedStrip size={[0.012, 0.03, W * 0.3]} pos={[L * 0.415, rr * 0.9 + H * 0.28, 0]} color="#fff6e0" rate={0.7} />
      <RoundedBox
        args={[L * 0.3, H * 0.26, W * 0.62]}
        radius={0.1}
        smoothness={4}
        position={[-L * 0.14, rr + H * 0.12, 0]}
        material={bodyMat}
      />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Wheel r={rr} w={0.34} pos={[-L * 0.22, rr, s * (W / 2 - 0.17)]} drive={drive} hub={accent} />
          <Wheel r={fr} w={0.22} pos={[L * 0.3, fr, s * (W / 2 - 0.2)]} drive={drive} hub={accent} />
          <mesh material={M.dark} position={[-L * 0.1, (H + rr) / 2, s * W * 0.32]}>
            <boxGeometry args={[0.06, H - rr, 0.06]} />
          </mesh>
        </group>
      ))}
      <RoundedBox
        args={[0.14, 0.08, W * 0.7]}
        radius={0.03}
        smoothness={3}
        position={[-L * 0.1, H, 0]}
        material={M.dark}
      />
      <Lidar pos={[-L * 0.1, H + 0.04, 0]} r={0.07} />
      <Beacon pos={[-L * 0.1, H + 0.04, W * 0.28]} r={0.05} />
      <mesh material={M.shell} position={[-L * 0.1, H + 0.08, -W * 0.28]}>
        <cylinderGeometry args={[0.07, 0.05, 0.05, 20]} />
      </mesh>
      <group ref={tool} position={[-L * 0.48, 0, 0]}>
        <mesh material={bodyMat} position={[0, 0.42, 0]}>
          <boxGeometry args={[0.12, 0.1, W * 1.3]} />
        </mesh>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} material={M.steel} position={[-0.04, 0.24, (i - 3) * W * 0.18]} rotation={[0, 0, -0.25]}>
            <boxGeometry args={[0.04, 0.38, 0.03]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/* ---------- Construction: autonomous tandem road roller ---------- */

export function Roller({ v, accent }: ModelProps) {
  const [L, W, H] = mm(v.spec.dims_mm, [3800, 1700, 2600])
  const speed = v.spec.speed_mps ?? 1.2
  const drive = useDrive()
  const drums = useRef<(G | null)[]>([])
  const T = 12
  const P = (speed * 5) / 1.5
  const dr = Math.min(H * 0.24, L * 0.16)
  useTick((t) => {
    const p = t % T
    // Rollers work back and forth over the same stretch.
    drive.current.odo = P * (seg(p, 0.5, 5.5) - seg(p, 6.5, 11.5))
    drums.current.forEach((g) => {
      if (g) g.rotation.y = -drive.current.odo / dr
    })
  })
  const bodyMat = paint(accent, 0.35, 0.1, 0.7)
  const seam = paint('#8d9196', 0.9, 0, 0)
  return (
    <group>
      <FadeDisc w={L * 3.2} d={W * 2.2} color="#3b3f44" opacity={0.95} />
      <Scroller drive={drive} span={L * 2.8} count={6} lanes={[0]}>
        {() => (
          <mesh material={seam} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
            <planeGeometry args={[0.05, W * 1.2]} />
          </mesh>
        )}
      </Scroller>
      <BlobShadow w={L * 1.15} d={W * 1.3} />
      {[-1, 1].map((s, i) => (
        <group key={s} position={[s * (L / 2 - dr * 1.05), dr, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <group
            ref={(g) => {
              drums.current[i] = g
            }}
          >
            <mesh material={M.steel}>
              <cylinderGeometry args={[dr, dr, W * 0.92, 36]} />
            </mesh>
            <mesh material={M.dark}>
              <cylinderGeometry args={[dr * 0.55, dr * 0.55, W * 0.95, 6]} />
            </mesh>
          </group>
          <mesh material={bodyMat} position={[0, 0, 0]}>
            <boxGeometry args={[dr * 2.3, 0.06, 0.12]} />
          </mesh>
        </group>
      ))}
      {[-1, 1].map((s) => (
        <RoundedBox
          key={s}
          args={[dr * 2.4, dr * 0.5, W]}
          radius={0.08}
          smoothness={3}
          position={[s * (L / 2 - dr * 1.05), dr * 2.1, 0]}
          material={bodyMat}
        />
      ))}
      <RoundedBox
        args={[L - dr * 4.6, H * 0.34, W * 0.86]}
        radius={0.12}
        smoothness={4}
        position={[0, dr * 1.8, 0]}
        material={bodyMat}
      />
      <mesh material={M.dark} position={[-(L / 2 - dr * 2.4) + 0.004, dr * 1.8, 0]}>
        <boxGeometry args={[0.01, H * 0.2, W * 0.6]} />
      </mesh>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} material={M.dark} position={[sx * 0.4, (H + dr * 2.2) / 2, sz * W * 0.4]}>
            <boxGeometry args={[0.06, H - dr * 2.2, 0.06]} />
          </mesh>
        )),
      )}
      <RoundedBox args={[1.0, 0.08, W * 0.9]} radius={0.03} smoothness={3} position={[0, H, 0]} material={M.shell} />
      <Lidar pos={[0.3, H + 0.04, 0]} r={0.08} />
      <Beacon pos={[-0.3, H + 0.04, 0]} r={0.07} />
      <LedStrip size={[0.9, 0.03, 0.01]} pos={[0, H - 0.08, W * 0.45]} color="#ffb020" rate={2.2} />
    </group>
  )
}

/* ---------- Inspection: in-pipe crawler in a cut-away pipe ---------- */

export function PipeCrawler({ v, accent }: ModelProps) {
  const [L, W, H] = mm(v.spec.dims_mm, [600, 250, 250])
  const speed = v.spec.speed_mps ?? 0.25
  const drive = useDrive()
  const ring = useRef<THREE.Mesh>(null)
  const T = 9
  const P = Math.max(0.6, (speed * 7) / 1.5)
  const R = Math.max(W, H) * 0.95
  useTick((t) => {
    const c = Math.floor(t / T)
    drive.current.odo = c * P + P * seg(t % T, 0.5, 7.5)
    if (ring.current) {
      ring.current.position.x = L * 0.7 + Math.sin(t * 1.6) * L * 0.25
      ;(ring.current.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.3 * Math.sin(t * 6)
    }
  })
  const pipeLen = L * 6
  const pipeMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#9aa6b0', roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide }),
    [],
  )
  const ringMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#29d9e6', transparent: true, opacity: 0.6, toneMapped: false }),
    [],
  )
  const lights = useGlow('#fff6e0', 2.4)
  const cy = R
  return (
    <group>
      <BlobShadow w={pipeLen * 0.8} d={R * 2.6} opacity={0.25} />
      {/* Cut-away: the near-top quarter of the pipe is open so the crawler is visible. */}
      <mesh material={pipeMat} position={[0, cy, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[R, R, pipeLen, 48, 1, true, Math.PI * 0.35, Math.PI * 1.5]} />
      </mesh>
      <Scroller drive={drive} span={pipeLen * 0.9} count={4} lanes={[0]}>
        {() => (
          <mesh material={M.steel} position={[0, cy, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[R * 1.03, R * 1.03, 0.03, 48, 1, true, Math.PI * 0.35, Math.PI * 1.5]} />
          </mesh>
        )}
      </Scroller>
      <group position={[0, cy, 0]}>
        <mesh material={paint(accent, 0.35, 0.1, 0.7)} rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[R * 0.32, L * 0.7, 8, 20]} />
        </mesh>
        {[-0.3, 0.3].flatMap((x) =>
          [0, 1, 2].map((k) => {
            const a = (k / 3) * Math.PI * 2 + 0.5
            return (
              <group key={`${x}${k}`} position={[x * L, 0, 0]} rotation={[a, 0, 0]}>
                <mesh material={M.dark} position={[0, R * 0.55, 0]}>
                  <boxGeometry args={[0.03, R * 0.5, 0.03]} />
                </mesh>
                <Wheel r={R * 0.14} w={R * 0.12} pos={[0, R * 0.84, 0]} drive={drive} />
              </group>
            )
          }),
        )}
        <mesh material={M.glass} position={[L * 0.5, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[R * 0.22, R * 0.3, R * 0.2, 24]} />
        </mesh>
        <mesh material={lights} position={[L * 0.6 + 0.002, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <ringGeometry args={[R * 0.12, R * 0.2, 24]} />
        </mesh>
        <mesh ref={ring} material={ringMat} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[R * 0.97, 0.006, 8, 48]} />
        </mesh>
      </group>
    </group>
  )
}

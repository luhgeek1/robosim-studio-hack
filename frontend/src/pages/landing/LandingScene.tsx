import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Instance, Instances, Line, OrbitControls, OrthographicCamera, RoundedBox } from '@react-three/drei'
import { useReducedMotion } from 'framer-motion'
import { Group, MathUtils, PCFShadowMap, Quaternion, Vector3 } from 'three'
import type { ReactNode } from 'react'
import { SceneBoundary } from '@/shared/ui/boundary'

export type ObjectKind = 'warehouse' | 'hospital' | 'airport'
type Point = [number, number, number]
const ORANGE = '#cb865e'
const FLOOR_GRID: Point[] = [
  ...Array.from({ length: 14 }, (_, i): Point[] => [
    [i - 6.5, 0.013, -4.95],
    [i - 6.5, 0.013, 4.95],
  ]).flat(),
  ...Array.from({ length: 10 }, (_, i): Point[] => [
    [-6.65, 0.013, i - 4.5],
    [6.65, 0.013, i - 4.5],
  ]).flat(),
]

function Block({
  at,
  size,
  color = '#697278',
  glow = false,
}: {
  at: Point
  size: Point
  color?: string
  glow?: boolean
}) {
  if (!glow) return <Instance position={at} scale={size} color={color} />
  return (
    <mesh position={at} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={color}
        roughness={0.96}
        metalness={0}
        emissive={glow ? color : '#000000'}
        emissiveIntensity={glow ? 0.25 : 0}
      />
    </mesh>
  )
}

function Brace({ from, to }: { from: Point; to: Point }) {
  const direction = new Vector3(...to).sub(new Vector3(...from))
  const length = direction.length()
  const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize())
  return (
    <group position={new Vector3(...from).add(new Vector3(...to)).multiplyScalar(0.5)} quaternion={rotation}>
      <Block at={[0, 0, 0]} size={[0.045, length, 0.045]} color="#7c8b83" />
    </group>
  )
}

function Package({ at, size = 0.57 }: { at: Point; size?: number }) {
  const tapeThickness = 0.008
  return (
    <group position={at}>
      <Block at={[0, size / 2, 0]} size={[size, size, size * 0.8]} color="#b7a28a" />
      {/* The tape sits outside the carton; its top and front strips meet at the edge. */}
      <Block
        at={[0, size + tapeThickness / 2, tapeThickness / 2]}
        size={[size * 0.15, tapeThickness, size * 0.8 + tapeThickness]}
        color="#dfccb2"
      />
      <Block
        at={[size * 0.26, size * 0.45, size * 0.4 + 0.006]}
        size={[size * 0.25, size * 0.22, 0.01]}
        color="#d6d4c2"
      />
      <Block
        at={[0, size * 0.58, size * 0.4 + tapeThickness / 2]}
        size={[size * 0.15, size * 0.84, tapeThickness]}
        color="#dfccb2"
      />
    </group>
  )
}

function Rack({ at, index }: { at: Point; index: number }) {
  return (
    <group position={at}>
      {[-1.35, 1.35].flatMap((x) =>
        [-0.52, 0.52].map((z) => (
          <Block key={`${x}-${z}`} at={[x, 1.55, z]} size={[0.075, 3.1, 0.075]} color="#71848b" />
        )),
      )}
      {[-1.35, 1.35].map((x) => (
        <group key={x}>
          <Brace from={[x, 0.25, -0.52]} to={[x, 1.55, 0.52]} />
          <Brace from={[x, 1.55, 0.52]} to={[x, 2.98, -0.52]} />
          {[-0.52, 0.52].map((z) => (
            <Block key={z} at={[x, 0.05, z]} size={[0.21, 0.08, 0.22]} color="#a6aaa0" />
          ))}
        </group>
      ))}
      {[0.15, 1.13, 2.11, 3.09].map((y, level) => (
        <group key={y}>
          <Block at={[0, y, 0]} size={[2.82, 0.08, 1.13]} color="#606c73" />
          <Block at={[0, y - 0.05, (1.13 + 0.045) / 2]} size={[2.82, 0.12, 0.045]} color={ORANGE} />
          {level < 3 &&
            [-0.95, -0.27, 0.48].map((x, i) => (
              <group key={x} position={[x, y + 0.05, (i % 2) * 0.1 - 0.05]}>
                <Block at={[0, 0.045, 0]} size={[0.69, 0.09, 0.65]} color="#9b896e" />
                <Package at={[0, 0.1, 0]} size={0.49 + ((index + i + level) % 3) * 0.07} />
              </group>
            ))}
        </group>
      ))}
    </group>
  )
}

function Robot({
  path,
  offset,
  playing,
  tall = false,
}: {
  path: Point[]
  offset: number
  playing: boolean
  tall?: boolean
}) {
  const robot = useRef<Group>(null)
  const distance = useRef(offset * 4.3)
  const segments = useMemo(() => {
    let total = 0
    const ends: number[] = []
    for (let i = 0; i < path.length; i++) {
      const from = path[i]
      const to = path[(i + 1) % path.length]
      total += Math.hypot(to[0] - from[0], to[2] - from[2])
      ends.push(total)
    }
    return { ends, total }
  }, [path])
  useFrame((_, delta) => {
    if (!robot.current) return
    if (playing) distance.current += Math.min(delta, 0.05) * 1.4
    const progress = distance.current % segments.total
    const step = segments.ends.findIndex((end) => progress < end)
    const start = step === 0 ? 0 : segments.ends[step - 1]
    const from = path[step]
    const to = path[(step + 1) % path.length]
    const t = (progress - start) / (segments.ends[step] - start)
    robot.current.position.set(MathUtils.lerp(from[0], to[0], t), from[1], MathUtils.lerp(from[2], to[2], t))
    robot.current.rotation.y = Math.atan2(to[0] - from[0], to[2] - from[2])
  })
  return (
    <group ref={robot} position={path[Math.floor(offset) % path.length]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <circleGeometry args={[0.64, 32]} />
        <meshBasicMaterial color={ORANGE} transparent opacity={0.12} depthWrite={false} />
      </mesh>
      <RoundedBox
        args={[0.7, 0.24, 0.85]}
        radius={0.04}
        smoothness={3}
        position={[0, 0.25, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={ORANGE} roughness={1} metalness={0} />
      </RoundedBox>
      <Block at={[0, 0.12, 0]} size={[0.65, 0.13, 0.76]} color="#161b20" />
      <Block at={[0, 0.25, 0.432]} size={[0.48, 0.055, 0.015]} color="#b5f4ee" glow />
      <mesh position={[0, 0.4, 0.23]}>
        <cylinderGeometry args={[0.1, 0.1, 0.09, 16]} />
        <meshStandardMaterial color="#242e35" roughness={0.95} />
      </mesh>
      {tall ? (
        <>
          <Block at={[0, 0.85, -0.05]} size={[0.53, 1.05, 0.55]} color="#c9d5d8" />
          <Block at={[0, 1.18, 0.235]} size={[0.35, 0.15, 0.015]} color="#20383c" />
          <Block at={[0, 0.83, 0.235]} size={[0.36, 0.025, 0.015]} color="#78898d" />
          <Block at={[0, 0.59, 0.235]} size={[0.36, 0.025, 0.015]} color="#78898d" />
          <Block at={[-0.18, 1.02, 0.245]} size={[0.025, 0.15, 0.025]} color="#53625c" />
        </>
      ) : (
        <Package at={[0, 0.38, -0.08]} size={0.47} />
      )}
      {[-0.36, 0.36].map((x) => (
        <mesh key={x} position={[x, 0.14, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.12, 0.12, 0.07, 16]} />
          <meshStandardMaterial color="#13181b" roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

function Route({ points }: { points: Point[] }) {
  return (
    <Line
      points={[...points, points[0]]}
      color={ORANGE}
      lineWidth={1.1}
      transparent
      opacity={0.65}
      dashed
      dashSize={0.15}
      gapSize={0.14}
    />
  )
}

const ROUTES: Record<ObjectKind, Point[][]> = {
  warehouse: [
    [
      [-5.4, 0.04, 3.25],
      [5.3, 0.04, 3.25],
      [5.3, 0.04, 0.55],
      [-5.4, 0.04, 0.55],
    ],
    [
      [-5.4, 0.04, -1.65],
      [5.3, 0.04, -1.65],
      [5.3, 0.04, -4.05],
      [-5.4, 0.04, -4.05],
    ],
  ],
  hospital: [
    [
      [-5.3, 0.04, 0.3],
      [5.2, 0.04, 0.3],
      [5.2, 0.04, 3.35],
      [-5.3, 0.04, 3.35],
    ],
    [
      [-5.3, 0.04, 1.7],
      [5.2, 0.04, 1.7],
      [5.2, 0.04, 0.3],
      [-5.3, 0.04, 0.3],
    ],
  ],
  airport: [
    [
      [-5.2, 0.04, 3.4],
      [5.3, 0.04, 3.4],
      [5.3, 0.04, -1.5],
      [-5.2, 0.04, -1.5],
    ],
    [
      [-5.6, 0.04, 2.3],
      [5.3, 0.04, 2.3],
      [5.3, 0.04, -1.25],
      [-5.6, 0.04, -1.25],
    ],
  ],
}

function Floor({ children }: { children: ReactNode }) {
  return (
    <group>
      <RoundedBox args={[13.6, 0.32, 10.2]} radius={0.055} smoothness={3} position={[0, -0.19, 0]} receiveShadow>
        <meshStandardMaterial color="#36443f" roughness={1} />
      </RoundedBox>
      <Block at={[0, -0.015, 0]} size={[13.35, 0.04, 9.95]} color="#64706a" />
      <Line
        points={FLOOR_GRID}
        segments
        color="#95a194"
        lineWidth={0.55}
        transparent
        opacity={0.24}
        depthWrite={false}
      />
      <Block at={[0, 0.8, -4.95]} size={[13.4, 1.6, 0.12]} color="#929e91" />
      {/* Join the walls at z = -4.89 and place the trim above their top faces. */}
      <Block at={[-6.65, 0.8, -1.645]} size={[0.12, 1.6, 6.49]} color="#7d8d80" />
      <Block at={[0, 1.6 + 0.045 / 2, -4.95]} size={[13.4, 0.045, 0.14]} color="#c6d8d4" />
      <Block at={[-6.65, 1.6225, -1.645]} size={[0.14, 0.045, 6.49]} color="#bac5b6" />
      <Block at={[0, 0.09, -4.86]} size={[13.2, 0.18, 0.055]} color="#58685d" />
      <Block at={[-6.56, 0.09, -1.645]} size={[0.055, 0.18, 6.49]} color="#58685d" />
      {children}
      <Block at={[0, -0.2, 5.105]} size={[4, 0.04, 0.015]} color={ORANGE} glow />
      {[-5.5, 5.5].map((x) => (
        <group key={x} position={[x, 0, 4.3]}>
          <Block at={[0, 0.1, 0]} size={[0.7, 0.2, 0.65]} color="#28383b" />
          <Block at={[0, 0.35, -0.25]} size={[0.7, 0.3, 0.12]} color="#89989a" />
          <Block at={[0, 0.35, -0.18]} size={[0.36, 0.045, 0.02]} color="#a5efc2" glow />
        </group>
      ))}
    </group>
  )
}

function Warehouse() {
  return (
    <>
      {[-3.6, 0, 3.6].flatMap((x, i) =>
        [-2.8, -0.55].map((z, j) => <Rack key={`${x}-${z}`} at={[x, 0.03, z]} index={i + j} />),
      )}
      {[-3.4, 0, 3.4].map((x) => (
        <group key={x} position={[x, 0, -4.85]}>
          <Block at={[0, 0.65, 0.02]} size={[1.7, 1.3, 0.1]} color="#354448" />
          {[0.25, 0.5, 0.75, 1, 1.25].map((y) => (
            <Block key={y} at={[0, y, 0.08]} size={[1.65, 0.025, 0.01]} color="#718084" />
          ))}
        </group>
      ))}
      <Block at={[-1.4, 0.32, 4.05]} size={[2.6, 0.5, 0.65]} color="#91a09f" />
      {[-2.3, -1.6, -0.9].map((x) => (
        <Package key={x} at={[x, 0.58, 4.05]} size={0.35} />
      ))}
    </>
  )
}

function Hospital() {
  return (
    <>
      {[-4.7, -1.5, 1.7, 4.7].map((x) => (
        <group key={x} position={[x, 0, -2.7]}>
          <Block at={[-1.35, 0.85, 0]} size={[0.1, 1.7, 3.6]} color="#a9bebc" />
          {[-0.85, 0.85].map((z) => (
            <group key={z} position={[0, 0, z]}>
              <Block at={[0, 0.42, 0]} size={[1.9, 0.1, 0.87]} color="#6e817a" />
              {[-0.73, 0.73].flatMap((legX) =>
                [-0.32, 0.32].map((legZ) => (
                  <group key={`${legX}-${legZ}`} position={[legX, 0, legZ]}>
                    <Block at={[0, 0.25, 0]} size={[0.07, 0.36, 0.07]} color="#8d9c91" />
                    <mesh position={[0, 0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
                      <cylinderGeometry args={[0.085, 0.085, 0.06, 12]} />
                      <meshStandardMaterial color="#3c4943" roughness={1} />
                    </mesh>
                  </group>
                )),
              )}
              <RoundedBox
                args={[1.85, 0.18, 0.83]}
                radius={0.04}
                smoothness={2}
                position={[0, 0.55, 0]}
                castShadow
                receiveShadow
              >
                <meshStandardMaterial color="#dce1cf" roughness={1} />
              </RoundedBox>
              <Block at={[0.3, 0.66, 0]} size={[1.14, 0.035, 0.82]} color="#899f93" />
              <RoundedBox args={[0.4, 0.12, 0.64]} radius={0.04} smoothness={2} position={[-0.62, 0.69, 0]} castShadow>
                <meshStandardMaterial color="#e7e8db" roughness={1} />
              </RoundedBox>
              <Block at={[-0.98, 0.65, 0]} size={[0.07, 0.6, 0.88]} color="#9cb0a5" />
              <Block at={[0.98, 0.55, 0]} size={[0.07, 0.39, 0.88]} color="#9cb0a5" />
              {[-0.45, 0.45].map((side) => (
                <group key={side}>
                  <Block at={[-0.08, 0.8, side]} size={[1.2, 0.04, 0.04]} color="#b7c1b4" />
                  {[-0.65, 0.49].map((railX) => (
                    <Block key={railX} at={[railX, 0.67, side]} size={[0.035, 0.28, 0.035]} color="#b7c1b4" />
                  ))}
                </group>
              ))}
            </group>
          ))}
          <Block at={[0.2, 1.18, -2.12]} size={[1.55, 0.1, 0.08]} color="#c5cabc" />
          <Block at={[-0.53, 1.47, -2.06]} size={[0.43, 0.3, 0.08]} color="#536860" />
          <Block at={[-0.53, 1.47, -2.01]} size={[0.34, 0.21, 0.02]} color="#213a35" />
          <Line
            points={[
              [-0.67, 1.45, -1.994],
              [-0.59, 1.45, -1.994],
              [-0.56, 1.52, -1.994],
              [-0.52, 1.41, -1.994],
              [-0.48, 1.45, -1.994],
              [-0.4, 1.45, -1.994],
            ]}
            color="#afc7a8"
            lineWidth={1}
          />
        </group>
      ))}
      <Block at={[0, 0.6, 2.5]} size={[3.8, 1.2, 0.75]} color="#b2c5bc" />
      <Block at={[0, 1.24, 2.5]} size={[4, 0.12, 0.95]} color="#d5dfd3" />
      <Block at={[0.75, 1.47, 2.38]} size={[0.07, 0.39, 0.07]} color="#53685e" />
      <Block at={[0.75, 1.67, 2.38]} size={[0.66, 0.39, 0.06]} color="#42594e" />
      <Block at={[0.75, 1.67, 2.42]} size={[0.57, 0.3, 0.025]} color="#283e34" />
      <Block at={[-0.8, 1.33, 2.5]} size={[0.6, 0.08, 0.38]} color="#9fae9d" />
      <Block at={[-5.8, 1, -4.8]} size={[0.15, 0.7, 0.08]} color={ORANGE} />
      <Block at={[-5.8, 1, -4.8]} size={[0.6, 0.15, 0.1]} color={ORANGE} />
    </>
  )
}

function Airport() {
  const openingHeight = 3.15 - 0.35 / 2
  return (
    <>
      {[-2.8, 0.3].map((z) => (
        <group key={z} position={[-1.2, 0, z]}>
          <RoundedBox args={[7.3, 0.6, 1.25]} radius={0.3} smoothness={4} position={[0, 0.5, 0]} castShadow>
            <meshStandardMaterial color="#27383d" metalness={0} roughness={1} />
          </RoundedBox>
          <Block at={[0, 0.81, 0]} size={[6.55, 0.02, 0.9]} color="#526366" />
          {[-2.7, -1.35, 0, 1.35, 2.7].map((x) => (
            <group key={x}>
              <Block at={[x, 0.18, 0]} size={[0.12, 0.35, 1.05]} color="#60726a" />
              <Block at={[x, 0.83, 0]} size={[0.025, 0.015, 0.9]} color="#344844" />
            </group>
          ))}
          {[-0.57, 0.57].map((side) => (
            <Block key={side} at={[0, 0.86, side]} size={[6.6, 0.08, 0.055]} color="#a3b2a4" />
          ))}
          {[-2.5, -1.15, 0.5, 2.2].map((x, i) => (
            <group key={x} position={[x, 0, 0]}>
              <RoundedBox
                args={[0.55, 0.4, 0.7]}
                radius={0.045}
                smoothness={3}
                position={[0, 1.03, 0]}
                castShadow
                receiveShadow
              >
                <meshStandardMaterial color={i % 2 ? '#9cae9d' : '#b18b66'} roughness={0.95} />
              </RoundedBox>
              <Block at={[0, 1.25, 0]} size={[0.2, 0.055, 0.07]} color="#37473d" />
              <Block at={[0, 1.235, 0.15]} size={[0.58, 0.018, 0.035]} color="#d1c6a7" />
              <Block at={[0, 1.03, 0.355]} size={[0.58, 0.39, 0.025]} color="#d1c6a7" />
            </group>
          ))}
          {/* Separate posts leave the belt clear and end at the beam's underside. */}
          {[-0.76, 0.76].map((side) => (
            <Block key={side} at={[-3.5, openingHeight / 2, side]} size={[0.14, openingHeight, 0.16]} color="#a6b5b4" />
          ))}
          <Block at={[-3.5, 3.15, 0]} size={[0.5, 0.35, 1.68]} color="#354c50" />
        </group>
      ))}
      {[1.5, 3.4, 5.3].map((x) => (
        <group key={x}>
          <Block at={[x, 1, -4.3]} size={[1.4, 2, 0.6]} color="#8a9c9c" />
          <Block at={[x, 1.4, -3.98]} size={[1, 0.45, 0.025]} color="#203b42" />
          <Block at={[x, 0.65, -3.85]} size={[1, 0.15, 0.6]} color="#bec8c1" />
          <Block at={[x, 1.4, -3.96]} size={[0.75, 0.025, 0.025]} color="#a9b9a4" />
          <Block at={[x, 0.32, -3.98]} size={[0.85, 0.07, 0.04]} color="#4b6255" />
        </group>
      ))}
    </>
  )
}

export function ObjectModel({ kind, playing }: { kind: ObjectKind; playing: boolean }) {
  const paths = ROUTES[kind]
  return (
    <Instances limit={1400} castShadow receiveShadow frustumCulled={false}>
      <boxGeometry />
      <meshStandardMaterial roughness={0.96} metalness={0} />
      <Floor>
        {kind === 'warehouse' ? <Warehouse /> : kind === 'hospital' ? <Hospital /> : <Airport />}
        {paths.map((points, i) => (
          <Route key={`route-${i}`} points={points} />
        ))}
        {Array.from({ length: 4 }, (_, i) => (
          <Robot
            key={`${kind}-${i}`}
            path={paths[i % 2]}
            offset={i * 0.73}
            playing={playing}
            tall={kind === 'hospital'}
          />
        ))}
      </Floor>
    </Instances>
  )
}

export function SceneLighting() {
  return (
    <>
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#e5ecdd', '#34463c', 1.15]} />
      <directionalLight
        position={[-3, 12, 7]}
        intensity={2.7}
        color="#fff2df"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-normalBias={0.025}
        shadow-bias={-0.0002}
        shadow-radius={2}
      />
      <directionalLight position={[7, 6, -8]} intensity={0.85} color="#c1d3ca" />
    </>
  )
}

function CameraFit() {
  const size = useThree((state) => state.size)
  return (
    <OrthographicCamera
      makeDefault
      position={[17, 15, 21]}
      near={0.1}
      far={100}
      zoom={Math.min(size.width / 18.8, size.height / 14.7)}
    />
  )
}

export function SceneFallback() {
  return (
    <div className="landing-scene-fallback" aria-label="Схема роботизированного объекта">
      <svg viewBox="0 0 600 400" fill="none" aria-hidden="true">
        <path d="M50 225 300 85 555 225 305 370Z" fill="#465357" stroke="#728181" />
        {[0, 1, 2].flatMap((row) =>
          [0, 1, 2].map((col) => (
            <g key={`${row}-${col}`} transform={`translate(${170 + col * 71 - row * 38} ${150 + col * 40 + row * 23})`}>
              <path d="M0 0 53-30 76-17 23 13Z" fill="#9cafa9" />
              <path d="M0 0V-70L53-100V-30Z" fill="#7b8d8b" />
              <path d="M53-30V-100L76-87V-17Z" fill="#566b6c" />
              <path d="M0-20 53-50M0-45 53-75" stroke="#ff653b" strokeWidth="4" />
            </g>
          )),
        )}
        <path d="m120 260 180 100 200-115" stroke="#ff653b" strokeWidth="2" strokeDasharray="5 6" />
        <path d="m195 295 22-13 22 13-22 13Z" fill="#ff653b" />
      </svg>
    </div>
  )
}

function FloatingStage({ playing, children }: { playing: boolean; children: ReactNode }) {
  const stage = useRef<Group>(null)
  const time = useRef(0)
  useFrame((_, delta) => {
    if (!playing || !stage.current) return
    time.current += Math.min(delta, 0.05)
    stage.current.position.y = -0.5
    stage.current.rotation.y = Math.sin(time.current * 0.24) * 0.055
  })
  return (
    <group ref={stage} position={[0, -0.5, 0]}>
      {children}
    </group>
  )
}

export default function LandingScene({ kind, paused }: { kind: ObjectKind; paused: boolean }) {
  const reducedMotion = useReducedMotion()
  const container = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)
  const [pageVisible, setPageVisible] = useState(!document.hidden)
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    if (container.current) observer.observe(container.current)
    const onVisibility = () => setPageVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
  const playing = !paused && !reducedMotion && visible && pageVisible
  return (
    <div
      className="landing-canvas lp-preview-canvas"
      ref={container}
      aria-label="Интерактивная 3D-схема объекта. Поверните её мышью или пальцем."
    >
      <SceneBoundary fallback={<SceneFallback />}>
        <Canvas
          shadows={{ type: PCFShadowMap }}
          fallback={<SceneFallback />}
          dpr={[1.5, 2]}
          frameloop={playing ? 'always' : 'demand'}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        >
          <CameraFit />
          <SceneLighting />
          <FloatingStage playing={playing}>
            <ObjectModel kind={kind} playing={playing} />
          </FloatingStage>
          <OrbitControls
            makeDefault
            enableZoom={false}
            enablePan={false}
            enableDamping={!reducedMotion}
            rotateSpeed={0.65}
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI / 2.5}
            target={new Vector3(0, 0.5, 0)}
          />
        </Canvas>
      </SceneBoundary>
    </div>
  )
}

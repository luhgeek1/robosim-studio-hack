import { RoundedBox } from '@react-three/drei'
import { useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { useTick } from '../kit'
import type { ModelProps } from '../types'

// «Световой отбор» from the robot-lab tab, carried over as approved: same blocks, colours and cycle.

function Block({
  size,
  at = [0, 0, 0],
  color = '#f0f1ee',
  radius = 0.06,
}: {
  size: [number, number, number]
  at?: [number, number, number]
  color?: string
  radius?: number
}) {
  return (
    <RoundedBox args={size} position={at} radius={Math.min(radius, ...size.map((x) => x / 3))} smoothness={3}>
      <meshStandardMaterial color={color} roughness={0.32} metalness={0.18} />
    </RoundedBox>
  )
}

const DIGITS = ['1111110', '0110000', '1101101', '1111001']
const SEGMENTS: [number, number, number, number][] = [
  [0, 0.06, 0.055, 0.012],
  [0.032, 0.03, 0.012, 0.05],
  [0.032, -0.03, 0.012, 0.05],
  [0, -0.06, 0.055, 0.012],
  [-0.032, -0.03, 0.012, 0.05],
  [-0.032, 0.03, 0.012, 0.05],
  [0, 0, 0.055, 0.012],
]

function PickingCell({ index, clock, count }: { index: number; clock: RefObject<number>; count: number }) {
  const tray = useRef<THREE.Group>(null)
  const lights = useRef<THREE.Group>(null)
  const digit = useRef<THREE.Group>(null)
  const glow = useRef<THREE.MeshBasicMaterial>(null)
  useTick(() => {
    const phase = clock.current % 4.5
    const active = Math.floor(clock.current / 4.5) % count === index
    const confirmed = phase > 3.1
    if (tray.current)
      tray.current.position.z = active ? Math.sin(Math.PI * Math.min(1, Math.max(0, (phase - 0.6) / 3.4))) * 0.22 : 0
    if (lights.current) lights.current.visible = active
    if (glow.current) glow.current.color.set(confirmed ? '#48e4ab' : '#ffbb35')
    const amount = confirmed ? 0 : Math.max(1, 3 - Math.floor(phase))
    digit.current?.children.forEach((s, i) => {
      s.visible = active && DIGITS[amount][i] === '1'
    })
  })
  return (
    <group position={[((index % 3) - 1) * 0.67, 0.36 + Math.floor(index / 3) * 0.56, 0]}>
      <group ref={tray}>
        <Block size={[0.56, 0.06, 0.65]} at={[0, 0.07, 0]} color="#a9bdc5" />
        {[-1, 1].map((s) => (
          <Block key={s} size={[0.035, 0.26, 0.65]} at={[s * 0.265, 0.22, 0]} color="#c4d3d8" />
        ))}
        <Block size={[0.5, 0.26, 0.04]} at={[0, 0.22, -0.3]} color="#c4d3d8" />
        <Block size={[0.5, 0.12, 0.04]} at={[0, 0.13, 0.31]} color="#d8e2e4" />
        {[-0.13, 0.13].map((x) => (
          <Block key={x} size={[0.2, 0.22, 0.35]} at={[x, 0.21, 0]} color="#caa773" />
        ))}
      </group>
      <Block size={[0.57, 0.2, 0.055]} at={[0, -0.065, 0.49]} color="#22333d" />
      <group ref={digit} position={[-0.09, -0.065, 0.525]}>
        {SEGMENTS.map(([x, y, w, h], i) => (
          <mesh key={i} position={[x, y, 0]}>
            <boxGeometry args={[w, h, 0.006]} />
            <meshBasicMaterial color="#ffd26f" />
          </mesh>
        ))}
      </group>
      <mesh position={[0.17, -0.065, 0.525]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 0.016, 24]} />
        <meshStandardMaterial color="#647b83" />
      </mesh>
      <group ref={lights}>
        <mesh position={[0.17, -0.065, 0.539]}>
          <circleGeometry args={[0.04, 24]} />
          <meshBasicMaterial ref={glow} color="#ffbb35" toneMapped={false} />
        </mesh>
        {[
          [-0.3, 0.22, 0.025, 0.42],
          [0.3, 0.22, 0.025, 0.42],
          [0, 0.43, 0.62, 0.025],
          [0, 0.02, 0.62, 0.025],
        ].map(([x, y, w, h], i) => (
          <mesh key={i} position={[x, y, 0.39]}>
            <boxGeometry args={[w, h, 0.025]} />
            <meshBasicMaterial color="#ffbd38" toneMapped={false} />
          </mesh>
        ))}
        <pointLight position={[0, 0.25, 0.5]} color="#ffbb35" intensity={0.45} distance={0.85} />
      </group>
    </group>
  )
}

export const PICKING_ROWS = 3

export function LightPicking(_: ModelProps) {
  const clock = useRef(0)
  const rows = PICKING_ROWS
  const height = rows * 0.56 + 0.43
  useTick((t) => {
    clock.current = t
  })
  return (
    <group>
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <Block key={`${x}${z}`} size={[0.085, height, 0.085]} at={[x * 1.03, height / 2, z * 0.42]} color="#344854" />
        )),
      )}
      {Array.from({ length: rows }, (_, row) => (
        <Block key={row} size={[2.15, 0.06, 0.9]} at={[0, 0.36 + row * 0.56, 0]} color="#6e9b98" />
      ))}
      {Array.from({ length: rows * 3 }, (_, index) => (
        <PickingCell key={index} index={index} clock={clock} count={rows * 3} />
      ))}
      <Block size={[2.12, 0.2, 0.12]} at={[0, height - 0.06, 0.43]} color="#344854" />
      {[-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75].map((x) => (
        <Block key={x} size={[0.12, 0.04, 0.02]} at={[x, height - 0.06, 0.5]} color="#72d9c2" />
      ))}
    </group>
  )
}

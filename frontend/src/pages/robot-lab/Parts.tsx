import { RoundedBox } from '@react-three/drei'
import { useRef } from 'react'
import { Group } from 'three'
import { useFrame } from '@react-three/fiber'

export function Block({
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
    <RoundedBox
      args={size}
      position={at}
      radius={Math.min(radius, ...size.map((x) => x / 3))}
      smoothness={3}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={color} roughness={0.32} metalness={0.18} />
    </RoundedBox>
  )
}

export function Wheels({
  length = 1.2,
  width = 0.85,
  radius = 0.18,
  paused,
  speed,
}: {
  length?: number
  width?: number
  radius?: number
  paused: boolean
  speed: number
}) {
  const wheels = useRef<Group>(null)
  useFrame((_, dt) => {
    if (!paused)
      wheels.current?.children.forEach((w) => {
        w.rotation.z -= (Math.min(dt, 0.05) * speed) / radius
      })
  })
  return (
    <group ref={wheels}>
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <group key={`${x}${z}`} position={[(x * length) / 2, radius, (z * width) / 2]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[radius, radius, 0.12, 24]} />
              <meshStandardMaterial color="#232933" roughness={0.8} />
            </mesh>
            <mesh position={[0, 0, z * 0.07]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[radius * 0.58, radius * 0.58, 0.025, 6]} />
              <meshStandardMaterial color="#b1bac7" metalness={0.7} roughness={0.3} />
            </mesh>
          </group>
        )),
      )}
    </group>
  )
}

export function Sensor({ at = [0, 0, 0] }: { at?: [number, number, number] }) {
  return (
    <group position={at}>
      <mesh>
        <cylinderGeometry args={[0.11, 0.12, 0.13, 24]} />
        <meshStandardMaterial color="#24313c" metalness={0.5} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.113, 0.113, 0.025, 24]} />
        <meshStandardMaterial color="#6ce9de" emissive="#37bcac" emissiveIntensity={1.5} />
      </mesh>
    </group>
  )
}

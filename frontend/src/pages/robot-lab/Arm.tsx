import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Group } from 'three'
import { Block } from './Parts'
import type { MachineProps } from './Machines'

function Joint({ color }: { color: string }) {
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
      <cylinderGeometry args={[0.19, 0.19, 0.29, 32]} />
      <meshStandardMaterial color={color} metalness={0.5} roughness={0.25} />
    </mesh>
  )
}

export function Arm({ kind, heavy, color, paused, speed }: MachineProps) {
  const base = useRef<Group>(null)
  const elbow = useRef<Group>(null)
  const wrist = useRef<Group>(null)
  const t = useRef(0)
  const reach = heavy ? 1.05 : 0.72
  const pallet = kind === 'palletizing_arm'
  useFrame((_, dt) => {
    if (!paused) t.current += Math.min(dt, 0.05) * speed
    if (base.current) base.current.rotation.y = Math.sin(t.current * 0.7) * 0.7
    if (elbow.current) elbow.current.rotation.z = -0.8 + Math.sin(t.current) * 0.35
    if (wrist.current) wrist.current.rotation.z = -0.5 - Math.sin(t.current) * 0.35
  })
  return (
    <group>
      <Block size={[0.9, 0.16, 0.9]} at={[0, 0.08, 0]} color="#354553" />
      <Block size={[0.5, 0.4, 0.5]} at={[0, 0.35, 0]} color={color} />
      <group ref={base} position={[0, 0.58, 0]}>
        <Joint color="#647782" />
        <group rotation={[0, 0, 0.32]}>
          <Block size={[pallet ? 0.3 : 0.21, reach, 0.24]} at={[0, reach / 2, 0]} color={color} />
          <group ref={elbow} position={[0, reach, 0]}>
            <Joint color="#344753" />
            <Block size={[0.19, reach * 0.85, 0.21]} at={[0, reach * 0.425, 0]} />
            <group ref={wrist} position={[0, reach * 0.85, 0]}>
              <Joint color={color} />
              <Block size={[0.14, 0.27, 0.14]} at={[0, 0.15, 0]} color="#354553" />
              {pallet ? (
                <>
                  <Block size={[0.65, 0.09, 0.5]} at={[0, 0.35, 0]} color={color} />
                  <Block size={[0.55, 0.32, 0.4]} at={[0, 0.55, 0]} color="#c7aa80" />
                </>
              ) : (
                [-1, 1].map((s) => (
                  <Block key={s} size={[0.055, 0.23, 0.12]} at={[s * 0.12, 0.36, 0]} color="#889aa8" />
                ))
              )}
            </group>
          </group>
        </group>
      </group>
      <Block size={[0.65, 0.18, 0.7]} at={[1.15, 0.09, 0]} color={pallet ? '#bd9f74' : '#a9c3cc'} />
    </group>
  )
}

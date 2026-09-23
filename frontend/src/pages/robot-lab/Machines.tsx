import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'
import { Block, Sensor, Wheels } from './Parts'
import { LightPicking } from './LightPicking'
import { Inventory } from './Inventory'

export type MachineProps = { kind: string; color: string; heavy: boolean; paused: boolean; speed: number }

export function Machine({ kind, color, heavy, paused, speed }: MachineProps) {
  const moving = useRef<Group>(null)
  const clock = useRef(0)
  const lift = heavy ? 2.3 : 1.5
  useFrame((_, dt) => {
    if (!paused) clock.current += Math.min(dt, 0.05) * speed
    const g = moving.current
    if (!g) return
    const t = clock.current
    if (kind === 'fmr_forklift' || kind === 'asrs_storage')
      g.position.y = 0.25 + (0.5 + 0.5 * Math.sin(t)) * lift * 0.65
    else if (kind === 'delivery_robot') g.rotation.y = -Math.max(0, Math.sin(t)) * 1.15
    else if (kind === 'cleaning_robot') g.rotation.y = t * 5
    else if (kind === 'inventory_robot') g.position.y = 0.85 + (0.5 + 0.5 * Math.sin(t)) * lift * 0.65
    else g.rotation.y = Math.sin(t * 0.7) * 0.18
  })
  if (kind === 'pick_assist') return <LightPicking heavy={heavy} paused={paused} speed={speed} />
  if (kind === 'inventory_robot')
    return <Inventory kind={kind} color={color} heavy={heavy} paused={paused} speed={speed} />
  if (kind === 'asrs_storage')
    return (
      <group>
        {[-1, 1].flatMap((x) =>
          [-1, 1].map((z) => (
            <Block
              key={`${x}${z}`}
              size={[0.09, lift + 0.7, 0.09]}
              at={[x, (lift + 0.7) / 2, z * 0.4]}
              color="#344452"
            />
          )),
        )}
        {Array.from({ length: heavy ? 5 : 3 }, (_, i) => (
          <group key={i} position={[0, 0.25 + i * 0.5, 0]}>
            <Block size={[2.1, 0.055, 0.95]} color={color} />
            {[-0.65, 0, 0.65].map((x) => (
              <group key={x}>
                <Block size={[0.52, 0.34, 0.65]} at={[x, 0.2, 0]} color={i % 2 ? '#dce2e5' : '#b5c8d8'} />
              </group>
            ))}
          </group>
        ))}
        {kind === 'asrs_storage' && (
          <>
            <Block size={[0.1, lift + 0.8, 0.1]} at={[0, (lift + 0.8) / 2, 0.85]} color="#798996" />
            <group ref={moving}>
              <Block size={[0.7, 0.2, 0.8]} at={[0, 0, 0.75]} color={color} />
              <Block size={[0.4, 0.27, 0.4]} at={[0, 0.23, 0.75]} />
            </group>
          </>
        )}
      </group>
    )
  const truck = kind === 'autonomous_truck'
  const tow = kind === 'tow_tractor'
  const len = truck ? 2.3 : 1.1
  return (
    <group>
      <Wheels length={len * 0.72} width={0.87} radius={truck ? 0.26 : 0.17} paused={paused} speed={speed} />
      <Block size={[len, 0.3, 0.85]} at={[0, 0.35, 0]} color="#303b48" />
      <Block size={[len * 0.97, 0.25, 0.88]} at={[0, 0.53, 0]} color={color} />
      <Sensor at={[-len * 0.35, 0.75, 0]} />
      {kind === 'fmr_forklift' && (
        <>
          <Block size={[0.6, 0.55, 0.8]} at={[-0.2, 0.83, 0]} />
          {[-0.32, 0.32].map((z) => (
            <Block key={z} size={[0.1, lift + 0.5, 0.1]} at={[0.55, (lift + 0.5) / 2, z]} color="#445160" />
          ))}
          <group ref={moving}>
            <Block size={[0.12, 0.4, 0.82]} at={[0.64, 0.2, 0]} color="#93a3b2" />
            {[-0.27, 0.27].map((z) => (
              <Block key={z} size={[1, 0.065, 0.14]} at={[1.08, 0.02, z]} color="#93a3b2" />
            ))}
          </group>
        </>
      )}
      {truck && (
        <>
          <Block size={[0.65, 0.8, 0.88]} at={[-0.78, 0.95, 0]} />
          <Block size={[0.66, 0.34, 0.89]} at={[-0.79, 1.1, 0]} color="#263b4c" />
          <Block size={[1.5, heavy ? 1.2 : 0.65, 0.96]} at={[0.38, heavy ? 1.17 : 0.89, 0]} color="#dee3e7" />
          <Sensor at={[-0.8, 1.45, 0]} />
        </>
      )}
      {tow && (
        <>
          <Block size={[0.65, 0.55, 0.7]} at={[0, 0.9, 0]} />
          <group ref={moving}>
            {Array.from({ length: heavy ? 2 : 1 }, (_, i) => (
              <group key={i} position={[1.5 + i * 1.3, 0, 0]}>
                <Block size={[0.6, 0.07, 0.07]} at={[-0.72, 0.3, 0]} color="#576572" />
                <Wheels length={0.65} width={0.7} paused={paused} speed={speed} radius={0.13} />
                <Block size={[1, 0.09, 0.85]} at={[0, 0.35, 0]} />
                <Block size={[0.85, 0.55, 0.7]} at={[0, 0.67, 0]} color="#cab697" />
              </group>
            ))}
          </group>
        </>
      )}
      {kind === 'inventory_robot' && (
        <>
          <Block size={[0.16, lift, 0.16]} at={[0, lift / 2 + 0.6, 0]} color="#b6c2ce" />
          <group ref={moving}>
            <Block size={[0.42, 0.24, 0.3]} color={color} />
            <Block size={[0.43, 0.1, 0.18]} at={[0, 0, 0.12]} color="#162a35" />
            <Sensor at={[0, 0.2, 0]} />
          </group>
        </>
      )}
      {kind === 'cleaning_robot' && (
        <>
          <Block size={[0.9, heavy ? 0.85 : 0.6, 0.78]} at={[0, 0.9, 0]} />
          <Block size={[0.35, 0.14, 0.6]} at={[-0.25, 1.25, 0]} color="#233342" />
          <group position={[0.45, 0.11, 0]}>
            <group ref={moving}>
              {[-0.25, 0.25].map((z) => (
                <mesh key={z} position={[0, 0, z]}>
                  <cylinderGeometry args={[0.24, 0.26, 0.1, 24]} />
                  <meshStandardMaterial color={color} />
                </mesh>
              ))}
              <Block size={[0.65, 0.03, 0.06]} color="#263643" />
            </group>
          </group>
          <Block size={[0.12, 0.12, 1]} at={[-0.65, 0.12, 0]} color="#374754" />
        </>
      )}
      {kind === 'delivery_robot' && (
        <>
          <Block size={[0.82, 1.15, 0.75]} at={[0, 1.18, 0]} />
          {Array.from({ length: heavy ? 3 : 2 }, (_, i) => (
            <Block key={i} size={[0.72, 0.025, 0.78]} at={[0, 0.75 + i * 0.32, 0]} color="#a1afbb" />
          ))}
          <group ref={moving} position={[-0.4, 0.8, 0.4]}>
            <Block size={[0.8, 0.8, 0.05]} at={[0.4, 0.4, 0]} color={color} />
            <Block size={[0.2, 0.045, 0.04]} at={[0.62, 0.5, 0.035]} color="#e9edef" />
          </group>
          <Block size={[0.56, 0.2, 0.06]} at={[0, 1.65, 0.4]} color="#253846" />
        </>
      )}
      {kind === 'service_robot' && (
        <>
          <Block size={[0.4, 0.65, 0.4]} at={[0, 0.97, 0]} />
          <group ref={moving} position={[0, 1.5, 0]}>
            <Block size={[0.75, 0.5, 0.38]} />
            <Block size={[0.62, 0.32, 0.03]} at={[0, 0, 0.2]} color="#233847" />
            {[-0.17, 0.17].map((x) => (
              <Block key={x} size={[0.1, 0.055, 0.02]} at={[x, 0.04, 0.22]} color="#8ce0d8" />
            ))}
          </group>
          <Signal at={[0, 1, 0.22]} offset={0} paused={paused} />
          <Greeting paused={paused} color={color} />
        </>
      )}
    </group>
  )
}

function Greeting({ paused, color }: { paused: boolean; color: string }) {
  const arm = useRef<Group>(null)
  const time = useRef(0)
  useFrame((_, dt) => {
    if (!paused) time.current += dt
    if (arm.current) arm.current.rotation.z = -0.6 + Math.sin(time.current * 2) * 0.35
  })
  return (
    <group ref={arm} position={[0.32, 1.12, 0]}>
      <Block size={[0.14, 0.58, 0.18]} at={[0.13, 0.15, 0]} color={color} />
    </group>
  )
}

function Signal({ at, offset, paused }: { at: [number, number, number]; offset: number; paused: boolean }) {
  const ref = useRef<Group>(null)
  const t = useRef(0)
  useFrame((_, dt) => {
    if (!paused) t.current += dt
    if (ref.current) ref.current.scale.setScalar(0.8 + 0.2 * Math.sin(t.current * 3 + offset))
  })
  return (
    <group ref={ref} position={at}>
      <mesh>
        <boxGeometry args={[0.2, 0.055, 0.025]} />
        <meshStandardMaterial color="#65e4c8" emissive="#20c1aa" emissiveIntensity={2} />
      </mesh>
    </group>
  )
}

import { useLayoutEffect, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line, RoundedBox } from '@react-three/drei'
import { Color, Group, InstancedMesh, Object3D } from 'three'
import { RobotModel } from '../landing-cinematic/RobotModel'
import { ContactShade } from './ContactShade'
import { blend, type ImmersiveSignal } from './scene-state'

type Block = { at: [number, number, number]; size: [number, number, number]; color?: string }
const steel: Block[] = []
const cargo: Block[] = []
const shelves: Block[] = []
for (const x of [-8, 8]) {
  for (const z of [-12, -5, 2]) {
    for (const dx of [-1.65, 1.65]) {
      for (const dz of [-2.7, 0, 2.7]) {
        steel.push({ at: [x + dx, 3.3, z + dz], size: [0.15, 6.6, 0.15] })
      }
    }
    for (const y of [0.4, 2.45, 4.5, 6.55]) {
      shelves.push({ at: [x, y, z], size: [3.5, 0.14, 5.7] })
      for (const dx of [-1.7, 1.7]) {
        steel.push({ at: [x + dx, y, z], size: [0.11, 0.22, 5.65], color: '#b96d46' })
      }
      if (y > 6) continue
      for (const dz of [-1.9, 0, 1.9]) {
        cargo.push({ at: [x, y + 0.19, z + dz], size: [2.75, 0.22, 1.5], color: '#887353' })
        for (const dx of [-0.72, 0.72]) {
          const height = 1.1 + ((z + dz + y + 20) % 0.4)
          cargo.push({
            at: [x + dx, y + 0.3 + height / 2, z + dz],
            size: [1.33, height, 1.35],
            color: dx < 0 ? '#b6ac90' : '#d0c4a7',
          })
          cargo.push({
            at: [x + dx, y + 0.31 + height, z + dz],
            size: [0.1, 0.012, 1.36],
            color: '#dfd3b8',
          })
        }
      }
    }
  }
}

function Blocks({ items, color, metal = 0 }: { items: Block[]; color: string; metal?: number }) {
  const meshRef = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const object = new Object3D()
    items.forEach((item, index) => {
      object.position.set(...item.at)
      object.scale.set(...item.size)
      object.updateMatrix()
      mesh.setMatrixAt(index, object.matrix)
      mesh.setColorAt(index, new Color(item.color ?? color))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [items, color])
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, items.length]} castShadow receiveShadow>
      <boxGeometry />
      <meshStandardMaterial roughness={metal ? 0.38 : 0.86} metalness={metal} />
    </instancedMesh>
  )
}

function Architecture({ signalRef }: { signalRef: RefObject<ImmersiveSignal> }) {
  const shellRef = useRef<Group>(null)
  useFrame(() => {
    if (!shellRef.current) return
    const reveal = blend(signalRef.current.progress, 0.12, 0.48)
    shellRef.current.position.setY(reveal * 24)
    shellRef.current.visible = reveal < 0.99
  })
  return (
    <group ref={shellRef}>
      <mesh position={[0, 4.5, -17]} receiveShadow>
        <boxGeometry args={[28, 9, 0.35]} />
        <meshStandardMaterial color="#78837a" roughness={0.85} />
      </mesh>
      {[-14, 14].map((x) => (
        <mesh key={x} position={[x, 4.5, 0]} receiveShadow>
          <boxGeometry args={[0.3, 9, 34]} />
          <meshStandardMaterial color="#52635b" roughness={0.85} />
        </mesh>
      ))}
      {[-14, -6, 2, 10].map((z) => (
        <group key={z}>
          <mesh position={[0, 8.7, z]} castShadow>
            <boxGeometry args={[28, 0.65, 0.32]} />
            <meshStandardMaterial color="#53665d" metalness={0.6} roughness={0.4} />
          </mesh>
          {[-12, 12].map((x) => (
            <mesh key={x} position={[x, 4.4, z]} castShadow>
              <boxGeometry args={[0.45, 8.8, 0.45]} />
              <meshStandardMaterial color="#687c70" metalness={0.45} roughness={0.4} />
            </mesh>
          ))}
          {[-4, 4].map((x) => (
            <mesh key={x} position={[x, 8.5, z]}>
              <boxGeometry args={[0.25, 0.06, 5]} />
              <meshStandardMaterial color="#f5f4ef" emissive="#fff3d9" emissiveIntensity={3} />
            </mesh>
          ))}
        </group>
      ))}
      {[-10, -5, 0, 5, 10].map((x) => (
        <mesh key={x} position={[x, 9, 0]}>
          <boxGeometry args={[0.18, 0.22, 34]} />
          <meshStandardMaterial color="#5e7065" metalness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 9.35, 0]}>
        <boxGeometry args={[28, 0.12, 34]} />
        <meshStandardMaterial color="#31453a" />
      </mesh>
    </group>
  )
}

export function Warehouse({ signalRef }: { signalRef: RefObject<ImmersiveSignal> }) {
  const routeRef = useRef<Group>(null)
  const robotRef = useRef<Group>(null)
  useFrame(() => {
    const p = signalRef.current.progress
    if (routeRef.current) routeRef.current.scale.setScalar(blend(p, 0.32, 0.52))
    if (robotRef.current) robotRef.current.position.set(2.7, 0.015, 7 - blend(p, 0.25, 0.67) * 7)
  })
  return (
    <>
      <mesh position={[0, -0.15, -1]} receiveShadow>
        <boxGeometry args={[28, 0.3, 36]} />
        <meshStandardMaterial color="#768077" roughness={0.67} metalness={0.18} />
      </mesh>
      {[-12, -6, 0, 6, 12].map((x) => (
        <Line
          key={x}
          points={[
            [x, 0.006, -18],
            [x, 0.006, 17],
          ]}
          color="#58655d"
          lineWidth={0.5}
        />
      ))}
      {[-14, -8, -2, 4, 10, 16].map((z) => (
        <Line
          key={z}
          points={[
            [-14, 0.006, z],
            [14, 0.006, z],
          ]}
          color="#58655d"
          lineWidth={0.5}
        />
      ))}
      <Blocks items={steel} color="#344b40" metal={0.65} />
      <Blocks items={shelves} color="#455b4f" metal={0.35} />
      <Blocks items={cargo} color="#bcae94" />
      <Architecture signalRef={signalRef} />
      {[-4.8, 4.8].map((x) => (
        <Line
          key={x}
          points={[
            [x, 0.02, -16],
            [x, 0.02, 14],
          ]}
          color="#e0cf95"
          lineWidth={1.8}
        />
      ))}
      <group ref={robotRef} position={[2.7, 0.015, 7]} scale={0.64} rotation={[0, -0.23, 0]}>
        <ContactShade />
        <RobotModel />
      </group>
      <group ref={routeRef} scale={0}>
        <Line
          points={[
            [2.7, 0.05, 13],
            [2.7, 0.05, -14],
            [-3, 0.05, -14],
            [-3, 0.05, 10],
          ]}
          color="#ff9568"
          lineWidth={3}
        />
        <Line
          points={[
            [2.7, 0.05, 13],
            [2.7, 0.05, -14],
            [-3, 0.05, -14],
            [-3, 0.05, 10],
          ]}
          color="#ff6b42"
          lineWidth={15}
          transparent
          opacity={0.12}
        />
        {[-12, -5, 2].map((z) => (
          <Line
            key={z}
            points={[
              [2.7, 0.05, z],
              [5.8, 0.05, z],
            ]}
            color="#c8d9bd"
            lineWidth={1.5}
            dashed
            dashSize={0.3}
            gapSize={0.2}
          />
        ))}
      </group>
      {[-9, -6, -3].map((x) => (
        <group key={x} position={[x, 0, 14]}>
          <RoundedBox args={[1.5, 1.1, 0.6]} radius={0.06} position={[0, 0.55, 0]} castShadow>
            <meshStandardMaterial color="#2f4238" metalness={0.5} roughness={0.4} />
          </RoundedBox>
          <mesh position={[0, 0.8, 0.31]}>
            <boxGeometry args={[0.7, 0.045, 0.03]} />
            <meshStandardMaterial color="#c5d4a8" emissive="#c5d4a8" emissiveIntensity={0.8} />
          </mesh>
        </group>
      ))}
    </>
  )
}

import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'
import { Group } from 'three'
import { smooth, type SceneSignal } from './scene-state'

export function RobotModel({ signalRef }: { signalRef?: RefObject<SceneSignal> }) {
  const lidRef = useRef<Group>(null)
  const rotorRef = useRef<Group>(null)
  useFrame(() => {
    const p = signalRef?.current.progress ?? 0
    if (lidRef.current) lidRef.current.position.setY(0.92 + Math.sin(smooth(p, 0.04, 0.3) * Math.PI) * 0.8)
    if (rotorRef.current) rotorRef.current.rotation.set(0, p * 15, 0)
  })
  return (
    <group>
      <RoundedBox args={[3.65, 0.42, 2.65]} position={[0, 0.32, 0]} radius={0.19} smoothness={5} castShadow>
        <meshStandardMaterial color="#282c2a" roughness={0.65} />
      </RoundedBox>
      <RoundedBox args={[3.55, 0.64, 2.55]} position={[0, 0.7, 0]} radius={0.2} smoothness={6} castShadow>
        <meshPhysicalMaterial color="#ec5831" roughness={0.28} metalness={0.3} clearcoat={0.65} />
      </RoundedBox>
      {[-1, 1].flatMap((side) =>
        [-1, 1].map((end) => (
          <group key={side + ':' + end} position={[end * 1.12, 0.31, side * 1.27]} rotation={[Math.PI / 2, 0, 0]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.31, 0.31, 0.22, 32]} />
              <meshStandardMaterial color="#181a19" roughness={0.9} />
            </mesh>
            <mesh>
              <cylinderGeometry args={[0.19, 0.19, 0.235, 24]} />
              <meshStandardMaterial color="#b6b7ad" metalness={0.85} roughness={0.25} />
            </mesh>
            <mesh>
              <cylinderGeometry args={[0.07, 0.07, 0.25, 16]} />
              <meshStandardMaterial color="#373d36" metalness={0.65} roughness={0.3} />
            </mesh>
          </group>
        )),
      )}
      <group ref={lidRef} position={[0, 0.92, 0]}>
        <RoundedBox args={[2.85, 0.16, 2.15]} radius={0.12} smoothness={4} castShadow>
          <meshStandardMaterial color="#eee9df" metalness={0.35} roughness={0.3} />
        </RoundedBox>
        <mesh position={[0, 0.11, 0]}>
          <cylinderGeometry args={[0.87, 0.87, 0.06, 64]} />
          <meshStandardMaterial color="#30362f" metalness={0.6} roughness={0.28} />
        </mesh>
        <mesh position={[0, 0.15, 0]}>
          <cylinderGeometry args={[0.65, 0.65, 0.05, 64]} />
          <meshStandardMaterial color="#bdc0b5" metalness={0.85} roughness={0.21} />
        </mesh>
        <group ref={rotorRef} position={[0, 0.2, 0]}>
          {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle) => (
            <mesh key={angle} position={[Math.cos(angle) * 0.42, 0, Math.sin(angle) * 0.42]} rotation={[0, -angle, 0]}>
              <boxGeometry args={[0.3, 0.015, 0.08]} />
              <meshStandardMaterial color="#4c534a" />
            </mesh>
          ))}
        </group>
        {[-1, 1].flatMap((x) =>
          [-1, 1].map((z) => (
            <mesh key={x + ':' + z} position={[x * 1.2, 0.09, z * 0.85]}>
              <cylinderGeometry args={[0.045, 0.045, 0.02, 6]} />
              <meshStandardMaterial color="#50564e" metalness={0.9} roughness={0.2} />
            </mesh>
          )),
        )}
      </group>
      {[-1, 1].map((end) => (
        <group key={end} position={[end * 1.79, 0.63, 0]}>
          <RoundedBox args={[0.04, 0.15, 1.7]} radius={0.015} smoothness={3}>
            <meshStandardMaterial color="#222620" />
          </RoundedBox>
          <mesh position={[end * 0.025, 0.02, 0]}>
            <boxGeometry args={[0.01, 0.035, 1.25]} />
            <meshStandardMaterial color="#e9f1dc" emissive="#f4fce0" emissiveIntensity={2} />
          </mesh>
          {[-0.92, 0.92].map((z) => (
            <mesh key={z} position={[0.025 * end, -0.01, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.075, 0.075, 0.035, 24]} />
              <meshStandardMaterial color="#121712" metalness={0.5} roughness={0.15} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[1.24, 1.08, 0]}>
        <cylinderGeometry args={[0.18, 0.2, 0.22, 32]} />
        <meshStandardMaterial color="#242b26" metalness={0.7} roughness={0.18} />
      </mesh>
      <mesh position={[1.24, 1.12, 0]}>
        <cylinderGeometry args={[0.185, 0.185, 0.025, 32]} />
        <meshStandardMaterial color="#d9fa96" emissive="#9df331" emissiveIntensity={0.6} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side} position={[0, 0.7, side * 1.29]}>
          {[-0.5, -0.35, -0.2, -0.05, 0.1].map((x) => (
            <mesh key={x} position={[x, 0, 0]}>
              <boxGeometry args={[0.045, 0.18, 0.014]} />
              <meshStandardMaterial color="#9c3820" />
            </mesh>
          ))}
          <mesh position={[0.83, 0, 0]}>
            <boxGeometry args={[0.48, 0.1, 0.02]} />
            <meshStandardMaterial color="#e7e8db" metalness={0.45} roughness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

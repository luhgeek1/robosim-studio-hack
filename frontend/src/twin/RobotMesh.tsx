import { RoundedBox } from '@react-three/drei'
import { C } from './palette'

export function RobotMesh({ loaded, active, selected }: { loaded: boolean; active: boolean; selected: boolean }) {
  return (
    <group scale={1.8}>
      <RoundedBox args={[1.7, 0.42, 1.15]} radius={0.12} smoothness={4} position={[0, 0.3, 0]} castShadow>
        <meshStandardMaterial color={selected ? '#1d3fb5' : C.route} roughness={0.45} metalness={0.05} />
      </RoundedBox>
      <mesh position={[0, 0.53, 0]}>
        <boxGeometry args={[1.5, 0.05, 1.0]} />
        <meshStandardMaterial color="#e9edf9" roughness={0.6} />
      </mesh>
      <mesh position={[0.86, 0.3, 0]}>
        <boxGeometry args={[0.05, 0.16, 0.7]} />
        <meshStandardMaterial color="#111318" roughness={0.3} />
      </mesh>
      <mesh position={[-0.7, 0.58, 0.42]}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshStandardMaterial
          color={active ? '#35c27a' : '#d18a1f'}
          emissive={active ? '#35c27a' : '#d18a1f'}
          emissiveIntensity={1.2}
        />
      </mesh>
      {loaded && (
        <group position={[0, 0.56, 0]}>
          <mesh position={[0, 0.07, 0]} castShadow>
            <boxGeometry args={[1.25, 0.13, 1.0]} />
            <meshStandardMaterial color={C.pallet} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.55, 0]} castShadow>
            <boxGeometry args={[1.1, 0.82, 0.9]} />
            <meshStandardMaterial color={C.box} roughness={0.85} />
          </mesh>
        </group>
      )}
    </group>
  )
}

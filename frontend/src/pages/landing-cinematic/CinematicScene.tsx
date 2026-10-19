import { useEffect, useRef, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, Line, RoundedBox } from '@react-three/drei'
import { Color, Group, MathUtils, MeshStandardMaterial, PCFSoftShadowMap, Vector3 } from 'three'
import { RobotModel } from './RobotModel'
import { WarehouseSet } from './WarehouseSet'
import { smooth, type SceneSignal } from './scene-state'

type SceneProps = {
  signalRef: RefObject<SceneSignal>
  invalidateRef: RefObject<(() => void) | null>
  onReady: () => void
  onFailure: () => void
}

const ROUTE: [number, number, number][] = [
  [-9, 0.07, 8],
  [9, 0.07, 8],
  [9, 0.07, 2.5],
  [-9, 0.07, 2.5],
  [-9, 0.07, -2.5],
  [9, 0.07, -2.5],
  [9, 0.07, -8],
  [-9, 0.07, -8],
  [-9, 0.07, 8],
]
const lightFloor = new Color('#d5d1c6')
const darkFloor = new Color('#1c2925')
const lookAt = new Vector3()

function FleetRobot({ index, signalRef }: { index: number; signalRef: RefObject<SceneSignal> }) {
  const groupRef = useRef<Group>(null)
  useFrame(() => {
    if (!groupRef.current) return
    const p = signalRef.current.progress
    const travel = (index * 1.31 + smooth(p, 0.53, 1) * 5) % (ROUTE.length - 1)
    const a = ROUTE[Math.floor(travel)],
      b = ROUTE[Math.floor(travel) + 1]
    groupRef.current.position.set(MathUtils.lerp(a[0], b[0], travel % 1), 0.03, MathUtils.lerp(a[2], b[2], travel % 1))
    groupRef.current.rotation.set(0, -Math.atan2(b[2] - a[2], b[0] - a[0]), 0)
    groupRef.current.scale.setScalar(smooth(p, 0.48, 0.65) * 0.36)
  })
  return (
    <group ref={groupRef}>
      <RobotModel />
    </group>
  )
}

function World({ signalRef, invalidateRef, onReady, onFailure }: SceneProps) {
  const heroRef = useRef<Group>(null)
  const warehouseRef = useRef<Group>(null)
  const foundationRef = useRef<Group>(null)
  const routeRef = useRef<Group>(null)
  const floorRef = useRef<MeshStandardMaterial>(null)
  const pedestalRef = useRef<Group>(null)
  const readyRef = useRef(false)
  const { invalidate, gl } = useThree()
  useEffect(() => {
    invalidateRef.current = invalidate
    const fail = (event: Event) => {
      event.preventDefault()
      onFailure()
    }
    gl.domElement.addEventListener('webglcontextlost', fail)
    return () => {
      invalidateRef.current = null
      gl.domElement.removeEventListener('webglcontextlost', fail)
    }
  }, [invalidate, invalidateRef, gl, onFailure])
  useFrame(({ camera, size }) => {
    const p = signalRef.current.progress
    const build = smooth(p, 0.2, 0.48)
    const orbit = smooth(p, 0.46, 0.91)
    const angle = MathUtils.lerp(0.72, -0.65, orbit) + signalRef.current.yaw * (1 - build)
    const distance = MathUtils.lerp(size.width < 700 ? 8.8 : 7.8, 30, build)
    camera.position.set(Math.sin(angle) * distance, MathUtils.lerp(3.9, 26, build), Math.cos(angle) * distance)
    lookAt.set(0, MathUtils.lerp(0.25, 0.9, build), 0)
    camera.lookAt(lookAt)
    if (heroRef.current) {
      heroRef.current.scale.setScalar(1 - smooth(p, 0.16, 0.32))
      heroRef.current.rotation.set(0, MathUtils.lerp(-0.1, 0.8, smooth(p, 0, 0.22)), 0)
    }
    if (pedestalRef.current) pedestalRef.current.scale.setScalar(1 - smooth(p, 0.25, 0.5))
    if (warehouseRef.current) {
      warehouseRef.current.visible = build > 0.005
      warehouseRef.current.scale.setScalar(build)
    }
    if (foundationRef.current) foundationRef.current.scale.setScalar(build)
    if (routeRef.current) routeRef.current.scale.setScalar(smooth(p, 0.45, 0.57))
    floorRef.current?.color.copy(lightFloor).lerp(darkFloor, smooth(p, 0.56, 0.8))
    if (!readyRef.current) {
      readyRef.current = true
      requestAnimationFrame(onReady)
    }
  })
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[-8, 16, 10]}
        intensity={2.5}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-17}
        shadow-camera-right={17}
        shadow-camera-top={17}
        shadow-camera-bottom={-17}
        shadow-normalBias={0.035}
      />
      <directionalLight position={[12, 8, -8]} intensity={1.2} color="#fff1d6" />
      <Environment resolution={128} frames={1}>
        <Lightformer
          form="rect"
          intensity={3}
          position={[0, 8, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[12, 12, 1]}
        />
        <Lightformer form="rect" intensity={2} position={[-6, 3, 3]} rotation={[0, Math.PI / 2, 0]} scale={[4, 7, 1]} />
        <Lightformer form="rect" intensity={4} position={[4, 1, -5]} scale={[8, 0.5, 1]} />
      </Environment>
      <group ref={heroRef}>
        <RobotModel signalRef={signalRef} />
      </group>
      <group ref={pedestalRef}>
        <mesh position={[0, -0.22, 0]} receiveShadow>
          <cylinderGeometry args={[3.05, 3.15, 0.4, 96]} />
          <meshStandardMaterial color="#d9d6cb" metalness={0.24} roughness={0.5} />
        </mesh>
        <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[2.55, 2.56, 96]} />
          <meshBasicMaterial color="#a8a997" />
        </mesh>
        <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[3.12, 3.15, 96]} />
          <meshBasicMaterial color="#df5936" />
        </mesh>
      </group>
      <group ref={foundationRef}>
        <RoundedBox args={[22, 0.6, 20]} radius={0.16} position={[0, -0.35, 0]} smoothness={3} receiveShadow>
          <meshStandardMaterial ref={floorRef} color="#d5d1c6" metalness={0.15} roughness={0.55} />
        </RoundedBox>
        {[-9, -3, 3, 9].map((x) => (
          <Line
            key={x}
            points={[
              [x, 0.015, -9.4],
              [x, 0.015, 9.4],
            ]}
            color="#9caa90"
            lineWidth={0.7}
          />
        ))}
        {[-6, 0, 6].map((x) => (
          <group key={x} position={[x, 0, -9]}>
            <RoundedBox args={[1.6, 1.15, 0.55]} radius={0.08} position={[0, 0.58, 0]}>
              <meshStandardMaterial color="#3d4d43" metalness={0.4} roughness={0.4} />
            </RoundedBox>
            <mesh position={[0, 0.9, 0.28]}>
              <boxGeometry args={[0.7, 0.05, 0.02]} />
              <meshStandardMaterial color="#c9f99b" emissive="#c9f99b" emissiveIntensity={0.8} />
            </mesh>
          </group>
        ))}
      </group>
      <group ref={warehouseRef}>
        <WarehouseSet />
      </group>
      <group ref={routeRef}>
        <Line points={ROUTE} color="#c4f58c" lineWidth={2.4} />
        <Line points={ROUTE} color="#c4f58c" lineWidth={12} transparent opacity={0.12} />
      </group>
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <FleetRobot key={index} index={index} signalRef={signalRef} />
      ))}
    </>
  )
}

export default function CinematicScene(props: SceneProps) {
  return (
    <Canvas
      camera={{ position: [6, 5, 6], fov: 39, near: 0.1, far: 150 }}
      dpr={[1, 1.5]}
      shadows={{ type: PCFSoftShadowMap }}
      frameloop="demand"
      gl={{ alpha: true, antialias: true }}
    >
      <World {...props} />
    </Canvas>
  )
}

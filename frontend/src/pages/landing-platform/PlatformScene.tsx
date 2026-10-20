import { useEffect, useRef, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, Line, RoundedBox } from '@react-three/drei'
import { Group, MathUtils, PCFSoftShadowMap, Vector3 } from 'three'
import { WarehouseSet } from '../landing-cinematic/WarehouseSet'
import { RobotModel } from '../landing-cinematic/RobotModel'

export type StageMotion = { progress: number; plan: boolean }
type Props = { motion: RefObject<StageMotion>; plan: boolean; playing: boolean; onFailure: () => void }
const route: [number, number, number][] = [
  [-9, 0.1, 8],
  [9, 0.1, 8],
  [9, 0.1, 2.5],
  [-9, 0.1, 2.5],
  [-9, 0.1, -2.5],
  [9, 0.1, -2.5],
  [9, 0.1, -8],
  [-9, 0.1, -8],
  [-9, 0.1, 8],
]
const target = new Vector3(0, -1, 0)

function MovingRobot({ index, playing }: { index: number; playing: boolean }) {
  const ref = useRef<Group>(null)
  const time = useRef(index * 1.31)
  useFrame((_, delta) => {
    if (!ref.current) return
    if (playing) time.current += Math.min(delta, 0.05) * 0.17
    const t = time.current % (route.length - 1)
    const a = route[Math.floor(t)],
      b = route[Math.floor(t) + 1]
    ref.current.position.set(MathUtils.lerp(a[0], b[0], t % 1), 0.04, MathUtils.lerp(a[2], b[2], t % 1))
    ref.current.rotation.y = -Math.atan2(b[2] - a[2], b[0] - a[0])
  })
  return (
    <group ref={ref} scale={0.34}>
      <RobotModel />
    </group>
  )
}

function World({ motion, plan, playing, onFailure }: Props) {
  const { camera, gl, size, invalidate } = useThree()
  const pan = useRef(0)
  useEffect(() => {
    invalidate()
  }, [invalidate, plan, playing])
  useEffect(() => {
    const fail = (event: Event) => {
      event.preventDefault()
      onFailure()
    }
    gl.domElement.addEventListener('webglcontextlost', fail)
    return () => gl.domElement.removeEventListener('webglcontextlost', fail)
  }, [gl, onFailure])
  useFrame((_, delta) => {
    const destination = motion.current.plan ? 1 : motion.current.progress * 0.28
    pan.current = playing ? MathUtils.damp(pan.current, destination, 6, Math.min(delta, 0.05)) : destination
    const p = pan.current
    const angle = 0.68 - p * 0.45
    const distance = size.width / size.height < 1.3 ? 38 : 34
    camera.position.set(
      Math.sin(angle) * distance * (1 - p * 0.88),
      27 + p * 13,
      Math.cos(angle) * distance * (1 - p * 0.88),
    )
    camera.lookAt(target)
  })
  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight
        position={[-10, 18, 12]}
        intensity={2}
        color="#fff3dc"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-normalBias={0.04}
      />
      <directionalLight position={[12, 9, -10]} intensity={1.2} color="#c7deee" />
      <Environment resolution={128} frames={1}>
        <Lightformer
          form="rect"
          intensity={3}
          position={[0, 10, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[20, 20, 1]}
        />
        <Lightformer form="rect" intensity={2} position={[4, 4, 8]} scale={[12, 2, 1]} />
      </Environment>
      <RoundedBox args={[23.5, 0.65, 21.5]} radius={0.16} position={[0, -0.4, 0]} receiveShadow>
        <meshStandardMaterial color="#b7bcb5" roughness={0.66} metalness={0.15} />
      </RoundedBox>
      <mesh position={[0, -0.76, 0]}>
        <boxGeometry args={[23.2, 0.12, 21.2]} />
        <meshStandardMaterial color="#4b5852" />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => i * 2 - 11).map((x) => (
        <Line
          key={x}
          points={[
            [x, -0.065, -10.5],
            [x, -0.065, 10.5],
          ]}
          color="#8b9991"
          lineWidth={0.5}
        />
      ))}
      {Array.from({ length: 11 }, (_, i) => i * 2 - 10).map((z) => (
        <Line
          key={z}
          points={[
            [-11.5, -0.065, z],
            [11.5, -0.065, z],
          ]}
          color="#8b9991"
          lineWidth={0.5}
        />
      ))}
      <WarehouseSet />
      <Line points={route} color="#f47c4b" lineWidth={2.5} />
      <Line points={route} color="#f6a775" lineWidth={9} transparent opacity={0.14} />
      {[-6, 0, 6].map((x) => (
        <group key={x} position={[x, 0, -9.5]}>
          <RoundedBox args={[1.8, 1, 0.5]} radius={0.06} position={[0, 0.5, 0]}>
            <meshStandardMaterial color="#46524b" metalness={0.45} roughness={0.35} />
          </RoundedBox>
          <mesh position={[0, 0.73, 0.26]}>
            <boxGeometry args={[0.8, 0.05, 0.02]} />
            <meshStandardMaterial color="#d0eea0" emissive="#b4df7d" emissiveIntensity={0.6} />
          </mesh>
          <Line
            points={[
              [-1.2, 0.02, 0.3],
              [-1.2, 0.02, 1.5],
              [1.2, 0.02, 1.5],
              [1.2, 0.02, 0.3],
            ]}
            color="#e1e0ca"
            lineWidth={1}
          />
        </group>
      ))}
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <MovingRobot key={index} index={index} playing={playing} />
      ))}
    </>
  )
}

export default function PlatformScene(props: Props) {
  return (
    <Canvas
      camera={{ position: [20, 24, 26], fov: 36, near: 0.1, far: 150 }}
      dpr={[1, 1.5]}
      shadows={{ type: PCFSoftShadowMap }}
      frameloop={props.playing ? 'always' : 'demand'}
      gl={{ alpha: true, antialias: true }}
    >
      <World {...props} />
    </Canvas>
  )
}

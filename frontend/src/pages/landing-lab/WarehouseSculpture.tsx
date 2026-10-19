import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Line, OrthographicCamera } from '@react-three/drei'
import { Group, MathUtils, PCFShadowMap } from 'three'
import { SceneBoundary } from '@/shared/ui/boundary'

type Point = [number, number, number]
const ROUTE: Point[] = [
  [-7, 0.12, 4],
  [7, 0.12, 4],
  [7, 0.12, 0],
  [-7, 0.12, 0],
  [-7, 0.12, -4],
  [7, 0.12, -4],
]

function Block({ at, size, color = '#d5d0c5' }: { at: Point; size: Point; color?: string }) {
  return (
    <mesh position={at} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.72} metalness={0.08} />
    </mesh>
  )
}

function Rack({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {[-1.65, 1.65].flatMap((a) =>
        [-0.52, 0.52].map((b) => <Block key={`${a}-${b}`} at={[a, 1.4, b]} size={[0.07, 2.8, 0.07]} color="#6e716b" />),
      )}
      {[0.2, 1.1, 2].map((y) => (
        <group key={y}>
          <Block at={[0, y, 0]} size={[3.4, 0.09, 1.2]} color="#a3a69d" />
          <Block at={[0, y, 0.61]} size={[3.4, 0.1, 0.04]} color="#f24a24" />
          {[-1.1, 0, 1.1].map((a) => (
            <group key={a}>
              <Block at={[a, y + 0.38, 0]} size={[0.84, 0.66, 0.88]} color="#eee8dc" />
              <Block at={[a, y + 0.72, 0]} size={[0.1, 0.015, 0.9]} color="#c1b59e" />
            </group>
          ))}
        </group>
      ))}
    </group>
  )
}

function Carrier({ offset, moving }: { offset: number; moving: boolean }) {
  const robotRef = useRef<Group>(null)
  const elapsedRef = useRef(offset)
  useFrame((_, delta) => {
    if (!robotRef.current) return
    if (moving) elapsedRef.current += Math.min(delta, 0.05) * 0.12
    const progress = elapsedRef.current % (ROUTE.length - 1)
    const index = Math.floor(progress)
    const from = ROUTE[index],
      to = ROUTE[index + 1]
    robotRef.current.position.set(
      MathUtils.lerp(from[0], to[0], progress % 1),
      0.25,
      MathUtils.lerp(from[2], to[2], progress % 1),
    )
    robotRef.current.rotation.set(0, Math.atan2(to[0] - from[0], to[2] - from[2]), 0)
  })
  return (
    <group ref={robotRef}>
      <Block at={[0, 0, 0]} size={[0.75, 0.3, 0.95]} color="#f24a24" />
      <Block at={[0, -0.13, 0]} size={[0.66, 0.15, 0.86]} color="#30342f" />
      <Block at={[0, 0.22, 0]} size={[0.62, 0.13, 0.74]} color="#eee8dc" />
      <Block at={[0, 0.07, 0.48]} size={[0.45, 0.06, 0.02]} color="#141413" />
    </group>
  )
}

function Scene({ phase, moving, onReady }: { phase: number; moving: boolean; onReady: () => void }) {
  const { width, height } = useThree((state) => state.size)
  const readyRef = useRef(false)
  useFrame(() => {
    if (!readyRef.current) {
      readyRef.current = true
      onReady()
    }
  })
  return (
    <>
      <OrthographicCamera
        makeDefault
        position={[17, 17, 19]}
        rotation={[-0.7299, 0.58809, 0.46074]}
        zoom={Math.min(width / 27, height / 20)}
        near={0.1}
        far={100}
      />
      <ambientLight intensity={1.4} />
      <directionalLight
        position={[-8, 18, 5]}
        intensity={3.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-normalBias={0.04}
      />
      <group rotation={[0, -0.12, 0]} position={[0, -0.7, 0]}>
        <Block at={[0, -0.25, 0]} size={[19, 0.45, 13]} color="#d8d6cd" />
        <Block at={[0, 0.01, 0]} size={[18.8, 0.08, 12.8]} color="#f4f0e6" />
        {[-6, -2, 2, 6].map((x) => (
          <Line
            key={x}
            points={[
              [x, 0.065, -6.3],
              [x, 0.065, 6.3],
            ]}
            color="#ddd8cd"
            lineWidth={1}
          />
        ))}
        <group scale={[1, phase === 0 ? 0.04 : 1, 1]}>
          {[-4.4, 0, 4.4].flatMap((x) => [-2, 2].map((z) => <Rack key={`${x}-${z}`} x={x} z={z} />))}
        </group>
        {[-6, -2, 2, 6].map((x) => (
          <group key={x}>
            <Block at={[x, 0.08, 5.6]} size={[2.4, 0.08, 0.8]} color="#dbd2bc" />
            <Block at={[x, 0.55, -5.6]} size={[1.25, 1.05, 0.4]} color="#6c756b" />
          </group>
        ))}
        {phase > 0 && <Line points={ROUTE} color="#f24a24" lineWidth={2} dashed dashSize={0.25} gapSize={0.15} />}
        {phase > 1 && [0.1, 1.4, 2.7, 4.1].map((offset) => <Carrier key={offset} offset={offset} moving={moving} />)}
      </group>
    </>
  )
}

export default function WarehouseSculpture({ phase, moving }: { phase: number; moving: boolean }) {
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setFailed(true), 15000)
    return () => clearTimeout(timer)
  }, [])
  return (
    <div className="lab-sculpture" data-renderer={failed && !ready ? 'fallback' : ready ? 'ready' : 'loading'}>
      <div className="lab-scene-fallback">
        <span>Объект → маршруты → парк</span>
        <p>{failed ? '3D недоступно. Изучите расчёт и планировку в демо.' : 'Пространственная модель склада'}</p>
      </div>
      {!failed || ready ? (
        <SceneBoundary fallback={<span className="lab-renderer-note">3D недоступно. Расчёт открыт в демо.</span>}>
          <Canvas
            shadows={{ type: PCFShadowMap }}
            dpr={[1, 1.5]}
            frameloop={moving ? 'always' : 'demand'}
            style={{ opacity: ready ? 1 : 0 }}
            onCreated={({ gl }) => {
              gl.domElement.addEventListener(
                'webglcontextlost',
                () => {
                  setFailed(true)
                  setReady(false)
                },
                { once: true },
              )
            }}
          >
            <Scene phase={phase} moving={moving} onReady={() => setReady(true)} />
          </Canvas>
        </SceneBoundary>
      ) : null}
    </div>
  )
}

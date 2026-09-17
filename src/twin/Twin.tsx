import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid, Html, Line, OrbitControls, RoundedBox } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useStore } from '../store'
import { zoneStatus, zoneStatusLabel } from '../data/robots'
import { AISLES, CORRIDOR_BOTTOM, CORRIDOR_TOP, FLOOR, QUEUE_COLS, QUEUE_ORIGIN, QUEUE_PITCH, RACK_ROWS, RACK_X0, RACK_X1, ZONES } from './layout'
import { Robots } from './Robots'

export type TwinMode = 'overview' | 'sim'

const C = {
  bg: '#f4f4f2',
  floor: '#fbfbfa',
  grid: '#e2e2de',
  plate: '#efefec',
  plateHigh: '#f6e4c4',
  plateCrit: '#f5cfc9',
  upright: '#2b2b30',
  beam: '#9a9aa0',
  pallet: '#d8c6a5',
  box: '#e4e1da',
  route: '#2f55d4',
}

function Floor() {
  return (
    <group>
      <mesh receiveShadow position={[0, -0.15, 0]}>
        <boxGeometry args={[FLOOR.w, 0.3, FLOOR.d]} />
        <meshStandardMaterial color={C.floor} roughness={0.95} />
      </mesh>
      <Grid
        position={[0, 0.005, 0]}
        args={[FLOOR.w, FLOOR.d]}
        cellSize={2}
        cellThickness={0.6}
        cellColor={C.grid}
        sectionSize={10}
        sectionThickness={0.9}
        sectionColor="#d6d6d1"
        fadeDistance={140}
        fadeStrength={0.6}
        infiniteGrid={false}
      />
      {/* perimeter */}
      <Line
        points={[
          [-FLOOR.w / 2, 0.02, -FLOOR.d / 2],
          [FLOOR.w / 2, 0.02, -FLOOR.d / 2],
          [FLOOR.w / 2, 0.02, FLOOR.d / 2],
          [-FLOOR.w / 2, 0.02, FLOOR.d / 2],
          [-FLOOR.w / 2, 0.02, -FLOOR.d / 2],
        ]}
        color="#c9c9c4"
        lineWidth={1}
      />
      {/* docks */}
      {[-9, -3, 3, 9].map((z) => (
        <mesh key={`dl${z}`} position={[-FLOOR.w / 2 + 0.2, 0.35, z]}>
          <boxGeometry args={[0.4, 0.7, 3.2]} />
          <meshStandardMaterial color="#cfcfca" roughness={0.9} />
        </mesh>
      ))}
      {[-9, -3, 3, 9].map((z) => (
        <mesh key={`dr${z}`} position={[FLOOR.w / 2 - 0.2, 0.35, z]}>
          <boxGeometry args={[0.4, 0.7, 3.2]} />
          <meshStandardMaterial color="#cfcfca" roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

function Racks() {
  const uprights = useRef<THREE.InstancedMesh>(null)
  const pallets = useRef<THREE.InstancedMesh>(null)
  const boxes = useRef<THREE.InstancedMesh>(null)
  const layout = useMemo(() => {
    const ups: THREE.Matrix4[] = []
    const pal: THREE.Matrix4[] = []
    const bx: THREE.Matrix4[] = []
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const bays = 9
    const bayW = (RACK_X1 - RACK_X0) / bays
    const levels = 3
    let seed = 7
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }
    for (const z of RACK_ROWS) {
      for (let b = 0; b <= bays; b++) {
        const x = RACK_X0 + b * bayW
        for (const dz of [-0.95, 0.95]) {
          ups.push(m.clone().compose(new THREE.Vector3(x, 2.5, z + dz), q, new THREE.Vector3(0.14, 5.0, 0.14)))
        }
      }
      for (let b = 0; b < bays; b++) {
        const x = RACK_X0 + (b + 0.5) * bayW
        for (let l = 0; l < levels; l++) {
          const y = 0.3 + l * 1.6
          for (const dz of [-0.5, 0.5]) {
            if (rnd() < 0.78) {
              pal.push(m.clone().compose(new THREE.Vector3(x, y + 0.06, z + dz), q, new THREE.Vector3(bayW * 0.8, 0.12, 0.9)))
              const h = 0.6 + rnd() * 0.6
              bx.push(m.clone().compose(new THREE.Vector3(x, y + 0.12 + h / 2, z + dz), q, new THREE.Vector3(bayW * 0.72, h, 0.82)))
            }
          }
        }
      }
    }
    return { ups, pal, bx, bayW, levels }
  }, [])
  useEffect(() => {
    layout.ups.forEach((mat, i) => uprights.current!.setMatrixAt(i, mat))
    uprights.current!.instanceMatrix.needsUpdate = true
    layout.pal.forEach((mat, i) => pallets.current!.setMatrixAt(i, mat))
    pallets.current!.instanceMatrix.needsUpdate = true
    layout.bx.forEach((mat, i) => boxes.current!.setMatrixAt(i, mat))
    boxes.current!.instanceMatrix.needsUpdate = true
  }, [layout])
  return (
    <group>
      <instancedMesh ref={uprights} args={[undefined, undefined, layout.ups.length]} castShadow receiveShadow>
        <boxGeometry />
        <meshStandardMaterial color={C.upright} roughness={0.7} />
      </instancedMesh>
      {RACK_ROWS.map((z) =>
        Array.from({ length: layout.levels }).map((_, l) =>
          [-0.95, 0.95].map((dz) => (
            <mesh key={`${z}-${l}-${dz}`} position={[(RACK_X0 + RACK_X1) / 2, 0.3 + l * 1.6, z + dz]} castShadow>
              <boxGeometry args={[RACK_X1 - RACK_X0, 0.1, 0.1]} />
              <meshStandardMaterial color={C.beam} roughness={0.6} />
            </mesh>
          )),
        ),
      )}
      <instancedMesh ref={pallets} args={[undefined, undefined, layout.pal.length]} castShadow>
        <boxGeometry />
        <meshStandardMaterial color={C.pallet} roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={boxes} args={[undefined, undefined, layout.bx.length]} castShadow>
        <boxGeometry />
        <meshStandardMaterial color={C.box} roughness={0.85} />
      </instancedMesh>
    </group>
  )
}

function Stations() {
  const shipPallets = useMemo(() => {
    const out: [number, number, number][] = []
    let seed = 3
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }
    for (const z of [-10.5, -8.5, -2.5, -0.5, 4.5, 6.5, 10.5, 12.5]) out.push([27.6 + (rnd() - 0.5) * 0.6, z, 0.5 + rnd() * 0.7])
    return out
  }, [])
  return (
    <group>
      {/* packing stations in the picking zone */}
      {[-9, -3, 3, 9].map((z) => (
        <group key={z} position={[16, 0, z]}>
          <mesh position={[0, 0.45, 0]} castShadow>
            <boxGeometry args={[2.4, 0.08, 1.1]} />
            <meshStandardMaterial color="#e6e6e2" roughness={0.8} />
          </mesh>
          {[-1, 1].map((sx) => (
            <mesh key={sx} position={[sx * 1.05, 0.22, 0]}>
              <boxGeometry args={[0.1, 0.44, 0.9]} />
              <meshStandardMaterial color="#8f8f95" roughness={0.6} />
            </mesh>
          ))}
          <mesh position={[0.6, 0.62, -0.2]} castShadow>
            <boxGeometry args={[0.6, 0.26, 0.45]} />
            <meshStandardMaterial color={C.box} roughness={0.85} />
          </mesh>
          <mesh position={[-0.5, 0.55, 0.2]} castShadow>
            <boxGeometry args={[0.45, 0.12, 0.35]} />
            <meshStandardMaterial color="#2b2b30" roughness={0.6} />
          </mesh>
        </group>
      ))}
      {/* pallets staged at the shipping docks */}
      {shipPallets.map(([x, z, h], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.07, 0]} castShadow>
            <boxGeometry args={[1.2, 0.14, 1.0]} />
            <meshStandardMaterial color={C.pallet} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.14 + h / 2, 0]} castShadow>
            <boxGeometry args={[1.05, h, 0.88]} />
            <meshStandardMaterial color={C.box} roughness={0.85} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Routes() {
  const pts = useMemo(() => {
    const lines: [number, number, number][][] = []
    lines.push([[-24, 0.03, CORRIDOR_TOP], [26, 0.03, CORRIDOR_TOP]])
    lines.push([[-24, 0.03, CORRIDOR_BOTTOM], [26, 0.03, CORRIDOR_BOTTOM]])
    for (const z of AISLES) lines.push([[RACK_X0 - 1.5, 0.03, z], [RACK_X1 + 1.5, 0.03, z]])
    lines.push([[RACK_X0 - 1.5, 0.03, CORRIDOR_TOP], [RACK_X0 - 1.5, 0.03, CORRIDOR_BOTTOM]])
    lines.push([[RACK_X1 + 1.5, 0.03, CORRIDOR_TOP], [RACK_X1 + 1.5, 0.03, CORRIDOR_BOTTOM]])
    lines.push([[-22.5, 0.03, CORRIDOR_TOP], [-22.5, 0.03, CORRIDOR_BOTTOM]])
    lines.push([[12.5, 0.03, CORRIDOR_TOP], [12.5, 0.03, CORRIDOR_BOTTOM]])
    lines.push([[24, 0.03, CORRIDOR_TOP], [24, 0.03, CORRIDOR_BOTTOM]])
    return lines
  }, [])
  return (
    <group>
      {pts.map((l, i) => (
        <Line key={i} points={l} color={C.route} lineWidth={1} dashed dashSize={0.7} gapSize={0.5} transparent opacity={0.4} />
      ))}
    </group>
  )
}

const tmpColor = new THREE.Color()
const plateNormal = new THREE.Color(C.plate)
const plateHigh = new THREE.Color(C.plateHigh)
const plateCrit = new THREE.Color(C.plateCrit)

function ZonePlate({ index, mode }: { index: number; mode: TwinMode }) {
  const z = ZONES[index]
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  const ring = useRef<THREE.Mesh>(null)
  const ringMat = useRef<THREE.MeshBasicMaterial>(null)
  const selection = useStore((s) => s.selection)
  const setSelection = useStore((s) => s.setSelection)
  const selected = selection?.kind === 'zone' && selection.index === index
  const isStorage = z.key === 'storage'
  const frame = useMemo(() => {
    const w = z.w / 2 + 0.35
    const d = z.d / 2 + 0.35
    const shape = new THREE.Shape()
    shape.moveTo(-w, -d)
    shape.lineTo(w, -d)
    shape.lineTo(w, d)
    shape.lineTo(-w, d)
    shape.closePath()
    const hole = new THREE.Path()
    const iw = w - 0.45
    const id = d - 0.45
    hole.moveTo(-iw, -id)
    hole.lineTo(iw, -id)
    hole.lineTo(iw, id)
    hole.lineTo(-iw, id)
    hole.closePath()
    shape.holes.push(hole)
    return new THREE.ShapeGeometry(shape)
  }, [z.w, z.d])
  useFrame((state) => {
    const load = mode === 'sim' ? useStore.getState().live.zones[index] : 0
    const t = state.clock.elapsedTime
    if (mat.current) {
      if (load < 0.75) tmpColor.copy(plateNormal)
      else if (load < 0.9) tmpColor.copy(plateNormal).lerp(plateHigh, (load - 0.75) / 0.15)
      else tmpColor.copy(plateHigh).lerp(plateCrit, Math.min(1, (load - 0.9) / 0.1))
      mat.current.color.lerp(tmpColor, 0.08)
    }
    if (ring.current && ringMat.current) {
      const crit = load >= 0.9
      const high = load >= 0.75
      const pulse = crit ? 0.65 + Math.sin(t * 3) * 0.25 : high ? 0.45 : 0
      ringMat.current.opacity += (pulse - ringMat.current.opacity) * 0.1
      ringMat.current.color.set(crit ? '#d24b3f' : '#d18a1f')
    }
  })
  return (
    <group position={[z.x, 0, z.z]}>
      <mesh
        position={[0, 0.012, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation()
          setSelection(selected ? null : { kind: 'zone', index })
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <planeGeometry args={[z.w, z.d]} />
        <meshStandardMaterial ref={mat} color={C.plate} transparent opacity={isStorage ? 0.0 : 0.9} roughness={1} />
      </mesh>
      {/* load frame: rectangular outline that warms up with the zone load */}
      <mesh ref={ring} geometry={frame} position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshBasicMaterial ref={ringMat} color="#d18a1f" transparent opacity={0} depthWrite={false} />
      </mesh>
      {selected && (
        <Line
          points={[
            [-z.w / 2, 0.04, -z.d / 2],
            [z.w / 2, 0.04, -z.d / 2],
            [z.w / 2, 0.04, z.d / 2],
            [-z.w / 2, 0.04, z.d / 2],
            [-z.w / 2, 0.04, -z.d / 2],
          ]}
          color={C.route}
          lineWidth={2}
        />
      )}
      <ZoneLabel index={index} mode={mode} />
    </group>
  )
}

function ZoneLabel({ index, mode }: { index: number; mode: TwinMode }) {
  const z = ZONES[index]
  const load = useStore((s) => s.live.zones[index])
  const queue = useStore((s) => s.live.queue)
  const status = mode === 'sim' ? zoneStatus(load) : 'normal'
  const showQueue = mode === 'sim' && z.key === 'receiving' && queue >= 8
  const tone = status === 'critical' ? 'text-crit' : status === 'high' ? 'text-warn' : 'text-ink-3'
  return (
    <Html position={[0, 0.2, -z.d / 2 - 1.6]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
      <div className="twin-label flex flex-col items-center gap-1">
        <div className="flex items-center gap-2 rounded-full border border-line bg-white/95 px-2.5 py-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          <span className="text-[12.5px] font-medium text-ink">{z.name}</span>
          {mode === 'sim' && (
            <span className={`num text-[12px] ${tone}`}>
              {Math.round(load * 100)} %
            </span>
          )}
        </div>
        {mode === 'sim' && status !== 'normal' && (
          <div className={`rounded-full px-2 py-[2px] text-[11px] font-medium ${status === 'critical' ? 'bg-crit text-white' : 'bg-warn text-white'}`}>
            {zoneStatusLabel[status]}
            {showQueue ? ` · очередь ${Math.round(queue)}` : ''}
          </div>
        )}
      </div>
    </Html>
  )
}

/** Pallets waiting on the receiving dock. Count follows live.queue with per-instance easing. */
function Queue() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const scales = useRef<Float32Array>(new Float32Array(36))
  const m = useMemo(() => new THREE.Matrix4(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const p = useMemo(() => new THREE.Vector3(), [])
  const s = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const count = Math.min(36, Math.round(useStore.getState().live.queue))
    const mesh = ref.current
    if (!mesh) return
    for (let i = 0; i < 36; i++) {
      const target = i < count ? 1 : 0
      scales.current[i] += (target - scales.current[i]) * 0.12
      const sc = scales.current[i]
      const col = i % QUEUE_COLS
      const row = Math.floor(i / QUEUE_COLS)
      p.set(QUEUE_ORIGIN[0] + col * QUEUE_PITCH, 0.45 * sc, QUEUE_ORIGIN[1] + row * QUEUE_PITCH * 0.95)
      s.set(1.1 * sc, 0.9 * sc, 1.0 * sc)
      m.compose(p, q, s)
      mesh.setMatrixAt(i, m)
    }
    mesh.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 36]} castShadow>
      <boxGeometry />
      <meshStandardMaterial color={C.pallet} roughness={0.9} />
    </instancedMesh>
  )
}

function CameraRig({ mode }: { mode: TwinMode }) {
  const { camera } = useThree()
  const done = useRef(false)
  useEffect(() => {
    done.current = false
  }, [mode])
  useFrame((_, dt) => {
    if (done.current) return
    const target = mode === 'overview' ? new THREE.Vector3(10, 56, 58) : new THREE.Vector3(6, 50, 50)
    camera.position.lerp(target, Math.min(1, dt * 2.2))
    camera.lookAt(0, 0, 0)
    if (camera.position.distanceTo(target) < 0.05) done.current = true
  })
  return null
}

export function Twin({ mode = 'sim', className = '' }: { mode?: TwinMode; className?: string }) {
  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`}>
      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
        dpr={[1, 1.75]}
        camera={{ position: mode === 'overview' ? [14, 62, 64] : [10, 56, 56], fov: 32, near: 0.5, far: 400 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor(C.bg)
          scene.fog = new THREE.Fog(C.bg, 120, 220)
        }}
        onPointerMissed={() => useStore.getState().setSelection(null)}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={1.1} />
          <hemisphereLight args={['#ffffff', '#dcdcd6', 0.5]} />
          <directionalLight
            position={[20, 40, 16]}
            intensity={1.6}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0004}
            shadow-camera-left={-45}
            shadow-camera-right={45}
            shadow-camera-top={45}
            shadow-camera-bottom={-45}
            shadow-camera-near={1}
            shadow-camera-far={120}
          />
          <Floor />
          <Racks />
          <Stations />
          {ZONES.map((_, i) => (
            <ZonePlate key={i} index={i} mode={mode} />
          ))}
          {mode === 'sim' && (
            <>
              <Routes />
              <Queue />
              <Robots />
            </>
          )}
          <CameraRig mode={mode} />
          <OrbitControls
            enablePan={false}
            enableDamping
            dampingFactor={0.08}
            minDistance={30}
            maxDistance={140}
            minPolarAngle={0.3}
            maxPolarAngle={1.15}
            autoRotate={mode === 'overview'}
            autoRotateSpeed={0.35}
            target={[0, 0, 0]}
          />
        </Suspense>
      </Canvas>
    </div>
  )
}

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
        <meshStandardMaterial color={active ? '#35c27a' : '#d18a1f'} emissive={active ? '#35c27a' : '#d18a1f'} emissiveIntensity={1.2} />
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

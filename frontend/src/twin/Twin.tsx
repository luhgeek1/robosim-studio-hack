import { Canvas, useFrame } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import { Suspense, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useStore } from '../store'
import { zoneStatus, zoneStatusLabel } from '../data/zones'
import { AISLES, CORRIDOR_BOTTOM, CORRIDOR_TOP, QUEUE_COLS, QUEUE_ORIGIN, QUEUE_PITCH, RACK_X0, RACK_X1, ZONES } from './layout'
import { Robots } from './Robots'
import { Floor, Racks, Stations } from './Warehouse'
import { C } from './palette'
import { MapCamera, MapToolbar, type CameraAction } from './MapCamera'

export type TwinMode = 'overview' | 'sim'

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
        <Line key={i} points={l.map(([x, , z]) => [x, 0.06, z])} color={C.route} lineWidth={1.5} dashed dashSize={0.7} gapSize={0.5} transparent opacity={0.65} />
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
          if (e.delta > 4) return
          e.stopPropagation()
          setSelection(selected ? null : { kind: 'zone', index })
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <planeGeometry args={[z.w, z.d]} />
        <meshStandardMaterial ref={mat} color={C.plate} transparent depthWrite={false} opacity={isStorage ? 0.0 : 0.9} roughness={1} />
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

export function Twin({ mode = 'sim', className = '' }: { mode?: TwinMode; className?: string }) {
  const [command, setCommand] = useState({ action: 'home' as CameraAction, id: 0 })
  const [routes, setRoutes] = useState(true)
  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`}>
      <MapToolbar onAction={(action) => setCommand((c) => ({ action, id: c.id + 1 }))} routes={routes} onRoutes={() => setRoutes((v) => !v)} />
      <Canvas
        shadows={{ type: THREE.PCFSoftShadowMap }}
        dpr={[1, 1.75]}
        camera={{ position: [38, 62, 68], fov: 38, near: 0.5, far: 600 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor(C.bg)
          scene.fog = new THREE.Fog(C.bg, 220, 500)
        }}
        onPointerMissed={() => useStore.getState().setSelection(null)}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.65} />
          <hemisphereLight args={['#e4f3ff', '#b5a38b', 1.1]} />
          <directionalLight
            position={[20, 40, 16]}
            intensity={2.3}
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
          {routes && <Routes />}
          {mode === 'sim' && (
            <>
              <Queue />
              <Robots />
            </>
          )}
          <MapCamera command={command} />
        </Suspense>
      </Canvas>
    </div>
  )
}

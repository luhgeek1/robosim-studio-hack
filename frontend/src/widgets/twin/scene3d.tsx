import { Grid } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { LayoutGeometry, SimulationHeatmap, ZoneKind } from '@/shared/api/types'
import { C } from './palette'
import { poseAt, usePlayback, type Pose, type RobotTrack } from '@/entities/simulation'
import { RobotMesh } from './RobotMesh'

export type SceneFrame = { w: number; h: number; x: (mx: number) => number; z: (my: number) => number }

// Layout metres (origin top-left, y down) → scene units (1 unit = 1 m, centred, z towards the viewer).
export function sceneFrame(layout: LayoutGeometry): SceneFrame {
  return {
    w: layout.width_m,
    h: layout.height_m,
    x: (mx) => mx - layout.width_m / 2,
    z: (my) => my - layout.height_m / 2,
  }
}

const ZONE_FILL: Partial<Record<ZoneKind, string>> = {
  receiving: '#d9ebe6',
  shipping: '#d9e4f2',
  picking: '#e6e0f3',
  station: '#e3dcf3',
  packing: '#f2e5da',
  charging: '#f5ead0',
  buffer: '#ececdf',
  corridor: '#eef2f4',
  storage: '#e9eef1',
  office: '#ececec',
  obstacle: '#d9d9d9',
  kitchen: '#f5e2d0',
  laundry: '#d6ebf2',
  pharmacy: '#d7eedd',
  lab: '#eadcf2',
  ward: '#dde6f4',
  waste: '#e6e0cc',
  elevator: '#d5d3dc',
  gate: '#f3d9df',
  apron: '#dedfd6',
  terminal: '#d3dbf0',
}

// three.js does not parse oklch(), so the marker pads carry hex twins of MARKER_COLOR from the 2D map.
const PAD_COLOR = { elevator: '#8d8a9c', pickup: '#6fbf95', dropoff: '#5fb3c4', parking: '#8a8a86' } as const
const PAD_KINDS: readonly string[] = Object.keys(PAD_COLOR)

const genParam = (layout: LayoutGeometry, key: string) => layout.generator?.params?.[key]

export function Building({ layout, frame }: { layout: LayoutGeometry; frame: SceneFrame }) {
  const { w, h } = frame
  return (
    <group>
      <mesh receiveShadow position={[0, -0.58, 0]}>
        <boxGeometry args={[w + 1.2, 1.1, h + 1.2]} />
        <meshStandardMaterial color="#8097a5" roughness={0.8} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color={C.floor} roughness={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.14, 0]}>
        <planeGeometry args={[w * 6, h * 6]} />
        <meshStandardMaterial color={C.bg} roughness={1} />
      </mesh>
      <Grid
        position={[0, 0.006, 0]}
        args={[w, h]}
        cellSize={5}
        cellThickness={0.5}
        cellColor={C.grid}
        sectionSize={25}
        sectionThickness={0.8}
        sectionColor="#d6d6d1"
        fadeDistance={Math.max(w, h) * 2.2}
        fadeStrength={0.5}
        infiniteGrid={false}
      />
      <Zones layout={layout} frame={frame} />
    </group>
  )
}

export type SceneLabel = { id: string; name: string; x: number; z: number }

// Zone names sit at the centre of each zone's bounding box; corridors stay unlabelled.
export function zoneLabels(layout: LayoutGeometry, frame: SceneFrame): SceneLabel[] {
  return layout.zones
    .filter((zone) => zone.kind !== 'corridor')
    .map((zone) => {
      const xs = zone.polygon.map((p) => p[0])
      const ys = zone.polygon.map((p) => p[1])
      return {
        id: zone.id,
        name: zone.name,
        x: frame.x((Math.min(...xs) + Math.max(...xs)) / 2),
        z: frame.z((Math.min(...ys) + Math.max(...ys)) / 2),
      }
    })
}

function Zones({ layout, frame }: { layout: LayoutGeometry; frame: SceneFrame }) {
  const plates = useMemo(
    () =>
      layout.zones.map((zone) => {
        const shape = new THREE.Shape()
        zone.polygon.forEach(([px, py], i) => {
          const sx = frame.x(px)
          const sz = -frame.z(py)
          if (i === 0) shape.moveTo(sx, sz)
          else shape.lineTo(sx, sz)
        })
        shape.closePath()
        return { zone, geometry: new THREE.ShapeGeometry(shape) }
      }),
    [layout.zones, frame],
  )
  return (
    <group>
      {plates.map(({ zone, geometry }) => (
        <mesh
          key={zone.id}
          geometry={geometry}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, zone.kind === 'corridor' ? 0.01 : 0.014, 0]}
          receiveShadow
        >
          <meshStandardMaterial
            color={ZONE_FILL[zone.kind] ?? C.plate}
            transparent
            opacity={zone.kind === 'storage' ? 0.35 : 0.9}
            depthWrite={false}
            roughness={1}
          />
        </mesh>
      ))}
    </group>
  )
}

export function Racks({ layout, frame }: { layout: LayoutGeometry; frame: SceneFrame }) {
  const uprights = useRef<THREE.InstancedMesh>(null)
  const beams = useRef<THREE.InstancedMesh>(null)
  const loads = useRef<THREE.InstancedMesh>(null)
  const data = useMemo(() => {
    const bayPitch = genParam(layout, 'layout_rack_bay_pitch_m') ?? 2.8
    const levelPitch = genParam(layout, 'layout_rack_level_pitch_m') ?? 1.9
    const perBay = genParam(layout, 'layout_pallets_per_bay_level') ?? 3
    const ups: THREE.Matrix4[] = []
    const bms: THREE.Matrix4[] = []
    const lds: THREE.Matrix4[] = []
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    let n = 0
    for (const rack of layout.racks ?? []) {
      const xs = rack.polygon.map((p) => p[0])
      const ys = rack.polygon.map((p) => p[1])
      const x0 = Math.min(...xs)
      const x1 = Math.max(...xs)
      const y0 = Math.min(...ys)
      const y1 = Math.max(...ys)
      const alongY = y1 - y0 >= x1 - x0
      const length = alongY ? y1 - y0 : x1 - x0
      const depth = alongY ? x1 - x0 : y1 - y0
      const levels = rack.levels ?? 4
      const height = levels * levelPitch
      const bays = Math.max(1, Math.round(length / bayPitch))
      const bay = length / bays
      const place = (along: number, across: number, y: number, sAlong: number, sAcross: number, sy: number) => {
        const mx = alongY ? x0 + across : x0 + along
        const my = alongY ? y0 + along : y0 + across
        const scale = alongY ? new THREE.Vector3(sAcross, sy, sAlong) : new THREE.Vector3(sAlong, sy, sAcross)
        return m.clone().compose(new THREE.Vector3(frame.x(mx), y, frame.z(my)), q, scale)
      }
      for (let b = 0; b <= bays; b++) {
        for (const side of [0.08, depth - 0.08]) ups.push(place(b * bay, side, height / 2, 0.12, 0.12, height))
      }
      for (let l = 0; l < levels; l++) {
        const y = 0.25 + l * levelPitch
        for (const side of [0.08, depth - 0.08]) bms.push(place(length / 2, side, y, length, 0.1, 0.1))
        for (let b = 0; b < bays; b++) {
          for (let p = 0; p < perBay; p++) {
            n++
            // Height variation is only visual texture; occupancy is not simulated in the storage racks.
            const hLoad = 0.9 + ((n * 7919) % 5) * 0.12
            const along = b * bay + ((p + 0.5) * bay) / perBay
            lds.push(place(along, depth / 2, y + 0.06 + hLoad / 2, (bay / perBay) * 0.82, depth * 0.8, hLoad))
          }
        }
      }
    }
    return { ups, bms, lds }
  }, [layout, frame])
  useLayoutEffect(() => {
    data.ups.forEach((mat, i) => uprights.current?.setMatrixAt(i, mat))
    data.bms.forEach((mat, i) => beams.current?.setMatrixAt(i, mat))
    data.lds.forEach((mat, i) => loads.current?.setMatrixAt(i, mat))
    for (const ref of [uprights, beams, loads]) if (ref.current) ref.current.instanceMatrix.needsUpdate = true
  }, [data])
  return (
    <group>
      <instancedMesh ref={uprights} args={[undefined, undefined, data.ups.length]} receiveShadow>
        <boxGeometry />
        <meshStandardMaterial color={C.upright} roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={beams} args={[undefined, undefined, data.bms.length]}>
        <boxGeometry />
        <meshStandardMaterial color={C.beam} roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={loads} args={[undefined, undefined, data.lds.length]}>
        <boxGeometry />
        <meshStandardMaterial color={C.box} roughness={0.9} />
      </instancedMesh>
    </group>
  )
}

export function Markers({ layout, frame }: { layout: LayoutGeometry; frame: SceneFrame }) {
  const docks = layout.nodes.filter((n) => n.kind === 'dock_in' || n.kind === 'dock_out')
  const chargers = layout.nodes.filter((n) => n.kind === 'charger')
  const stations = layout.nodes.filter((n) => n.kind === 'pick_station')
  const pads = layout.nodes.filter((n) => PAD_KINDS.includes(n.kind))
  const hasRacks = (layout.racks?.length ?? 0) > 0
  return (
    <group>
      {docks.map((n) => (
        <group key={n.id} position={[frame.x(n.x), 0, frame.z(n.y)]}>
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[3.2, 3.2]} />
            <meshStandardMaterial color={n.kind === 'dock_in' ? '#bfdad5' : '#c4d4e7'} />
          </mesh>
          {hasRacks && (
            <mesh position={[0, 0.4, 0]} castShadow>
              <boxGeometry args={[1.2, 0.8, 1.0]} />
              <meshStandardMaterial color={C.pallet} roughness={0.9} />
            </mesh>
          )}
        </group>
      ))}
      {pads.map((n) => {
        const color = PAD_COLOR[n.kind as keyof typeof PAD_COLOR]
        return (
          <group key={n.id} position={[frame.x(n.x), 0, frame.z(n.y)]}>
            <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[n.kind === 'elevator' ? 2.4 : 1.8, n.kind === 'elevator' ? 2.4 : 1.8]} />
              <meshStandardMaterial color={color} />
            </mesh>
            <mesh position={[0, n.kind === 'elevator' ? 0.6 : 0.2, 0]} castShadow>
              <boxGeometry args={n.kind === 'elevator' ? [1.6, 1.2, 0.2] : [0.6, 0.4, 0.6]} />
              <meshStandardMaterial color={color} roughness={0.7} />
            </mesh>
          </group>
        )
      })}
      {chargers.map((n) => (
        <group key={n.id} position={[frame.x(n.x), 0, frame.z(n.y)]}>
          <mesh position={[0, 0.6, 0]} castShadow>
            <boxGeometry args={[0.5, 1.2, 0.35]} />
            <meshStandardMaterial color="#2b2b30" roughness={0.5} />
          </mesh>
          <mesh position={[0, 1.0, 0.18]}>
            <boxGeometry args={[0.3, 0.12, 0.02]} />
            <meshStandardMaterial color="#35c27a" emissive="#35c27a" emissiveIntensity={1.1} />
          </mesh>
        </group>
      ))}
      {stations.map((n) => (
        <group key={n.id} position={[frame.x(n.x), 0, frame.z(n.y)]}>
          <mesh position={[0, 0.45, 0]} castShadow>
            <boxGeometry args={[1.8, 0.08, 1.0]} />
            <meshStandardMaterial color="#e6e6e2" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.22, 0]}>
            <boxGeometry args={[1.6, 0.44, 0.1]} />
            <meshStandardMaterial color="#8f8f95" roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

export function RouteLines({
  layout,
  frame,
  heat,
}: {
  layout: LayoutGeometry
  frame: SceneFrame
  heat?: SimulationHeatmap | null
}) {
  const geometry = useMemo(() => {
    const nodes = new Map(layout.nodes.map((n) => [n.id, n]))
    // Same reading as the 2D layer: colour by waiting (a jam), edges without waiting stay cold however busy.
    const maxWait = Math.max(0, ...(heat?.edges ?? []).map((e) => e.wait_s ?? 0))
    const intensity = new Map(
      (heat?.edges ?? []).map((e) => [e.edge_id, Math.max(0.03, maxWait ? (e.wait_s ?? 0) / maxWait : 0)]),
    )
    const positions: number[] = []
    const colors: number[] = []
    const cold = new THREE.Color(C.route)
    const hot = new THREE.Color('#d24b3f')
    const warm = new THREE.Color('#d18a1f')
    const tmp = new THREE.Color()
    for (const e of layout.edges) {
      const a = nodes.get(e.from)
      const b = nodes.get(e.to)
      if (!a || !b) continue
      const v = intensity.get(e.id) ?? 0
      if (heat && !intensity.has(e.id)) continue
      positions.push(frame.x(a.x), 0.07, frame.z(a.y), frame.x(b.x), 0.07, frame.z(b.y))
      if (heat)
        tmp
          .copy(cold)
          .lerp(warm, Math.min(1, v * 2))
          .lerp(hot, Math.max(0, v * 2 - 1))
      else tmp.copy(cold)
      colors.push(tmp.r, tmp.g, tmp.b, tmp.r, tmp.g, tmp.b)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    return g
  }, [layout, frame, heat])
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial vertexColors transparent opacity={heat ? 0.95 : 0.45} />
    </lineSegments>
  )
}

const STATE_LIGHT: Record<Pose['state'], string> = {
  moving: '#35c27a',
  load: '#35c27a',
  unload: '#35c27a',
  idle: '#9aa3ad',
  charge: '#d18a1f',
  wait: '#d24b3f',
  fail: '#d24b3f',
}

export function Robots3D({
  tracks,
  frame,
  selectedId,
  onSelect,
}: {
  tracks: RobotTrack[]
  frame: SceneFrame
  selectedId?: string | null
  onSelect?: (id: string | null) => void
}) {
  return (
    <group>
      {tracks.map((track) => (
        <Robot3D key={track.id} track={track} frame={frame} selected={track.id === selectedId} onSelect={onSelect} />
      ))}
    </group>
  )
}

function Robot3D({
  track,
  frame,
  selected,
  onSelect,
}: {
  track: RobotTrack
  frame: SceneFrame
  selected: boolean
  onSelect?: (id: string | null) => void
}) {
  const group = useRef<THREE.Group>(null)
  const pose = useRef<Pose>({ x: track.home[0], y: track.home[1], heading: 0, state: 'idle', loaded: false })
  const loadedMesh = useRef<THREE.Group>(null)
  const light = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(() => {
    const next = poseAt(track, usePlayback.getState().t, pose.current.heading)
    pose.current = next
    const g = group.current
    if (!g) return
    g.position.set(frame.x(next.x), 0, frame.z(next.y))
    const target = -next.heading
    let delta = target - g.rotation.y
    while (delta > Math.PI) delta -= Math.PI * 2
    while (delta < -Math.PI) delta += Math.PI * 2
    g.rotation.y += delta * 0.35
    if (loadedMesh.current) loadedMesh.current.visible = next.loaded
    if (light.current) {
      const c = STATE_LIGHT[next.state]
      light.current.color.set(c)
      light.current.emissive.set(c)
    }
  })
  return (
    <group
      ref={group}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (e.delta > 4) return
        e.stopPropagation()
        onSelect?.(selected ? null : track.id)
      }}
    >
      <RobotMesh selected={selected} loadedRef={loadedMesh} lightRef={light} />
    </group>
  )
}

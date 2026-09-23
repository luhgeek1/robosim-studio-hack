import { Canvas } from '@react-three/fiber'
import { Suspense, useMemo, useState } from 'react'
import * as THREE from 'three'
import type { Layout, SimulationHeatmap } from '@/api/types'
import { Segmented } from '@/components/ui'
import { Map2D } from './map2d/Map2D'
import { MapCamera, MapToolbar, type CameraAction } from './MapCamera'
import { C } from './palette'
import type { RobotTrack } from './playback'
import { Building, Markers, Racks, RouteLines, Robots3D, sceneFrame } from './scene3d'

export type TwinView = '3d' | '2d'

export type TwinProps = {
  layout: Layout
  tracks?: RobotTrack[]
  heat?: SimulationHeatmap | null
  view?: TwinView
  onViewChange?: (view: TwinView) => void
  selectedRobot?: string | null
  onSelectRobot?: (id: string | null) => void
  className?: string
}

// The friend's 3D twin, now built from the generated layout (zones, racks, docks, chargers, route graph) and moved
// by the simulation event log. The 2D view is the same scene as a plan — the ТЗ asks for 2D, 3D is the extra.
export function Twin({
  layout,
  tracks,
  heat,
  view: controlledView,
  onViewChange,
  selectedRobot,
  onSelectRobot,
  className = '',
}: TwinProps) {
  const [ownView, setOwnView] = useState<TwinView>('3d')
  const view = controlledView ?? ownView
  const setView = (v: TwinView) => {
    setOwnView(v)
    onViewChange?.(v)
  }
  const [command, setCommand] = useState({ action: 'home' as CameraAction, id: 0 })
  const [routes, setRoutes] = useState(false)
  const frame = useMemo(() => sceneFrame(layout), [layout])
  const span = Math.max(frame.w, frame.h)

  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`}>
      <div className="absolute top-4 right-4 z-20">
        <Segmented
          size="sm"
          layoutId={`twin-view-${layout.id}`}
          value={view}
          onChange={setView}
          options={[
            { value: '3d', label: '3D' },
            { value: '2d', label: '2D-схема' },
          ]}
        />
      </div>
      {view === '2d' ? (
        <Map2D
          layout={layout}
          tracks={tracks}
          heat={heat}
          showGraph={routes}
          selectedRobot={selectedRobot}
          onSelectRobot={onSelectRobot}
        />
      ) : (
        <>
          <MapToolbar
            onAction={(action) => setCommand((c) => ({ action, id: c.id + 1 }))}
            routes={routes}
            onRoutes={() => setRoutes((v) => !v)}
          />
          <Canvas
            shadows={{ type: THREE.PCFSoftShadowMap }}
            dpr={[1, 1.75]}
            camera={{ position: [span * 0.5, span * 0.8, span], fov: 38, near: 0.5, far: span * 12 }}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
            onCreated={({ gl, scene }) => {
              gl.setClearColor(C.bg)
              scene.fog = new THREE.Fog(C.bg, span * 3, span * 8)
            }}
            onPointerMissed={() => onSelectRobot?.(null)}
          >
            <Suspense fallback={null}>
              <ambientLight intensity={0.7} />
              <hemisphereLight args={['#e4f3ff', '#b5a38b', 1.1]} />
              <directionalLight
                position={[span * 0.3, span * 0.6, span * 0.25]}
                intensity={2.2}
                castShadow
                shadow-mapSize={[2048, 2048]}
                shadow-bias={-0.0004}
                shadow-camera-left={-frame.w / 2}
                shadow-camera-right={frame.w / 2}
                shadow-camera-top={frame.h / 2}
                shadow-camera-bottom={-frame.h / 2}
                shadow-camera-near={1}
                shadow-camera-far={span * 2}
              />
              <Building layout={layout} frame={frame} />
              <Racks layout={layout} frame={frame} />
              <Markers layout={layout} frame={frame} />
              {(routes || heat) && <RouteLines layout={layout} frame={frame} heat={heat} />}
              {tracks && <Robots3D tracks={tracks} frame={frame} selectedId={selectedRobot} onSelect={onSelectRobot} />}
              <MapCamera command={command} extent={{ w: frame.w, h: frame.h }} />
            </Suspense>
          </Canvas>
        </>
      )}
    </div>
  )
}

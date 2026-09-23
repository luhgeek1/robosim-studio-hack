import { Canvas } from '@react-three/fiber'
import { Suspense, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { RobotTrack } from '@/entities/simulation'
import type { LayoutGeometry, SimulationHeatmap } from '@/shared/api/types'
import { Segmented } from '@/shared/ui/v0'
import { LayoutMap } from '@/widgets/layout-map'
import { MapCamera, MapToolbar, type CameraAction } from './MapCamera'
import { C } from './palette'
import { HeatLayer, RobotsLayer } from './Robots2D'
import { Building, Markers, Racks, RouteLines, Robots3D, sceneFrame, zoneLabels } from './scene3d'
import { LabelLayer, LabelProjector } from './SceneLabels'

export type TwinView = '3d' | '2d'

export type TwinProps = {
  layout: LayoutGeometry
  /** Robot tracks built from the simulation event log; without them the twin shows the empty site. */
  tracks?: RobotTrack[]
  heat?: SimulationHeatmap | null
  /** Show the 3D / 2D switch (the 2D plan is what ТЗ 3.6.1 asks for; 3D is the extra view). */
  switcher?: boolean
  selectedRobot?: string | null
  onSelectRobot?: (id: string | null) => void
  className?: string
}

// The twin is drawn from the generated layout (zones, racks, docks, chargers, route graph) and moved only by the
// simulation event log through the shared playback clock (D-006): nothing on the scene is invented by the frontend.
export function Twin({
  layout,
  tracks,
  heat,
  switcher = true,
  selectedRobot,
  onSelectRobot,
  className = '',
}: TwinProps) {
  const [view, setView] = useState<TwinView>('3d')
  const [command, setCommand] = useState({ action: 'home' as CameraAction, id: 0 })
  const [routes, setRoutes] = useState(false)
  const frame = useMemo(() => sceneFrame(layout), [layout])
  const labels = useMemo(() => zoneLabels(layout, frame), [layout, frame])
  const labelRefs = useRef(new Map<string, HTMLDivElement>())
  const span = Math.max(frame.w, frame.h)

  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`}>
      {switcher && (
        <div className="absolute top-4 right-4 z-20">
          <Segmented
            size="sm"
            layoutId="twin-view"
            value={view}
            onChange={setView}
            options={[
              { value: '3d', label: '3D' },
              { value: '2d', label: '2D-схема' },
            ]}
          />
        </div>
      )}
      {view === '2d' ? (
        <div className="absolute inset-0">
          <LayoutMap
            layout={layout}
            fill
            legend={false}
            showGraph={routes && !heat}
            onShowGraphChange={setRoutes}
            className="h-full rounded-none border-0"
            toolbarClassName="top-16 right-4"
          >
            {(v) => (
              <>
                {heat && <HeatLayer layout={layout} heat={heat} />}
                {tracks && <RobotsLayer tracks={tracks} k={v.k} selected={selectedRobot} onSelect={onSelectRobot} />}
              </>
            )}
          </LayoutMap>
        </div>
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
              <LabelProjector labels={labels} refs={labelRefs} />
            </Suspense>
          </Canvas>
          <LabelLayer labels={labels} refs={labelRefs} />
        </>
      )}
    </div>
  )
}

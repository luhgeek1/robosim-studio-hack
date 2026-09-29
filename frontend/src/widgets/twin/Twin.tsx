import { Canvas, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Flame } from 'lucide-react'
import * as THREE from 'three'
import type { RobotTrack } from '@/entities/simulation'
import type { LayoutGeometry, SimulationHeatmap } from '@/shared/api/types'
import { Toggle } from '@/shared/ui/toggle'
import { Segmented } from '@/shared/ui/v0'
import { LayoutMap } from '@/widgets/layout-map'
import { MapCamera, MapToolbar, type CameraAction, type ToolbarPlacement } from './MapCamera'
import { C } from './palette'
import { HeatLayer, ROBOT_LEGEND, RobotsLayer, heatText, type HeatEdge } from './Robots2D'
import { Building, Markers, Racks, RouteLines, Robots3D, sceneFrame, zoneLabels } from './scene3d'
import { LabelLayer, LabelProjector } from './SceneLabels'
import { svgToPng } from './snapshot'
import { SceneBoundary } from '@/shared/ui/boundary'

export type TwinView = '3d' | '2d'

/** Filled by the twin: renders the current view (2D plan or 3D frame) to PNG for the report (ТЗ 3.7.4). */
export type TwinCapture = RefObject<(() => Promise<Blob | null>) | null>

export type TwinProps = {
  layout: LayoutGeometry
  /** Robot tracks built from the simulation event log; without them the twin shows the empty site. */
  tracks?: RobotTrack[]
  heat?: SimulationHeatmap | null
  /** Show the 3D / 2D switch (the 2D plan is what ТЗ 3.6.1 asks for; 3D is the extra view). */
  switcher?: boolean
  /** Controlled view, so a host that remounts the twin keeps the user's choice. */
  view?: TwinView
  onViewChange?: (view: TwinView) => void
  selectedRobot?: string | null
  onSelectRobot?: (id: string | null) => void
  capture?: TwinCapture
  /** Where the 3D camera toolbar sits; a host with its own top-left overlays moves it to the bottom corner. */
  toolbarPlacement?: ToolbarPlacement
  className?: string
}

// The twin is drawn from the generated layout (zones, racks, docks, chargers, route graph) and moved only by the
// simulation event log through the shared playback clock (D-006): nothing on the scene is invented by the frontend.
export function Twin({
  layout,
  tracks,
  heat,
  switcher = true,
  view: controlledView,
  onViewChange,
  selectedRobot,
  onSelectRobot,
  capture,
  toolbarPlacement,
  className = '',
}: TwinProps) {
  const [ownView, setOwnView] = useState<TwinView>('3d')
  const view = controlledView ?? ownView
  const setView = (next: TwinView) => {
    setOwnView(next)
    onViewChange?.(next)
  }
  const [command, setCommand] = useState({ action: 'home' as CameraAction, id: 0 })
  // One map layer at a time: the route graph or the run's flow and congestion — they draw on the same edges.
  const [layer, setLayer] = useState<'none' | 'graph' | 'heat'>('none')
  const routes = layer === 'graph'
  const heatOn = layer === 'heat' && Boolean(heat)
  const [picked, setPicked] = useState<HeatEdge | null>(null)
  const heatToggle = heat ? (
    <Toggle
      size="sm"
      variant="outline"
      pressed={heatOn}
      onPressedChange={(on) => {
        setPicked(null)
        setLayer(on ? 'heat' : 'none')
      }}
      aria-label="Поток и заторы"
    >
      <Flame /> <span className="@max-[28rem]:sr-only">Заторы</span>
    </Toggle>
  ) : null
  const frame = useMemo(() => sceneFrame(layout), [layout])
  const labels = useMemo(() => zoneLabels(layout, frame), [layout, frame])
  const labelRefs = useRef(new Map<string, HTMLDivElement>())
  const planRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!capture || view !== '2d') return
    const shoot = async () => {
      const svg = planRef.current?.querySelector('svg')
      return svg ? svgToPng(svg, '#ffffff') : null
    }
    capture.current = shoot
    return () => {
      if (capture.current === shoot) capture.current = null
    }
  }, [capture, view])
  const span = Math.max(frame.w, frame.h)

  return (
    <div className={`@container relative h-full w-full overflow-hidden ${className}`}>
      {switcher && (
        <div className="absolute top-4 right-4 z-20">
          <Segmented
            size="sm"
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
        <div ref={planRef} className="absolute inset-0">
          <LayoutMap
            layout={layout}
            fill
            legend={false}
            showGraph={routes}
            onShowGraphChange={(on) => setLayer(on ? 'graph' : 'none')}
            className="h-full rounded-none border-0"
            toolbarClassName="top-16 right-4"
            toolbarExtra={heatToggle}
            infoCorner="top-left"
            // На узкой сцене левый верхний угол делит строку с переключателем 3D / 2D — масштаб уходит под панель.
            infoClassName={switcher ? '@max-[34rem]:top-28' : undefined}
          >
            {(v) => (
              <>
                {heatOn && heat && <HeatLayer layout={layout} heat={heat} onPick={setPicked} />}
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
            onRoutes={() => setLayer((v) => (v === 'graph' ? 'none' : 'graph'))}
            heat={heat ? heatOn : undefined}
            onHeat={() => setLayer((v) => (v === 'heat' ? 'none' : 'heat'))}
            placement={toolbarPlacement}
            clearTopRight={switcher}
          />
          <SceneBoundary
            fallback={
              <div className="absolute inset-0 grid place-items-center p-6 text-center text-[13.5px] text-ink-3">
                <div className="space-y-3">
                  <p>3D-вид недоступен в этом браузере (нет WebGL).</p>
                  {onViewChange && (
                    <button type="button" className="font-medium text-ink underline" onClick={() => onViewChange('2d')}>
                      Показать 2D-схему
                    </button>
                  )}
                </div>
              </div>
            }
          >
            <Canvas
              shadows={{ type: THREE.PCFSoftShadowMap }}
              dpr={[1, 1.75]}
              // Layout size, not the transformed box: inside a dialog that opens with a zoom the canvas would stay at 95 %.
              resize={{ offsetSize: true }}
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
                {(routes || heatOn) && <RouteLines layout={layout} frame={frame} heat={heatOn ? heat : null} />}
                {tracks && (
                  <Robots3D tracks={tracks} frame={frame} selectedId={selectedRobot} onSelect={onSelectRobot} />
                )}
                <MapCamera command={command} extent={{ w: frame.w, h: frame.h }} />
                <LabelProjector labels={labels} refs={labelRefs} />
                {capture && <FrameCapture capture={capture} />}
              </Suspense>
            </Canvas>
          </SceneBoundary>
          <LabelLayer labels={labels} refs={labelRefs} />
        </>
      )}
      <MapLegendStrip robots={view === '2d' && Boolean(tracks)} heat={heatOn} />
      {heatOn && picked && (
        <div className="absolute top-16 left-4 z-20 w-72 max-w-[calc(100%-2rem)] rounded-[12px] border border-line bg-white/95 p-3 text-[12.5px] shadow-card backdrop-blur">
          <div className="flex items-start justify-between gap-2">
            <span className="font-medium text-ink">Участок проезда</span>
            <button
              type="button"
              className="text-ink-4 hover:text-ink"
              onClick={() => setPicked(null)}
              aria-label="Закрыть"
            >
              ×
            </button>
          </div>
          <p className="mt-1 leading-relaxed text-ink-2">{heatText(picked)}</p>
        </div>
      )}
    </div>
  )
}

// What the colours on the map mean: robot states on the 2D plan, flow and congestion when that layer is on.
function MapLegendStrip({ robots, heat }: { robots: boolean; heat: boolean }) {
  if (!robots && !heat) return null
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-24px)] flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] bg-white/90 px-3 py-1.5 text-[11.5px] text-ink-2 shadow-card backdrop-blur">
      {heat ? (
        <>
          <span className="font-medium text-ink">Поток и заторы:</span>
          <span>толщина — число проездов</span>
          <Dot color="#287d9c" label="роботы не ждали" />
          <Dot color="var(--warn)" label="ждали немного" />
          <Dot color="var(--crit)" label="затор" />
          <span className="text-ink-3">нажмите на участок</span>
        </>
      ) : (
        ROBOT_LEGEND.map(([color, label]) => <Dot key={label} color={color} label={label} />)
      )}
    </div>
  )
}

function Dot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

// A WebGL canvas keeps no frame after presenting it, so the snapshot renders one frame and reads it at once.
function FrameCapture({ capture }: { capture: TwinCapture }) {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    const shoot = () => {
      gl.render(scene, camera)
      return new Promise<Blob | null>((resolve) => gl.domElement.toBlob(resolve, 'image/png'))
    }
    capture.current = shoot
    // The canvas unmounts after the 2D view has mounted: clear only our own capture.
    return () => {
      if (capture.current === shoot) capture.current = null
    }
  }, [capture, gl, scene, camera])
  return null
}

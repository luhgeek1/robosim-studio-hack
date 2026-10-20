import { useCallback, useEffect, useRef, useState } from 'react'
import type { ComponentRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { MathUtils, PCFShadowMap, PerspectiveCamera, Vector3 } from 'three'
import { SceneBoundary } from '@/shared/ui/boundary'
import { ObjectModel, SceneFallback, SceneLighting } from './LandingScene'
import { journeyBlend, type WarehouseJourneyController } from './warehouse-journey'

const JOURNEY_CAMERA = { position: [1.5, 1.3, 4.6] as [number, number, number], fov: 58, near: 0.08, far: 120 }

function MapFallback({ controller, onReady }: { controller: WarehouseJourneyController; onReady: () => void }) {
  useEffect(() => {
    controller.showFallback()
    onReady()
  }, [controller, onReady])
  return <SceneFallback />
}

function CameraRig({
  controller,
  onReady,
  onFailure,
}: {
  controller: WarehouseJourneyController
  onReady: () => void
  onFailure: () => void
}) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const frames = useRef(0)
  const wasInteractive = useRef(false)
  const orbitPosition = useRef<Vector3 | null>(null)
  const { invalidate, gl } = useThree()
  useEffect(() => controller.connectRenderer(invalidate), [controller, invalidate])
  useEffect(() => {
    const lost = (event: Event) => {
      event.preventDefault()
      onFailure()
    }
    gl.domElement.addEventListener('webglcontextlost', lost)
    return () => gl.domElement.removeEventListener('webglcontextlost', lost)
  }, [gl, onFailure])

  useFrame(({ camera }, delta) => {
    if (!(camera instanceof PerspectiveCamera)) return
    const pose = controller.update(delta)
    const rise = journeyBlend(pose.progress, 0.08, 0.67)
    const fov = MathUtils.lerp(58, 26.5, rise)
    if (camera.aspect !== pose.aspect || camera.fov !== fov) {
      // Keep the drawing buffer stable; compensate projection for the scaled CSS surface.
      camera.aspect = pose.aspect
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    if (wasInteractive.current && !pose.interactive) orbitPosition.current = camera.position.clone()
    if (!pose.interactive || !wasInteractive.current) {
      camera.position.set(MathUtils.lerp(1.5, 17, rise), MathUtils.lerp(1.3, 15, rise), MathUtils.lerp(4.6, 21, rise))
      if (orbitPosition.current) camera.position.lerp(orbitPosition.current, journeyBlend(pose.dock, 0.6, 1))
      camera.lookAt(
        MathUtils.lerp(0.2, -3 * (1 - pose.dock), rise),
        MathUtils.lerp(1.1, 0.5, rise),
        MathUtils.lerp(-3, 0, rise),
      )
      if (controls.current && pose.interactive) {
        controls.current.target.set(0, 0.5, 0)
        controls.current.update()
      }
    }
    if (controls.current) controls.current.enabled = pose.interactive
    wasInteractive.current = pose.interactive
    if (pose.moving || frames.current < 3) invalidate()
    if (++frames.current === 3) requestAnimationFrame(onReady)
  })
  return (
    <OrbitControls
      ref={controls}
      enabled={false}
      makeDefault
      enableZoom={false}
      enablePan={false}
      enableDamping
      rotateSpeed={0.65}
      minPolarAngle={Math.PI / 6}
      maxPolarAngle={Math.PI / 2.5}
      target={[0, 0.5, 0]}
    />
  )
}

export default function SimulationMap({
  controller,
  paused,
  active,
  reduced,
  onReady,
}: {
  controller: WarehouseJourneyController
  paused: boolean
  active: boolean
  reduced: boolean
  onReady: () => void
}) {
  const [failed, setFailed] = useState(false)
  const onFailure = useCallback(() => setFailed(true), [])
  const fallback = <MapFallback controller={controller} onReady={onReady} />
  return (
    <div
      className="cm-map"
      role="img"
      aria-label="3D-модель склада: шесть стеллажей с паллетами, мобильные роботы и станции зарядки"
    >
      <SceneBoundary fallback={fallback}>
        {failed ? (
          fallback
        ) : (
          <Canvas
            resize={{ scroll: false, offsetSize: true }}
            camera={JOURNEY_CAMERA}
            dpr={[1, 1.5]}
            shadows={{ type: PCFShadowMap }}
            frameloop={active && !paused && !reduced ? 'always' : 'demand'}
            fallback={<SceneFallback />}
            gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          >
            <CameraRig controller={controller} onReady={onReady} onFailure={onFailure} />
            <SceneLighting />
            <group position={[0, -0.5, 0]}>
              <ObjectModel kind="warehouse" playing={active && !paused && !reduced} />
            </group>
          </Canvas>
        )}
      </SceneBoundary>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrthographicCamera } from '@react-three/drei'
import { useReducedMotion, type MotionValue } from 'framer-motion'
import { MathUtils, OrthographicCamera as ThreeOrthographicCamera, PCFShadowMap } from 'three'
import { SceneBoundary } from '@/shared/ui/boundary'
import { ObjectModel, SceneFallback, SceneLighting } from './LandingScene'

function CameraRig({
  progress,
  reduced,
  playing,
}: {
  progress: MotionValue<number>
  reduced: boolean
  playing: boolean
}) {
  const invalidate = useThree((state) => state.invalidate)
  const current = useRef(progress.get())
  useEffect(() => progress.on('change', () => invalidate()), [progress, invalidate])
  useFrame(({ camera, size }, delta) => {
    if (!(camera instanceof ThreeOrthographicCamera)) return
    const target = reduced ? 0 : progress.get()
    current.current = playing ? MathUtils.damp(current.current, target, 5, Math.min(delta, 0.05)) : target
    const p = current.current
    const angle = MathUtils.lerp(0.68, -0.55, p)
    const elevation = 0.56 + Math.sin((p * Math.PI) / 2) * 0.5
    camera.position.set(Math.sin(angle) * 28, 0.5 + elevation * 28, Math.cos(angle) * 28)
    camera.lookAt(0, 0.5, 0)
    const zoom = Math.min(size.width / 18.8, size.height / 14.7) * (1 + Math.sin(p * Math.PI) * 0.08)
    if (camera.zoom !== zoom) {
      camera.zoom = zoom
      camera.updateProjectionMatrix()
    }
  })
  return null
}

export default function SimulationMap({ progress, paused }: { progress: MotionValue<number>; paused: boolean }) {
  const reduced = !!useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)
  const [pageVisible, setPageVisible] = useState(!document.hidden)
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    if (ref.current) observer.observe(ref.current)
    const change = () => setPageVisible(!document.hidden)
    document.addEventListener('visibilitychange', change)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', change)
    }
  }, [])
  const playing = !paused && !reduced && visible && pageVisible
  return (
    <div
      className="cm-map"
      ref={ref}
      role="img"
      aria-label="Детализированная 3D-модель склада: шесть стеллажей с паллетами, четыре робота и станции зарядки"
    >
      <SceneBoundary fallback={<SceneFallback />}>
        <Canvas
          dpr={[1.5, 2]}
          shadows={{ type: PCFShadowMap }}
          frameloop={playing ? 'always' : 'demand'}
          fallback={<SceneFallback />}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        >
          <OrthographicCamera makeDefault position={[17, 15, 21]} near={0.1} far={100} />
          <CameraRig progress={progress} reduced={reduced} playing={playing} />
          <SceneLighting />
          <group position={[0, -0.5, 0]}>
            <ObjectModel kind="warehouse" playing={playing} />
          </group>
        </Canvas>
      </SceneBoundary>
    </div>
  )
}

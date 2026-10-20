import { lazy, Suspense, useCallback, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { SceneBoundary } from '@/shared/ui/boundary'
import type { SceneSignal } from '../landing-cinematic/scene-state'

const CinematicScene = lazy(() => import('../landing-cinematic/CinematicScene'))

function Poster() {
  return (
    <img src="/design-lab/cinematic/robot-poster.png" alt="Иллюстративная модель мобильного робота" loading="lazy" />
  )
}

export function RobotPortrait() {
  const signal = useRef<SceneSignal>({ progress: 0, yaw: 0 })
  const invalidate = useRef<(() => void) | null>(null)
  const reduced = useReducedMotion()
  const [failed, setFailed] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const onFailure = useCallback(() => setFailed(true), [])
  const onReady = useCallback(() => invalidate.current?.(), [])
  useGSAP(
    (_context, contextSafe) => {
      const element = root.current
      if (reduced || !element || !contextSafe) return
      const explore = contextSafe((active: boolean) => {
        gsap.to(signal.current, {
          progress: active ? 0.13 : 0,
          yaw: active ? -0.35 : 0,
          duration: 1.3,
          ease: 'power3.out',
          overwrite: true,
          onUpdate: () => invalidate.current?.(),
        })
      })
      const enter = () => explore(true)
      const leave = () => explore(false)
      element.addEventListener('pointerenter', enter)
      element.addEventListener('pointerleave', leave)
      return () => {
        element.removeEventListener('pointerenter', enter)
        element.removeEventListener('pointerleave', leave)
      }
    },
    { scope: root, dependencies: [reduced], revertOnUpdate: true },
  )
  return (
    <div className="platform-robot-detail" ref={root}>
      <div className="platform-portrait-world" role="img" aria-label="Объёмная иллюстрация мобильного робота">
        <SceneBoundary fallback={<Poster />}>
          {failed ? (
            <Poster />
          ) : (
            <Suspense fallback={<Poster />}>
              <CinematicScene signalRef={signal} invalidateRef={invalidate} onReady={onReady} onFailure={onFailure} />
            </Suspense>
          )}
        </SceneBoundary>
      </div>
      <span className="platform-model-tag">Мобильная платформа · AMR</span>
    </div>
  )
}

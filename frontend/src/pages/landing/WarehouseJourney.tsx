import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useMotionValue } from 'framer-motion'
import { Pause, Play } from 'lucide-react'
import { useLandingMotion } from './use-landing-motion'
import { WarehouseContext, WarehouseJourneyController } from './warehouse-journey'
import './warehouse-journey.css'
const SimulationMap = lazy(() => import('./SimulationMap'))

export function WarehouseJourney({ children }: { children: ReactNode }) {
  const { reduced } = useLandingMotion()
  const progress = useMotionValue(0)
  const press = useRef<{ x: number; y: number; dragged: boolean } | null>(null)
  const [paused, setPaused] = useState(false)
  const [active, setActive] = useState(true)
  const [ready, setReady] = useState(false)
  const [controller] = useState(() => new WarehouseJourneyController(progress, setActive))
  const togglePaused = useCallback(() => setPaused((value) => !value), [])
  const onReady = useCallback(() => setReady(true), [])
  useEffect(() => {
    controller.setReduced(reduced)
  }, [controller, reduced])
  useEffect(() => {
    const stopObservingLayout = controller.observeLayout()
    window.addEventListener('scroll', controller.wake, { passive: true })
    window.addEventListener('resize', controller.wake)
    document.addEventListener('visibilitychange', controller.wake)
    return () => {
      stopObservingLayout()
      window.removeEventListener('scroll', controller.wake)
      window.removeEventListener('resize', controller.wake)
      document.removeEventListener('visibilitychange', controller.wake)
    }
  }, [controller])
  const context = useMemo(
    () => ({ controller, progress, paused, togglePaused }),
    [controller, progress, paused, togglePaused],
  )
  return (
    <WarehouseContext.Provider value={context}>
      <div className="cm-experience">
        {children}
        <div
          className="cm-shared-warehouse"
          ref={(node) => controller.bindSurface(node)}
          data-ready={ready}
          onPointerDownCapture={(event) => {
            if (event.button === 0) press.current = { x: event.clientX, y: event.clientY, dragged: false }
          }}
          onPointerMoveCapture={(event) => {
            if (press.current && Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > 7)
              press.current.dragged = true
          }}
          onPointerCancelCapture={() => {
            press.current = null
          }}
          onClick={() => {
            const pointer = press.current
            press.current = null
            if (!pointer?.dragged) controller.exploreWarehouse()
          }}
        >
          <Suspense fallback={<div className="lp-map-loading">Собираем модель объекта…</div>}>
            <SimulationMap
              controller={controller}
              active={active}
              paused={paused}
              reduced={reduced}
              onReady={onReady}
            />
          </Suspense>
          <div className="cm-shared-shade" aria-hidden="true" />
        </div>
        <button
          ref={(node) => controller.bindPause(node)}
          className="lp-preview-pause cm-shared-pause"
          type="button"
          hidden
          onClick={togglePaused}
          aria-label={paused ? 'Продолжить движение роботов' : 'Приостановить движение роботов'}
          aria-pressed={paused}
        >
          {paused ? <Play size={12} /> : <Pause size={12} />}
        </button>
      </div>
    </WarehouseContext.Provider>
  )
}

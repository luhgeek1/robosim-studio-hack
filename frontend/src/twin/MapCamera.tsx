import { useEffect, useRef, useState, type ComponentRef } from 'react'
import { useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Box, HelpCircle, Map, Minus, Plus, RotateCcw, Route } from 'lucide-react'
import { PerspectiveCamera, Vector3 } from 'three'

export type CameraAction = 'home' | 'top' | 'in' | 'out'

export function MapCamera({
  command,
  extent,
}: {
  command: { action: CameraAction; id: number }
  extent: { w: number; h: number }
}) {
  const span = Math.max(extent.w, extent.h)
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const { camera, size } = useThree()
  const viewport = useRef(size)
  viewport.current = size

  useEffect(() => {
    const orbit = controls.current
    if (!orbit || !(camera instanceof PerspectiveCamera)) return
    // Only explicit commands move the camera; simulation renders never reset the user's view.
    orbit.enableDamping = false
    orbit.update()
    if (command.action === 'in' || command.action === 'out') {
      const offset = camera.position.clone().sub(orbit.target)
      const distance = Math.max(
        span * 0.12,
        Math.min(span * 2.4, offset.length() * (command.action === 'in' ? 0.75 : 1.3)),
      )
      camera.position.copy(orbit.target).add(offset.setLength(distance))
    } else {
      const aspect = viewport.current.width / viewport.current.height
      const distance = (span * 0.62) / (Math.tan((camera.fov * Math.PI) / 360) * Math.min(aspect, 1.5))
      const direction = command.action === 'top' ? new Vector3(0, 1, 0.001) : new Vector3(0.42, 0.8, 1)
      orbit.target.set(0, 0, 0)
      camera.position.copy(direction.normalize().multiplyScalar(distance))
    }
    orbit.update()
    orbit.enableDamping = true
  }, [command, camera, span])

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan
      screenSpacePanning={false}
      enableDamping
      dampingFactor={0.12}
      rotateSpeed={0.65}
      panSpeed={0.7}
      zoomSpeed={0.8}
      minDistance={span * 0.1}
      maxDistance={span * 2.6}
      minPolarAngle={0.001}
      maxPolarAngle={Math.PI / 2 - 0.12}
      onChange={() => {
        const orbit = controls.current
        if (!orbit) return
        const bounded = orbit.target
          .clone()
          .clamp(new Vector3(-extent.w / 2, 0, -extent.h / 2), new Vector3(extent.w / 2, 0, extent.h / 2))
        camera.position.add(bounded.clone().sub(orbit.target))
        orbit.target.copy(bounded)
      }}
    />
  )
}

export function MapToolbar({
  onAction,
  routes,
  onRoutes,
}: {
  onAction: (action: CameraAction) => void
  routes: boolean
  onRoutes: () => void
}) {
  const [help, setHelp] = useState(false)
  const button =
    'flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600'
  return (
    <div className="absolute left-4 top-16 z-20 flex flex-col items-start gap-2">
      <div
        role="toolbar"
        aria-label="Управление картой"
        className="flex items-center gap-0.5 rounded-xl border border-white/80 bg-white/95 p-1 shadow-lg shadow-slate-900/5 backdrop-blur"
      >
        <button className={button} title="Общий 3D-вид" aria-label="Общий 3D-вид" onClick={() => onAction('home')}>
          <Box size={17} />
        </button>
        <button className={button} title="Вид сверху" aria-label="Вид сверху" onClick={() => onAction('top')}>
          <Map size={17} />
        </button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <button className={button} title="Приблизить" aria-label="Приблизить" onClick={() => onAction('in')}>
          <Plus size={17} />
        </button>
        <button className={button} title="Отдалить" aria-label="Отдалить" onClick={() => onAction('out')}>
          <Minus size={17} />
        </button>
        <button
          className={button}
          title="Вернуть исходный ракурс"
          aria-label="Вернуть исходный ракурс"
          onClick={() => onAction('home')}
        >
          <RotateCcw size={16} />
        </button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <button
          className={`${button} ${routes ? 'bg-sky-50 !text-sky-700' : ''}`}
          title="Маршруты"
          aria-label="Маршруты"
          aria-pressed={routes}
          onClick={onRoutes}
        >
          <Route size={17} />
        </button>
        <button
          className={button}
          title="Как управлять картой"
          aria-label="Как управлять картой"
          aria-expanded={help}
          onClick={() => setHelp((v) => !v)}
        >
          <HelpCircle size={17} />
        </button>
      </div>
      {help && (
        <div className="max-w-[290px] rounded-xl border border-slate-200 bg-white/95 p-4 text-[12px] leading-6 text-slate-600 shadow-lg">
          <p className="font-semibold text-slate-900">Управление картой</p>
          <p>
            Левая кнопка мыши — вращение.
            <br />
            Правая кнопка или Shift + левая — сдвиг.
            <br />
            Колесо — масштаб.
            <br />
            На сенсорном экране: один палец — вращение, два — сдвиг и масштаб.
          </p>
          <p className="mt-2">Ракурс сохраняется во время симуляции. Кнопка ↺ возвращает весь склад в кадр.</p>
        </div>
      )}
    </div>
  )
}

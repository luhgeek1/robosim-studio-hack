import { Component, Suspense, useEffect, useState, type ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, OrbitControls, Environment, Lightformer } from '@react-three/drei'
import { useReducedMotion } from 'framer-motion'
import { Box, Pause, Play, RotateCcw, MoveUpRight } from 'lucide-react'
import { concepts } from './catalog'
import { Machine } from './Machines'
import { Arm } from './Arm'
import { AmrLift, G2P, SorterTilt } from '@/widgets/robot-3d/models/warehouse'
import { useGallery } from '@/widgets/robot-3d/store'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/utils'

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <div className="grid h-full place-items-center p-10 text-center text-ink-3">
        Не удалось открыть 3D. Проверьте поддержку WebGL и аппаратное ускорение браузера.
      </div>
    ) : (
      this.props.children
    )
  }
}

function Scene({ index, heavy, speed, paused }: { index: number; heavy: boolean; speed: number; paused: boolean }) {
  const [kind, , , color] = concepts[index]
  const v = {
    id: kind,
    name: 'Концепт',
    spec: {
      dims_mm: (heavy ? [1200, 850, 350] : [900, 650, 260]) as [number, number, number],
      payload_kg: heavy ? 1500 : 500,
      speed_mps: speed,
      lift_mm: heavy ? 120 : 60,
    },
  }
  const shared = { kind, heavy, speed, paused, color }
  const scale = kind === 'sorting_robot' ? 1.4 : kind === 'service_robot' && heavy ? 1.18 : 1
  return (
    <>
      <color attach="background" args={['#eff1f0']} />
      <ambientLight intensity={0.65} />
      <directionalLight position={[3, 6, 5]} intensity={2.3} />
      <directionalLight position={[-4, 3, -3]} intensity={1.5} color="#b7d5ed" />
      <Environment resolution={64} frames={1}>
        <Lightformer position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[8, 8, 1]} intensity={2} />
        <Lightformer position={[-5, 2, 0]} rotation-y={Math.PI / 2} scale={[5, 3, 1]} intensity={2} />
      </Environment>
      <group position={[kind === 'tow_tractor' ? -1 : 0, 0, 0]} scale={scale}>
        {kind === 'amr_transport' ? (
          <AmrLift v={v} accent={color} />
        ) : kind === 'goods_to_person' ? (
          <G2P v={v} accent={color} />
        ) : kind === 'sorting_robot' ? (
          <SorterTilt
            v={{
              ...v,
              spec: { ...v.spec, dims_mm: heavy ? [650, 550, 280] : [420, 400, 200], payload_kg: heavy ? 30 : 10 },
            }}
            accent={color}
          />
        ) : kind.includes('arm') ? (
          <Arm {...shared} />
        ) : (
          <Machine {...shared} />
        )}
      </group>
      <ContactShadows position={[0, -0.015, 0]} opacity={0.35} scale={12} blur={2.5} far={5} resolution={256} />
      <OrbitControls
        makeDefault
        target={[0, 1, 0]}
        minDistance={3}
        maxDistance={12}
        maxPolarAngle={Math.PI / 2.05}
        enablePan={false}
      />
    </>
  )
}

export function RobotLab() {
  const [index, setIndex] = useState(0)
  const [group, setGroup] = useState('Все типы')
  const [heavy, setHeavy] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [reset, setReset] = useState(0)
  const paused = useGallery((s) => s.paused)
  const reduced = useReducedMotion()
  useEffect(() => {
    useGallery.setState({ speed })
  }, [speed])
  useEffect(() => {
    useGallery.setState({ paused: !!reduced })
    return () => {
      useGallery.setState({ paused: false })
    }
  }, [reduced])
  const [id, title, category, accent, shape, animation] = concepts[index]
  const groups = ['Все типы', 'Логистика', 'Склад', 'Производство', 'Сервис']
  return (
    <div className="mx-auto w-full max-w-360 px-6 py-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-ink-3">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Дизайн-лаборатория · временная вкладка
          </div>
          <h1 className="text-4xl font-semibold tracking-[-0.045em]">У каждой задачи — свой робот.</h1>
          <p className="mt-3 text-sm text-ink-3">
            14 типов. Разные конструкции. Посмотрите, как они устроены и двигаются.
          </p>
        </div>
        <span className="rounded-full border border-line px-4 py-2 text-xs text-ink-3">Интерактивные 3D-концепты</span>
      </div>
      <div className="mb-5 flex flex-wrap gap-2" aria-label="Категории роботов">
        {groups.map((g) => (
          <button
            key={g}
            onClick={() => {
              setGroup(g)
              const next = concepts.findIndex((c) => g === 'Все типы' || c[2] === g)
              setIndex(next)
            }}
            aria-pressed={group === g}
            className={cn(
              'rounded-full px-4 py-2 text-sm transition-colors',
              group === g ? 'bg-ink text-white' : 'bg-white text-ink-3 hover:bg-black/5',
            )}
          >
            {g}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_260px]">
        <nav
          aria-label="Тип робота"
          className="max-h-[570px] overflow-auto rounded-2xl border border-line bg-white p-2"
        >
          {concepts.map(
            (c, i) =>
              (group === 'Все типы' || c[2] === group) && (
                <button
                  key={c[0]}
                  onClick={() => setIndex(i)}
                  aria-pressed={index === i}
                  className={cn(
                    'mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[13px] transition-colors',
                    index === i ? 'bg-[#edf0f3] text-ink' : 'text-ink-3 hover:bg-black/3',
                  )}
                >
                  <span className="num text-[10px] opacity-50">{String(i + 1).padStart(2, '0')}</span>
                  <span className="flex-1 font-medium">{c[1]}</span>
                  <span className="size-2 rounded-full" style={{ background: c[3] }} />
                </button>
              ),
          )}
        </nav>
        <section
          aria-label={`3D-модель: ${title}`}
          className="relative min-h-[470px] overflow-hidden rounded-2xl border border-line bg-[#eff1f0]"
        >
          <div className="pointer-events-none absolute top-5 left-5 z-10">
            <div className="text-[10px] uppercase tracking-widest text-ink-3">
              {category} / {String(index + 1).padStart(2, '0')}
            </div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
          </div>
          <div className="absolute inset-0">
            <SceneBoundary>
              <Suspense
                fallback={
                  <div className="grid h-full place-items-center text-sm text-ink-3">Подготавливаем модель…</div>
                }
              >
                <Canvas
                  key={reset}
                  camera={{ position: [4.8, 3.6, 5.8], fov: 38 }}
                  dpr={[1, 1.5]}
                  fallback={<p>Для просмотра нужен WebGL.</p>}
                >
                  <Scene key={`${id}-${heavy}`} index={index} heavy={heavy} speed={speed} paused={paused} />
                </Canvas>
              </Suspense>
            </SceneBoundary>
          </div>
          <div className="absolute right-4 bottom-4 left-4 flex items-center justify-between gap-2">
            <span className="rounded-full bg-white/80 px-3 py-2 text-[11px] text-ink-3 backdrop-blur">
              Потяните для вращения · колесо — масштаб
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                aria-label={paused ? 'Продолжить анимацию' : 'Остановить анимацию'}
                onClick={() => useGallery.setState({ paused: !paused })}
              >
                {paused ? <Play size={15} /> : <Pause size={15} />}
              </Button>
              <Button variant="outline" size="icon" aria-label="Сбросить ракурс" onClick={() => setReset((v) => v + 1)}>
                <RotateCcw size={15} />
              </Button>
            </div>
          </div>
        </section>
        <aside className="rounded-2xl border border-line bg-white p-5">
          <div
            className="mb-5 flex size-10 items-center justify-center rounded-xl"
            style={{ background: `${accent}20`, color: accent }}
          >
            <Box size={21} />
          </div>
          <h3 className="text-lg font-semibold">Форма следует задаче</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-3">{shape}.</p>
          <div className="my-6 border-t border-line" />
          <div className="mb-3 text-[11px] uppercase tracking-wider text-ink-3">Комплектация</div>
          <div className="flex rounded-lg bg-surface-2 p-1">
            {[false, true].map((h) => (
              <button
                key={String(h)}
                aria-pressed={heavy === h}
                onClick={() => setHeavy(h)}
                className={cn('flex-1 rounded-md py-2 text-xs', heavy === h && 'bg-white font-medium shadow-sm')}
              >
                {h ? 'Усиленная' : 'Компактная'}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-3">
            {heavy
              ? 'Увеличенные габариты, рабочий ход или грузовой модуль.'
              : 'Меньшие габариты и компактный рабочий модуль.'}{' '}
            Переключите, чтобы сравнить конструкцию.
          </p>
          <label className="mt-6 block text-xs text-ink-3" htmlFor="robot-speed">
            Темп демонстрации <span className="float-right text-ink">{speed.toFixed(1)}×</span>
          </label>
          <input
            id="robot-speed"
            className="mt-3 w-full accent-slate-800"
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
          <div className="mt-6 rounded-xl bg-surface-2 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium">
              <MoveUpRight size={14} />
              {paused ? 'Анимация на паузе' : 'Рабочий цикл'}
            </div>
            <p className="text-xs leading-relaxed text-ink-3">{animation}.</p>
          </div>
        </aside>
      </div>
      <p className="mt-4 max-w-3xl text-xs leading-relaxed text-ink-3">
        Авторские демонстрационные модели типов решений, а не копии конкретных изделий. Пропорции и комплектации —
        дизайнерские допущения; анимации иллюстрируют механику и не являются результатами расчётной симуляции.
      </p>
    </div>
  )
}

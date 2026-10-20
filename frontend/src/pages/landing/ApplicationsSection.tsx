import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { animate, motion, useAnimationControls, type LegacyAnimationControls, type Variants } from 'framer-motion'
import { ArrowLeft, ArrowUpRight, MoveUpRight, Pause, Play } from 'lucide-react'
import { Link } from 'react-router'
import type { ObjectKind } from './LandingScene'
import { EASE, useLandingMotion } from './use-landing-motion'
import { useWarehouseJourney } from './warehouse-journey'
import './applications.css'

const LandingScene = lazy(() => import('./LandingScene'))
const OBJECT_LAYOUT_TRANSITION = { duration: 0.65, ease: [0.4, 0, 0.2, 1] as const }
const CONTENT_VARIANTS: Variants = {
  hidden: (reduced: boolean) => ({
    opacity: 0,
    y: reduced ? 0 : 12,
    transition: { duration: reduced ? 0 : 0.12, ease: OBJECT_LAYOUT_TRANSITION.ease },
  }),
  visible: (reduced: boolean) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: reduced ? 0 : 0.38,
      delay: reduced ? 0 : 0.14,
      ease: EASE,
      delayChildren: reduced ? 0 : 0.2,
      staggerChildren: reduced ? 0 : 0.05,
    },
  }),
}
const DETAIL_VARIANTS: Variants = {
  hidden: (reduced: boolean) => ({
    opacity: 0,
    y: reduced ? 0 : 8,
    transition: { duration: reduced ? 0 : 0.1 },
  }),
  visible: (reduced: boolean) => ({
    opacity: 1,
    y: 0,
    transition: { duration: reduced ? 0 : 0.3, ease: EASE },
  }),
}
const CHROME_VARIANTS: Variants = {
  hidden: (reduced: boolean) => ({ opacity: 0, transition: { duration: reduced ? 0 : 0.1 } }),
  visible: (reduced: boolean) => ({
    opacity: 1,
    transition: { duration: reduced ? 0 : 0.28, delay: reduced ? 0 : 0.1 },
  }),
}
type CardSlot = { left: number; top: number; width: number }
type ModelFrame = { node: HTMLElement; left: number; top: number; width: number; height: number }

type Application = {
  id: ObjectKind
  title: string
  subtitle: string
  text: string
  tags: string[]
  demo: string
  fact: string
  factLabel: string
  checks: { title: string; text: string }[]
}

const OBJECTS: Application[] = [
  {
    id: 'hospital',
    title: 'Больница',
    subtitle: 'СЕРВИСНАЯ ДОСТАВКА',
    text: 'Питание, бельё, медикаменты. Оцените доставку между отделениями с учётом графика работы.',
    tags: ['Доставка питания', 'Между отделениями'],
    demo: 'hospital_demo_01',
    fact: '650 коек',
    factLabel: 'В ПОДГОТОВЛЕННОМ ПРИМЕРЕ',
    checks: [
      { title: 'Доставка питания', text: 'Перемещение между точками обслуживания с учётом потока задач.' },
      { title: 'Общие ресурсы', text: 'Как маршруты и доступность лифтов влияют на работу парка.' },
      { title: 'Задачи персонала', text: 'Раздача питания пациентам и клиническая работа остаются у сотрудников.' },
    ],
  },
  {
    id: 'warehouse',
    title: 'Склад',
    subtitle: 'ВНУТРЕННЯЯ ЛОГИСТИКА',
    text: 'От приёмки до отгрузки. Проверьте, как парк справится с потоком паллет и узкими проходами.',
    tags: ['Перевозка паллет', 'Комплектация'],
    demo: 'warehouse_demo_01',
    fact: '20 000 м²',
    factLabel: 'ПЛОЩАДЬ ДЕМО-СКЛАДА',
    checks: [
      { title: 'Поток паллет', text: 'Сколько роботов нужно для горизонтальной перевозки при вашей нагрузке.' },
      { title: 'Работа на плане', text: 'Маршруты, очереди и зарядка в общей имитации парка.' },
      { title: 'Границы задачи', text: 'Работа с ярусами и остальные функции погрузчика остаются у людей.' },
    ],
  },
  {
    id: 'airport',
    title: 'Аэропорт',
    subtitle: 'НАЗЕМНОЕ ОБСЛУЖИВАНИЕ',
    text: 'Багаж и наземные маршруты. Сравните варианты роботизации для нагрузки вашего аэропорта.',
    tags: ['Перевозка багажа', 'Пиковая нагрузка'],
    demo: 'airport_demo_01',
    fact: 'Багажные сцепки',
    factLabel: 'СЦЕНАРИЙ ДЕМО-ПРОЕКТА',
    checks: [
      { title: 'Перевозка багажа', text: 'Работа тягачей на маршрутах объекта и потребность в парке.' },
      { title: 'Пики нагрузки', text: 'Как меняется работа при росте потока задач.' },
      { title: 'Способы внедрения', text: 'Покупка, RaaS и лизинг в сравнении с текущим способом работы.' },
    ],
  },
]

function ObjectPreview({
  kind,
  expanded,
  muted,
  content,
}: {
  kind: ObjectKind
  expanded: boolean
  muted: boolean
  content: LegacyAnimationControls
}) {
  const [paused, setPaused] = useState(false)
  const { reduced } = useLandingMotion()
  const journey = useWarehouseJourney()
  const shared = kind === 'warehouse' ? journey?.controller : undefined
  return (
    <div className="lp-object-preview">
      <div className="lp-object-model" ref={(node) => shared?.bindTarget(node)}>
        {/* Prepare the offscreen renderers at startup; creating WebGL contexts during docking stalls the scroll. */}
        {!shared && (
          <Suspense fallback={<div className="lp-object-loading" />}>
            <LandingScene
              kind={kind}
              paused={paused || muted}
              resizeDelay={OBJECT_LAYOUT_TRANSITION.duration * 1000 + 100}
            />
          </Suspense>
        )}
      </div>
      {!shared && (
        <motion.button
          type="button"
          className="lp-preview-pause"
          initial="visible"
          animate={content}
          custom={reduced}
          variants={CHROME_VARIANTS}
          onClick={() => setPaused((value) => !value)}
          aria-label={paused ? 'Продолжить движение роботов' : 'Приостановить движение роботов'}
          aria-pressed={paused}
        >
          {paused ? <Play size={12} /> : <Pause size={12} />}
        </motion.button>
      )}
      {expanded && (
        <motion.span
          className="lp-object-model-hint"
          initial="hidden"
          animate={content}
          custom={reduced}
          variants={CHROME_VARIANTS}
        >
          ПОВЕРНИТЕ МОДЕЛЬ, ЧТОБЫ РАССМОТРЕТЬ ДЕТАЛИ
        </motion.span>
      )}
    </div>
  )
}

export function ApplicationsSection() {
  const { reveal, reduced } = useLandingMotion()
  const controller = useWarehouseJourney()?.controller
  const [selected, setSelected] = useState<ObjectKind | null>(null)
  const [slots, setSlots] = useState<Partial<Record<ObjectKind, CardSlot>>>({})
  const [stageHeight, setStageHeight] = useState<number>()
  const content = useAnimationControls()
  const grid = useRef<HTMLDivElement>(null)
  const back = useRef<HTMLButtonElement>(null)
  const lastSelected = useRef<ObjectKind | null>(null)
  const press = useRef<{ x: number; y: number; dragged: boolean } | null>(null)
  const restoreFocus = useRef(false)
  const transitionId = useRef(0)
  const requested = useRef<ObjectKind | null>(null)
  const selectedRef = useRef<ObjectKind | null>(null)
  const browseScroll = useRef<number | null>(null)
  const scrollPlayback = useRef<{ stop: () => void } | null>(null)
  const modelFrames = useRef<ModelFrame[]>([])
  const modelAnimations = useRef(new Map<HTMLElement, Animation>())
  const captureModels = useCallback(() => {
    modelFrames.current = Array.from(grid.current?.querySelectorAll<HTMLElement>('.lp-object-model') ?? [], (node) => {
      const rect = node.getBoundingClientRect()
      return { node, left: rect.left, top: rect.top + window.scrollY, width: rect.width, height: rect.height }
    })
  }, [])

  useLayoutEffect(() => {
    // Keep the live canvas on one compositor animation, without ancestor layout
    // projections or JS transform updates competing with the WebGL render loop.
    for (const before of modelFrames.current) {
      const { node } = before
      modelAnimations.current.get(node)?.cancel()
      modelAnimations.current.delete(node)
      if (reduced || !node.isConnected) continue
      const after = node.getBoundingClientRect()
      if (!after.width || !after.height) continue
      const x = before.left - after.left
      const y = before.top - (after.top + window.scrollY)
      const scaleX = before.width / after.width
      const scaleY = before.height / after.height
      if (Math.abs(x) + Math.abs(y) + Math.abs(before.width - after.width) < 0.1) continue
      const animation = node.animate(
        [
          { transform: `translate3d(${x}px, ${y}px, 0) scale(${scaleX}, ${scaleY})` },
          { transform: 'translate3d(0, 0, 0) scale(1, 1)' },
        ],
        {
          duration: OBJECT_LAYOUT_TRANSITION.duration * 1000,
          easing: `cubic-bezier(${OBJECT_LAYOUT_TRANSITION.ease.join(',')})`,
          fill: 'both',
        },
      )
      modelAnimations.current.set(node, animation)
      animation.onfinish = () => {
        if (modelAnimations.current.get(node) !== animation) return
        animation.cancel()
        modelAnimations.current.delete(node)
      }
    }
    modelFrames.current = []
  }, [selected, reduced])
  const moveScroll = useCallback(
    (top: number) => {
      scrollPlayback.current?.stop()
      if (reduced || Math.abs(window.scrollY - top) < 1) {
        window.scrollTo({ top, behavior: 'instant' })
        return
      }
      // Keep viewport movement on the same clock and easing as the model's FLIP animation.
      scrollPlayback.current = animate(window.scrollY, top, {
        ...OBJECT_LAYOUT_TRANSITION,
        onUpdate: (value) => window.scrollTo({ top: value, behavior: 'instant' }),
      })
    },
    [reduced],
  )
  const focusSummary = useCallback(() => {
    grid.current
      ?.querySelector<HTMLButtonElement>(`[data-object="${lastSelected.current}"] .lp-object-action`)
      ?.focus({ preventScroll: true })
  }, [])
  const close = useCallback(async () => {
    if (requested.current === null) return
    const ticket = ++transitionId.current
    requested.current = null
    scrollPlayback.current?.stop()
    await content.start('hidden')
    if (ticket !== transitionId.current) return
    if (selectedRef.current === null) {
      focusSummary()
      void content.start('visible')
      return
    }
    restoreFocus.current = true
    captureModels()
    selectedRef.current = null
    setSelected(null)
    if (browseScroll.current !== null) moveScroll(browseScroll.current)
  }, [content, focusSummary, moveScroll, captureModels])
  const open = async (kind: ObjectKind) => {
    if (requested.current === kind) return
    const ticket = ++transitionId.current
    requested.current = kind
    scrollPlayback.current?.stop()
    lastSelected.current = kind
    restoreFocus.current = false
    // Let the current copy fade before changing its width, type size and line breaks.
    await content.start('hidden')
    if (ticket !== transitionId.current) return
    captureModels()
    const positions: Partial<Record<ObjectKind, CardSlot>> = {}
    grid.current?.querySelectorAll<HTMLElement>('.lp-object').forEach((card) => {
      positions[card.dataset.object as ObjectKind] = {
        left: card.offsetLeft,
        top: card.offsetTop,
        width: card.offsetWidth,
      }
    })
    setSlots(positions)
    browseScroll.current = window.scrollY
    const scrollTarget = grid.current ? window.scrollY + grid.current.getBoundingClientRect().top - 112 : window.scrollY
    selectedRef.current = kind
    setSelected(kind)
    if (grid.current && grid.current.getBoundingClientRect().top < 105) {
      moveScroll(scrollTarget)
    }
  }

  useLayoutEffect(() => {
    if (!controller) return
    controller.setSelection(selected, () => void open('warehouse'))
  })

  useEffect(() => {
    // New detail blocks subscribe to the shared controls after this commit.
    const ticket = transitionId.current
    const frame = requestAnimationFrame(() => {
      if (ticket === transitionId.current && selectedRef.current === requested.current) void content.start('visible')
    })
    if (selected) back.current?.focus({ preventScroll: true })
    else if (restoreFocus.current) {
      focusSummary()
      restoreFocus.current = false
    }
    return () => cancelAnimationFrame(frame)
  }, [selected, content, focusSummary])

  useEffect(() => {
    const node = grid.current
    if (!node) return
    const measure = () => setStageHeight(node.offsetHeight)
    const observer = new ResizeObserver(measure)
    measure()
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(
    () => () => {
      transitionId.current++
      content.stop()
      scrollPlayback.current?.stop()
      modelAnimations.current.forEach((animation) => animation.cancel())
      modelAnimations.current.clear()
    },
    [content],
  )

  useEffect(() => {
    const stopScroll = () => scrollPlayback.current?.stop()
    window.addEventListener('wheel', stopScroll, { passive: true })
    window.addEventListener('touchstart', stopScroll, { passive: true })
    return () => {
      window.removeEventListener('wheel', stopScroll)
      window.removeEventListener('touchstart', stopScroll)
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && requested.current !== null) {
        event.preventDefault()
        void close()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  return (
    <section className="lp-applications" id="applications" aria-labelledby="applications-title">
      <div className="landing-container">
        <div className="lp-section-meta">
          <span>01 / СРЕДА ПРИМЕНЕНИЯ</span>
          <span>ВАШ ОБЪЕКТ. ВАШИ УСЛОВИЯ.</span>
        </div>
        <motion.div className="lp-applications-heading" {...reveal()}>
          <h2 id="applications-title">
            Разные пространства.
            <br />
            <span>Один точный подход.</span>
          </h2>
          <p>
            У каждого объекта своя логика.
            <br />
            Соберите её в модели и проверьте,
            <br />
            где роботизация имеет смысл.
          </p>
        </motion.div>
        <motion.div
          className="lp-objects-stage"
          initial={false}
          animate={{ height: stageHeight ?? 'auto' }}
          transition={reduced ? { duration: 0 } : OBJECT_LAYOUT_TRANSITION}
        >
          <div className={`lp-objects${selected ? ' lp-objects--focused' : ''}`} ref={grid}>
            {OBJECTS.map((object) => {
              const index = OBJECTS.indexOf(object)
              const expanded = selected === object.id
              const muted = selected !== null && !expanded
              const slot = slots[object.id]
              return (
                <motion.article
                  className={`lp-object${expanded ? ' lp-object--focused' : ''}${muted ? ' lp-object--muted' : ''}`}
                  data-object={object.id}
                  id={`application-${object.id}`}
                  key={object.id}
                  inert={muted}
                  aria-hidden={muted || undefined}
                  style={muted && slot ? { position: 'absolute', ...slot } : undefined}
                  onPointerDownCapture={(event) => {
                    if (event.button === 0) press.current = { x: event.clientX, y: event.clientY, dragged: false }
                  }}
                  onPointerMoveCapture={(event) => {
                    if (
                      press.current &&
                      Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > 7
                    )
                      press.current.dragged = true
                  }}
                  onPointerCancelCapture={() => {
                    press.current = null
                  }}
                  onClick={(event) => {
                    const pointer = press.current
                    press.current = null
                    if (
                      selected ||
                      pointer?.dragged ||
                      (event.target instanceof Element && event.target.closest('button, a'))
                    )
                      return
                    void open(object.id)
                  }}
                  initial={false}
                  animate={{
                    opacity: muted ? 0 : 1,
                    visibility: 'visible',
                    transitionEnd: { visibility: muted ? 'hidden' : 'visible' },
                  }}
                  transition={{
                    opacity: {
                      duration: reduced ? 0 : muted ? 0.2 : 0.38,
                      delay: reduced || muted ? 0 : 0.14,
                      ease: EASE,
                    },
                  }}
                >
                  {expanded && (
                    <motion.div
                      className="lp-object-focus-bar"
                      initial="hidden"
                      animate={content}
                      custom={reduced}
                      variants={CHROME_VARIANTS}
                    >
                      <button ref={back} type="button" onClick={() => void close()}>
                        <ArrowLeft size={16} />
                        Все объекты
                      </button>
                      <span>
                        0{index + 1} / {object.title.toUpperCase()}
                      </span>
                      <span>ИССЛЕДУЙТЕ СЦЕНАРИЙ</span>
                    </motion.div>
                  )}
                  <motion.div
                    className="lp-object-index"
                    initial="visible"
                    animate={content}
                    custom={reduced}
                    variants={CHROME_VARIANTS}
                  >
                    <span>0{index + 1}</span>
                    <span className="lp-object-interaction">НАЖМИТЕ, ЧТОБЫ ИССЛЕДОВАТЬ</span>
                  </motion.div>
                  <div className="lp-object-composition">
                    <ObjectPreview kind={object.id} expanded={expanded} muted={muted} content={content} />
                    <motion.div
                      className="lp-object-copy"
                      initial="visible"
                      animate={content}
                      custom={reduced}
                      variants={CONTENT_VARIANTS}
                    >
                      <span className="lp-object-subtitle">{object.subtitle}</span>
                      <h3>{object.title}</h3>
                      <p>{object.text}</p>
                      <div className="lp-object-tags">
                        {object.tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                      {expanded ? (
                        <>
                          <div className="lp-object-fact">
                            <strong>{object.fact}</strong>
                            <span>{object.factLabel}</span>
                          </div>
                          <Link className="lp-object-demo" to={`/demo/${object.demo}`}>
                            Открыть демо
                            <ArrowUpRight size={17} />
                          </Link>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="lp-object-action"
                          aria-label={`Изучить сценарий: ${object.title}`}
                          aria-expanded={false}
                          aria-controls={`application-${object.id}`}
                          onClick={() => void open(object.id)}
                        >
                          Изучить сценарий
                          <MoveUpRight size={16} />
                        </button>
                      )}
                    </motion.div>
                    {expanded && (
                      <motion.aside
                        className="lp-object-details"
                        aria-label={`Подробнее о сценарии: ${object.title}`}
                        initial="hidden"
                        animate={content}
                        custom={reduced}
                        variants={CONTENT_VARIANTS}
                      >
                        <span className="lp-object-detail-kicker">В ПОДГОТОВЛЕННОМ ПРИМЕРЕ</span>
                        {object.checks.map((check, checkIndex) => (
                          <motion.div
                            className="lp-object-detail"
                            key={check.title}
                            custom={reduced}
                            variants={DETAIL_VARIANTS}
                          >
                            <span>0{checkIndex + 1}</span>
                            <div>
                              <h4>{check.title}</h4>
                              <p>{check.text}</p>
                            </div>
                          </motion.div>
                        ))}
                      </motion.aside>
                    )}
                  </div>
                </motion.article>
              )
            })}
          </div>
        </motion.div>
        <p className="lp-applications-note">
          <span />
          3D-модели типовых объектов. В проекте планировка строится по вашим параметрам.
        </p>
        <span className="sr-only" role="status">
          {selected
            ? `Открыт сценарий: ${OBJECTS.find((object) => object.id === selected)?.title}`
            : 'Выберите объект, чтобы рассмотреть сценарий.'}
        </span>
      </div>
    </section>
  )
}

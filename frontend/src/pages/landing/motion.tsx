import { EASE, useLandingMotion } from './use-landing-motion'
import { useEffect, useId, useRef, type PointerEvent, type ReactNode } from 'react'
import {
  animate,
  AnimatePresence,
  motion,
  useAnimationControls,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionStyle,
} from 'framer-motion'
import { Plus } from 'lucide-react'

export function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const smooth = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.001 })
  const reduced = useReducedMotion()
  return (
    <motion.div
      className="landing-scroll-progress"
      style={{ scaleX: reduced ? scrollYProgress : smooth }}
      aria-hidden="true"
    />
  )
}

export function Accent({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion()
  return (
    <motion.span
      className="landing-text-accent"
      initial={reduced ? false : { backgroundSize: '0% 100%' }}
      whileInView={{ backgroundSize: '100% 100%' }}
      viewport={{ once: true }}
      transition={{ duration: reduced ? 0 : 0.7, delay: reduced ? 0 : 0.3, ease: EASE }}
    >
      {children}
    </motion.span>
  )
}

export function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)
  const inView = useInView(ref, { once: true, amount: 0.4 })
  const reduced = useReducedMotion()
  const number = useMotionValue(value)
  const format = (n: number) =>
    n.toLocaleString('ru-RU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).replace('-', '−')
  const display = useTransform(number, format)

  useEffect(() => {
    if (reduced) {
      number.set(value)
      return
    }
    if (!inView) return
    const first = !started.current
    if (first) number.set(0)
    started.current = true
    const animation = animate(number, value, { duration: first ? 1.35 : 0.6, ease: EASE })
    return () => animation.stop()
  }, [inView, number, reduced, value])

  return (
    <span ref={ref} className="landing-counter">
      <span className="landing-number-accessible">{format(value)}</span>
      <motion.span aria-hidden="true">{display}</motion.span>
    </span>
  )
}

export function TiltCard({ children, className, delay }: { children: ReactNode; className: string; delay: number }) {
  const { reduced, reveal } = useLandingMotion()
  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const rotateX = useSpring(rx, { stiffness: 220, damping: 24 })
  const rotateY = useSpring(ry, { stiffness: 220, damping: 24 })
  const px = useMotionValue(50)
  const py = useMotionValue(0)
  const spotlightX = useMotionTemplate`${px}%`
  const spotlightY = useMotionTemplate`${py}%`

  const move = (event: PointerEvent<HTMLElement>) => {
    if (reduced || event.pointerType !== 'mouse') return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height
    rx.set((0.5 - y) * 5)
    ry.set((x - 0.5) * 5)
    px.set(x * 100)
    py.set(y * 100)
  }
  const reset = () => {
    rx.set(0)
    ry.set(0)
  }

  return (
    <motion.article
      className={className}
      {...reveal(delay)}
      onPointerMove={move}
      onPointerLeave={reset}
      onPointerCancel={reset}
      whileHover={reduced ? undefined : { y: -7, transition: { duration: 0.25 } }}
      style={
        {
          rotateX: reduced ? 0 : rotateX,
          rotateY: reduced ? 0 : rotateY,
          transformPerspective: 900,
          '--spotlight-x': spotlightX,
          '--spotlight-y': spotlightY,
        } as MotionStyle
      }
    >
      {children}
    </motion.article>
  )
}

export function SceneTransition({ sceneKey, children }: { sceneKey: string; children: ReactNode }) {
  const controls = useAnimationControls()
  const reduced = useReducedMotion()
  useEffect(() => {
    void controls.start({
      opacity: reduced ? 1 : [0.35, 1],
      scale: reduced ? 1 : [0.97, 1],
      transition: { duration: reduced ? 0 : 0.55, ease: EASE },
    })
  }, [controls, reduced, sceneKey])
  return (
    <motion.div className="landing-scene-stage" animate={controls}>
      {children}
    </motion.div>
  )
}

export function AnimatedFaq({
  question,
  answer,
  index,
  open,
  onToggle,
}: {
  question: string
  answer: string
  index: number
  open: boolean
  onToggle: () => void
}) {
  const id = useId()
  const { reduced, reveal } = useLandingMotion()
  return (
    <motion.div className="landing-faq-item" data-open={open} {...reveal(index * 0.06, 20)}>
      <h3>
        <button
          className="landing-faq-question"
          id={`${id}-question`}
          type="button"
          aria-expanded={open}
          aria-controls={open ? `${id}-answer` : undefined}
          onClick={onToggle}
        >
          <span className="landing-faq-number" aria-hidden="true">
            0{index + 1}
          </span>
          <span className="landing-faq-question-text">{question}</span>
          <motion.span
            className="landing-faq-toggle"
            animate={{ rotate: open ? 45 : 0 }}
            transition={{ duration: reduced ? 0 : 0.25 }}
          >
            <Plus size={21} strokeWidth={1.5} />
          </motion.span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="landing-faq-answer"
            id={`${id}-answer`}
            role="region"
            aria-labelledby={`${id}-question`}
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.35, ease: EASE }}
          >
            <p>{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

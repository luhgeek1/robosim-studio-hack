import { Children, useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

// Эффекты Kinetics (kinetics.colorion.co, github.com/ckissi/kinetics): параметры — как в их React-коде.
const SCRAMBLE_CHARS = '!<>-_/[]{}=+*^?#'
const SCRAMBLE_FRAMES = 24
const SCRAMBLE_FRAME_MS = 35
const STAGGER_STEP_MS = 90
const STAGGER_MAX_MS = 540

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* Scramble Reveal: символы перебирают случайные глифы и встают на место слева направо. */
export function ScrambleText({ text, className }: { text: string; className?: string }) {
  const [shown, setShown] = useState(text)
  const still = reducedMotion()
  useEffect(() => {
    if (still) return
    let frame = 0
    const id = window.setInterval(() => {
      frame++
      setShown(
        text
          .split('')
          .map((c, i) => {
            // Пробелы и разделители разрядов не перебираем, чтобы ширина числа не прыгала.
            if (c === ' ' || c === ' ' || c === ' ' || c === ',') return c
            return frame - i * 1.2 > SCRAMBLE_FRAMES * 0.6
              ? c
              : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
          })
          .join(''),
      )
      if (frame > SCRAMBLE_FRAMES + text.length) {
        window.clearInterval(id)
        setShown(text)
      }
    }, SCRAMBLE_FRAME_MS)
    return () => window.clearInterval(id)
  }, [text, still])
  return (
    <span className={className} aria-label={text}>
      {still ? text : shown}
    </span>
  )
}

/* Number Counter: число подпрыгивает с перелётом, когда меняется значение. */
export function Bump({ value, children, className }: { value: unknown; children: ReactNode; className?: string }) {
  const [bump, setBump] = useState(false)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setBump(true)
    const id = window.setTimeout(() => setBump(false), 400)
    return () => window.clearTimeout(id)
  }, [value])
  return (
    <span
      className={cn('inline-block', className)}
      style={{
        transform: bump ? 'scale(1.25) translateY(-6px)' : 'none',
        transition: 'transform 0.4s cubic-bezier(.34,1.56,.64,1)',
      }}
    >
      {children}
    </span>
  )
}

/* Stagger Entrance: элементы поднимаются по очереди, когда список попадает в видимую область. */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(reducedMotion)
  useEffect(() => {
    const el = ref.current
    if (!el || visible) return
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setVisible(true), {
      threshold: 0.15,
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [visible])
  return (
    <div ref={ref} className={className}>
      {Children.toArray(children).map((child, i) => {
        const delay = Math.min(i * STAGGER_STEP_MS, STAGGER_MAX_MS)
        return (
          <div
            key={i}
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(14px)',
              transition: `opacity .45s cubic-bezier(.16,1,.3,1) ${delay}ms, transform .45s cubic-bezier(.16,1,.3,1) ${delay}ms`,
            }}
          >
            {child}
          </div>
        )
      })}
    </div>
  )
}

/* Pulse Badge: точка «идёт процесс» излучает два расходящихся кольца. */
export function PulseDot({ className }: { className?: string }) {
  return <span className={cn('pulse-dot', className)} aria-hidden />
}

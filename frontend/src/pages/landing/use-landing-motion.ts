import { useReducedMotion, type MotionProps } from 'framer-motion'

export const EASE = [0.22, 1, 0.36, 1] as const

const visible = { opacity: 1, y: 0 }

export function useLandingMotion() {
  const reduced = !!useReducedMotion()
  const reveal = (delay = 0, distance = 32): MotionProps => ({
    initial: reduced ? false : { opacity: 0, y: distance },
    whileInView: visible,
    viewport: { once: true, amount: 0.12, margin: '0px 0px -32px 0px' },
    transition: { duration: reduced ? 0 : 0.7, delay: reduced ? 0 : delay, ease: EASE },
  })
  const enter = (delay = 0): MotionProps => ({
    initial: reduced ? false : { opacity: 0, y: 24 },
    animate: visible,
    transition: { duration: reduced ? 0 : 0.8, delay: reduced ? 0 : delay, ease: EASE },
  })
  return { reduced, reveal, enter }
}

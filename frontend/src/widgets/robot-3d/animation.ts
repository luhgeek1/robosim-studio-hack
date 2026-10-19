import { useFrame } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'
import { useGallery } from './store'

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

export const ease = (x: number) => {
  const c = clamp01(x)
  return c * c * (3 - 2 * c)
}

/** Eased 0 → 1 progress of `t` through the window [a, b]. */
export const seg = (t: number, a: number, b: number) => ease((t - a) / (b - a))

/** 0 → 1 → 0 bump: up during [a, b], down during [c, d]. */
export const hold = (t: number, a: number, b: number, c: number, d: number) => seg(t, a, b) - seg(t, c, d)

/** Local animation clock that stops while the gallery is paused; `dt` is 0 on paused frames. */
export function useTick(cb: (t: number, dt: number) => void) {
  const t = useRef(0)
  useFrame((_, delta) => {
    const dt = useGallery.getState().paused ? 0 : Math.min(delta, 0.05) * useGallery.getState().speed
    t.current += dt
    cb(t.current, dt)
  })
}

/** Distance driven by a robot: the lane scrolls and the wheels roll from the same odometer. */
export type Drive = { speed: number; odo: number }

export function useDrive(): RefObject<Drive> {
  return useRef<Drive>({ speed: 0, odo: 0 })
}

/** Planar two-link IK: shoulder and elbow angles that put the wrist at (r, y) from the shoulder; elbow up. */
export function ik2(r: number, y: number, a: number, b: number) {
  const d = Math.min(Math.hypot(r, y), a + b - 1e-3)
  const e = Math.acos(Math.max(-1, Math.min(1, (d * d - a * a - b * b) / (2 * a * b))))
  const s = Math.atan2(y, r) + Math.atan2(b * Math.sin(e), a + b * Math.cos(e))
  return { s, e }
}

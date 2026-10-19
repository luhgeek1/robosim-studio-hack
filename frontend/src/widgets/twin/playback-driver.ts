import { useEffect } from 'react'
import { usePlayback } from '@/entities/simulation'

export const clock = (seconds: number) => {
  const m = Math.floor(seconds / 60)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

// One animation loop advances the shared clock; the 2D plan, the 3D twin and the KPI panel only read it.
export function usePlaybackDriver() {
  const tick = usePlayback((s) => s.tick)
  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const loop = (now: number) => {
      tick(Math.min(0.1, (now - last) / 1000))
      last = now
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [tick])
}

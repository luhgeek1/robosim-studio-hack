import { useEffect, useState, type RefObject } from 'react'
import { blend, type ImmersiveSignal } from './scene-state'

function useMediaMatch(query: string) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const media = matchMedia(query)
    const change = () => setMatches(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [query])
  return matches
}

export const useCompactScene = () => useMediaMatch('(max-width: 760px)')
export const useReducedScene = () => useMediaMatch('(prefers-reduced-motion: reduce)')

export function useImmersiveMotion(
  rootRef: RefObject<HTMLElement | null>,
  signalRef: RefObject<ImmersiveSignal>,
  invalidateRef: RefObject<(() => void) | null>,
  enabled: boolean,
) {
  useEffect(() => {
    const root = rootRef.current
    if (!root || !enabled) return
    const product = root.querySelector<HTMLElement>('.im-stage .im-product-frame')
    let frame = 0
    const update = () => {
      frame = 0
      const rect = root.getBoundingClientRect()
      const progress = Math.max(0, Math.min(1, -rect.top / (rect.height - innerHeight)))
      signalRef.current.progress = progress
      root.style.setProperty('--dock', String(blend(progress, 0.64, 0.9)))
      root.style.setProperty('--shade', String(1 - blend(progress, 0.03, 0.4)))
      root.style.setProperty('--reveal', String(blend(progress, 0.72, 0.91)))
      root.style.setProperty('--progress', String(progress))
      if (product) product.inert = progress < 0.91
      invalidateRef.current?.()
    }
    const schedule = () => {
      if (!frame && !document.hidden) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    document.addEventListener('visibilitychange', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      document.removeEventListener('visibilitychange', schedule)
      cancelAnimationFrame(frame)
      if (product) product.inert = false
    }
  }, [enabled, rootRef, signalRef, invalidateRef])
}

import { useSyncExternalStore } from 'react'

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}

// Узкий экран — телефон, уже брейкпойнта sm (640 px): графикам нужны меньше подписей и своя раскладка.
export const useNarrow = () => useMediaQuery('(max-width: 639px)')

import type { Transition } from 'framer-motion'

export const SPRING: Transition = { type: 'spring', stiffness: 520, damping: 42, mass: 0.8 }
export const SOFT: Transition = { type: 'spring', stiffness: 160, damping: 26 }

// Строки списков появляются лесенкой, но не дольше ~0,3 с на весь список.
export const stagger = (index: number) => ({ ...SPRING, delay: Math.min(index, 12) * 0.022 })

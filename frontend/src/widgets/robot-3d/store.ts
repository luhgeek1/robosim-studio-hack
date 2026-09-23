import { create } from 'zustand'

// Global, not React context: the 3D views are portalled into the shared canvas and don't see the page's providers.
export const useGallery = create<{
  paused: boolean
  speed: number
  human: boolean
  togglePaused: () => void
  toggleHuman: () => void
  setSpeed: (speed: number) => void
}>((set) => ({
  paused: false,
  speed: 1,
  human: false,
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  toggleHuman: () => set((s) => ({ human: !s.human })),
  setSpeed: (speed) => set({ speed }),
}))

export type DragState = { yaw: number }

import { create } from 'zustand'

// Only interface state lives here; everything from the server goes through TanStack Query hooks in `api/`.
export type Toast = { id: number; text: string; tone?: 'default' | 'error' }

type State = {
  toasts: Toast[]
  productId: string | null
  trustOpen: boolean
  traceCalculationId: string | null
  traceQuery: string
  toast: (text: string, tone?: Toast['tone']) => void
  dismissToast: (id: number) => void
  openProduct: (id: string | null) => void
  setTrustOpen: (open: boolean) => void
  openTrace: (calculationId: string | null, query?: string) => void
  setTraceQuery: (query: string) => void
}

let toastSeq = 1

export const useStore = create<State>((set, get) => ({
  toasts: [],
  productId: null,
  trustOpen: false,
  traceCalculationId: null,
  traceQuery: '',
  toast: (text, tone = 'default') => {
    const id = toastSeq++
    set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }))
    setTimeout(() => get().dismissToast(id), tone === 'error' ? 6000 : 3600)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  openProduct: (productId) => set({ productId }),
  setTrustOpen: (trustOpen) => set({ trustOpen }),
  openTrace: (traceCalculationId, traceQuery = '') => set({ traceCalculationId, traceQuery }),
  setTraceQuery: (traceQuery) => set({ traceQuery }),
}))

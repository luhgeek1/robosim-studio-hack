import type { ReactNode } from 'react'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Tooltip } from 'radix-ui'
import { problemText } from '@/api/problem'
import { SessionProvider } from '@/api/SessionProvider'
import { useStore } from '@/store'

// Mutation errors surface as a toast unless the screen shows them itself (meta.silent).
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      if (!mutation.meta?.silent) useStore.getState().toast(problemText(error), 'error')
    },
  }),
})

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <Tooltip.Provider delayDuration={150}>{children}</Tooltip.Provider>
      </SessionProvider>
    </QueryClientProvider>
  )
}

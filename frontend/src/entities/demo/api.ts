import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiPublic } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'
import type { SimulationReplay } from '@/shared/api/types'

type S = components['schemas']
export type DemoSnapshot = S['DemoSnapshot']
export type DemoProject = S['DemoProject']
export type DemoChanges = S['DemoWhatIfRequest']
export type DemoResult = S['DemoWhatIfResult']
type Preparation = S['DemoPreparation']
const path = (key: string) => `/demo/projects/${encodeURIComponent(key)}`

export const useDemoList = () =>
  useQuery({
    queryKey: ['public-demo-list'],
    queryFn: ({ signal }) =>
      apiPublic.get<{ items: DemoProject[] }>('/demo/projects', { signal }).then((r) => r.data.items),
    staleTime: 60_000,
  })

export const useDemo = (key: string, options: { timeoutMs?: number; enabled?: boolean } = {}) =>
  useQuery({
    queryKey: ['public-demo', key],
    queryFn: ({ signal }) =>
      apiPublic.get<DemoSnapshot | Preparation>(path(key), { signal, timeout: options.timeoutMs }).then((r) => r.data),
    refetchInterval: (query) => {
      const data = query.state.data
      return data && 'status' in data ? data.retry_after_s * 1000 : false
    },
    staleTime: 60_000,
    enabled: options.enabled,
  })

export const useDemoWhatIf = (demo: DemoSnapshot, changes: DemoChanges, enabled: boolean) =>
  useQuery<DemoResult>({
    queryKey: ['public-demo-what-if', demo.demo.key, demo.revision, changes],
    queryFn: ({ signal }) =>
      apiPublic
        .post<DemoResult>(`${path(demo.demo.key)}/what-if`, changes, { signal, params: { revision: demo.revision } })
        .then((r) => r.data),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  })

export const useDemoReplay = (key: string, revision: string, from: number, enabled: boolean) =>
  useQuery({
    queryKey: ['public-demo-replay', key, revision, from],
    queryFn: ({ signal }) =>
      apiPublic
        .get<SimulationReplay>(`${path(key)}/replay`, {
          params: { from_s: from, to_s: from + 3600, revision },
          signal,
        })
        .then((r) => r.data),
    enabled,
    staleTime: 60_000,
  })

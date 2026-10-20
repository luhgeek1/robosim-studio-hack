import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/entities/session'
import { api } from '@/shared/api/client'
import type { components } from '@/shared/api/schema'

export type Job = components['schemas']['Job']
export const jobsKey = ['jobs'] as const
export const jobActive = (job: Job) => job.status === 'queued' || job.status === 'running'
export const jobApi = {
  list: () => api.get<components['schemas']['JobList']>('/jobs').then((r) => r.data.items),
  get: (id: string) => api.get<Job>(`/jobs/${id}`).then((r) => r.data),
}

export function useJobs() {
  const { user } = useSession()
  return useQuery({
    queryKey: [...jobsKey, user?.id],
    queryFn: jobApi.list,
    enabled: Boolean(user),
    staleTime: 0,
    refetchInterval: (query) => (query.state.data?.some(jobActive) ? 1000 : 5000),
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    retry: 1,
  })
}

export function useActiveSweep(scenarioId: string | undefined) {
  return useJobs().data?.find((job) => job.scenario_id === scenarioId && job.kind === 'fleet_sweep' && jobActive(job))
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { qk } from '@/api/keys'
import type {
  FleetSweepRequest,
  FleetSweepResult,
  Job,
  Res,
  SimEvent,
  SimulationReplay,
  SimulationRequest,
} from '@/api/types'

// Fields with contract defaults are optional for the caller; the backend fills them in.
export type SimulationStart = Pick<SimulationRequest, 'mode'> & Partial<Omit<SimulationRequest, 'mode'>>

const REPLAY_PAGE_S = 3600
const POLL_MS = 1200

export const simulationApi = {
  list: (scenarioId: string) =>
    api
      .get<Res<'/api/v1/scenarios/{scenario_id}/simulations', 'get'>>(`/scenarios/${scenarioId}/simulations`)
      .then((r) => r.data.items),
  start: (scenarioId: string, body: SimulationStart) =>
    api
      .post<Res<'/api/v1/scenarios/{scenario_id}/simulations', 'post'>>(`/scenarios/${scenarioId}/simulations`, body)
      .then((r) => r.data),
  get: (id: string) =>
    api.get<Res<'/api/v1/simulations/{simulation_id}', 'get'>>(`/simulations/${id}`).then((r) => r.data),
  timeline: (id: string) =>
    api
      .get<Res<'/api/v1/simulations/{simulation_id}/timeline', 'get'>>(`/simulations/${id}/timeline`)
      .then((r) => r.data),
  heatmap: (id: string) =>
    api
      .get<Res<'/api/v1/simulations/{simulation_id}/heatmap', 'get'>>(`/simulations/${id}/heatmap`)
      .then((r) => r.data),
  replayPage: (id: string, fromS: number) =>
    api
      .get<Res<'/api/v1/simulations/{simulation_id}/replay', 'get'>>(`/simulations/${id}/replay`, {
        params: { from_s: fromS, to_s: fromS + REPLAY_PAGE_S },
      })
      .then((r) => r.data),
  sweep: (scenarioId: string, body: FleetSweepRequest) =>
    api.post<Job>(`/scenarios/${scenarioId}/fleet-sweep`, body).then((r) => r.data),
  sweepResult: (scenarioId: string, jobId: string) =>
    api
      .get<Res<'/api/v1/scenarios/{scenario_id}/fleet-sweep/{job_id}', 'get'>>(
        `/scenarios/${scenarioId}/fleet-sweep/${jobId}`,
      )
      .then((r) => r.data),
  job: (id: string) => api.get<Res<'/api/v1/jobs/{job_id}', 'get'>>(`/jobs/${id}`).then((r) => r.data),
}

// The player needs the whole day at once to scrub freely; pages are an API concern, not a screen one.
async function fetchFullReplay(id: string): Promise<SimulationReplay> {
  const first = await simulationApi.replayPage(id, 0)
  const events: SimEvent[] = [...first.events]
  let next = first.next_from_s
  while (next != null && next < first.total_seconds) {
    const page = await simulationApi.replayPage(id, next)
    events.push(...page.events)
    next = page.next_from_s
  }
  return { ...first, to_s: first.total_seconds, next_from_s: null, events }
}

const isRunning = (status: string | undefined) => status === 'queued' || status === 'running'

export const useSimulations = (scenarioId: string | undefined) =>
  useQuery({
    queryKey: qk.simulations.list(scenarioId ?? ''),
    queryFn: () => simulationApi.list(scenarioId!),
    enabled: Boolean(scenarioId),
  })

export const useSimulation = (id: string | null | undefined) =>
  useQuery({
    queryKey: qk.simulations.one(id ?? ''),
    queryFn: () => simulationApi.get(id!),
    enabled: Boolean(id),
    refetchInterval: (query) => (isRunning(query.state.data?.status) ? POLL_MS : false),
  })

export const useTimeline = (id: string | null | undefined, ready: boolean) =>
  useQuery({
    queryKey: qk.simulations.timeline(id ?? ''),
    queryFn: () => simulationApi.timeline(id!),
    enabled: Boolean(id) && ready,
    staleTime: Infinity,
  })

export const useReplay = (id: string | null | undefined, ready: boolean) =>
  useQuery({
    queryKey: qk.simulations.replay(id ?? ''),
    queryFn: () => fetchFullReplay(id!),
    enabled: Boolean(id) && ready,
    staleTime: Infinity,
  })

export const useHeatmap = (id: string | null | undefined, ready: boolean) =>
  useQuery({
    queryKey: qk.simulations.heatmap(id ?? ''),
    queryFn: () => simulationApi.heatmap(id!),
    enabled: Boolean(id) && ready,
    staleTime: Infinity,
  })

export function useStartSimulation(scenarioId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: SimulationStart) => simulationApi.start(scenarioId, body),
    onSuccess: (run) => {
      queryClient.setQueryData(qk.simulations.one(run.id), run)
      return queryClient.invalidateQueries({ queryKey: qk.simulations.list(scenarioId) })
    },
  })
}

async function waitForJob(jobId: string): Promise<Job> {
  for (;;) {
    const job = await simulationApi.job(jobId)
    if (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled') return job
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}

export async function runSweep(scenarioId: string, body: FleetSweepRequest): Promise<FleetSweepResult> {
  const job = await simulationApi.sweep(scenarioId, body)
  const done = await waitForJob(job.id)
  if (done.status !== 'done') throw new Error('Перебор флота не завершился: попробуйте ещё раз')
  return simulationApi.sweepResult(scenarioId, job.id)
}

// A sweep writes the simulated N into one scenario. Variants with the same fleet (RaaS, leasing) get their own sweep —
// the same deterministic run — so the comparison table compares equal fleets, each marked as simulated.
export function useFleetSweep(projectId: string, scenarioId: string, variantIds: string[] = []) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent: true },
    mutationFn: async (body: FleetSweepRequest) => {
      const result = await runSweep(scenarioId, body)
      for (const id of variantIds) await runSweep(id, body).catch(() => undefined)
      return result
    },
    onSuccess: (result, body) => {
      queryClient.setQueryData(sweepKey(scenarioId, body.process_key), result)
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.scenarios.all }),
        queryClient.invalidateQueries({ queryKey: qk.projects.one(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.projects.scenarios(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.projects.comparison(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.simulations.list(scenarioId) }),
      ])
    },
  })
}

const sweepKey = (scenarioId: string, processKey: string) => ['scenarios', scenarioId, 'sweep', processKey] as const

// The backend keeps the sweep result only in its job; the last one is kept in the client cache for the screen.
export const useLastSweep = (scenarioId: string | undefined, processKey: string | undefined) =>
  useQuery<FleetSweepResult | null>({
    queryKey: sweepKey(scenarioId ?? '', processKey ?? ''),
    queryFn: () => null,
    enabled: false,
    staleTime: Infinity,
  })

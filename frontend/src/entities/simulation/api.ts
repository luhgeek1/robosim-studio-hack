import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { api } from '@/shared/api/client'
import { qk } from '@/shared/api/keys'
import type { Res } from '@/shared/api/types'
import type { components } from '@/shared/api/schema'

export type SimulationRun = Res<'/api/v1/simulations/{simulation_id}', 'get'>
export type SimulationSummary = NonNullable<SimulationRun['summary']>
export type SimulationRequest = components['schemas']['SimulationRequest']
export type SimulationTimeline = Res<'/api/v1/simulations/{simulation_id}/timeline', 'get'>
export type FleetSweepResult = Res<'/api/v1/scenarios/{scenario_id}/fleet-sweep/{job_id}', 'get'>
export type FleetSweepRequest = components['schemas']['FleetSweepRequest']

const FINAL = new Set(['done', 'failed', 'cancelled'])
export const isFinal = (status: string) => FINAL.has(status)

export const simulationApi = {
  list: (scenarioId: string) =>
    api
      .get<Res<'/api/v1/scenarios/{scenario_id}/simulations', 'get'>>(`/scenarios/${scenarioId}/simulations`)
      .then((r) => r.data.items),
  start: (scenarioId: string, body: SimulationRequest) =>
    api.post<SimulationRun>(`/scenarios/${scenarioId}/simulations`, body).then((r) => r.data),
  get: (id: string) => api.get<SimulationRun>(`/simulations/${id}`).then((r) => r.data),
  timeline: (id: string) => api.get<SimulationTimeline>(`/simulations/${id}/timeline`).then((r) => r.data),
  startSweep: (scenarioId: string, body: FleetSweepRequest) =>
    api
      .post<Res<'/api/v1/scenarios/{scenario_id}/fleet-sweep', 'post'>>(`/scenarios/${scenarioId}/fleet-sweep`, body)
      .then((r) => r.data),
  sweepResult: (scenarioId: string, jobId: string) =>
    api.get<FleetSweepResult>(`/scenarios/${scenarioId}/fleet-sweep/${jobId}`).then((r) => r.data),
}

const keys = {
  list: (scenarioId: string) => [...qk.scenarios.one(scenarioId), 'simulations'] as const,
  run: (id: string) => ['simulations', id] as const,
  timeline: (id: string) => ['simulations', id, 'timeline'] as const,
  sweep: (scenarioId: string, jobId: string) => [...qk.scenarios.one(scenarioId), 'fleet-sweep', jobId] as const,
}

export const useSimulations = (scenarioId: string | undefined) =>
  useQuery({
    queryKey: keys.list(scenarioId ?? ''),
    queryFn: () => simulationApi.list(scenarioId!),
    enabled: Boolean(scenarioId),
  })

// Опрос раз в секунду, пока прогон не завершился: SSE есть, но опрос проще и переживает обрыв соединения.
export const useSimulationRun = (id: string | null | undefined) =>
  useQuery({
    queryKey: keys.run(id ?? ''),
    queryFn: () => simulationApi.get(id!),
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data && isFinal(query.state.data.status) ? false : 1000),
  })

export const useSimulationTimeline = (id: string | null | undefined, enabled: boolean) =>
  useQuery({
    queryKey: keys.timeline(id ?? ''),
    queryFn: () => simulationApi.timeline(id!),
    enabled: Boolean(id) && enabled,
    staleTime: Infinity,
  })

export function useStartSimulation(scenarioId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: SimulationRequest) => simulationApi.start(scenarioId!, body),
    onSuccess: (run) => {
      queryClient.setQueryData(keys.run(run.id), run)
      void queryClient.invalidateQueries({ queryKey: keys.list(scenarioId ?? '') })
    },
    meta: { silent: true },
  })
}

export function useStartFleetSweep(scenarioId: string | undefined) {
  return useMutation({ mutationFn: (body: FleetSweepRequest) => simulationApi.startSweep(scenarioId!, body) })
}

// 409, пока перебор считается: держим опрос, пока не придёт результат.
export const useFleetSweepResult = (scenarioId: string | undefined, jobId: string | null) =>
  useQuery({
    queryKey: keys.sweep(scenarioId ?? '', jobId ?? ''),
    queryFn: () => simulationApi.sweepResult(scenarioId!, jobId!),
    enabled: Boolean(scenarioId && jobId),
    retry: (count, error) => isAxiosError(error) && error.response?.status === 409 && count < 120,
    retryDelay: 1500,
    staleTime: Infinity,
  })

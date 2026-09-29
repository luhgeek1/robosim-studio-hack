import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { api } from '@/shared/api/client'
import { qk } from '@/shared/api/keys'
import { parseApiProblem } from '@/shared/api/problem'
import type { CalculationRun, Res, SimEvent, SimulationReplay, SizingResult } from '@/shared/api/types'
import type { components } from '@/shared/api/schema'

export type SimulationRun = Res<'/api/v1/simulations/{simulation_id}', 'get'>
export type SimulationSummary = NonNullable<SimulationRun['summary']>
export type SimulationRequest = components['schemas']['SimulationRequest']
export type SimulationTimeline = Res<'/api/v1/simulations/{simulation_id}/timeline', 'get'>
export type FleetSweepResult = Res<'/api/v1/scenarios/{scenario_id}/fleet-sweep/{job_id}', 'get'>
export type FleetSweepRequest = components['schemas']['FleetSweepRequest']
export type FleetEconomics = components['schemas']['FleetEconomics']

// One seed for every check of the fleet: the sweep, the screen's runs and the report see the same peak days.
export const SWEEP_SEED = 1

const FINAL = new Set(['done', 'failed', 'cancelled'])
export const isFinal = (status: string) => FINAL.has(status)

const REPLAY_PAGE_S = 3600
const SWEEP_POLL_MS = 1500
// The sweep answers within the ТЗ 60 s limit (D-019); three minutes covers a busy worker without polling forever.
const SWEEP_POLL_LIMIT = 120

export const simulationApi = {
  list: (scenarioId: string) =>
    api
      .get<Res<'/api/v1/scenarios/{scenario_id}/simulations', 'get'>>(`/scenarios/${scenarioId}/simulations`)
      .then((r) => r.data.items),
  start: (scenarioId: string, body: SimulationRequest) =>
    api.post<SimulationRun>(`/scenarios/${scenarioId}/simulations`, body).then((r) => r.data),
  get: (id: string) => api.get<SimulationRun>(`/simulations/${id}`).then((r) => r.data),
  timeline: (id: string) => api.get<SimulationTimeline>(`/simulations/${id}/timeline`).then((r) => r.data),
  heatmap: (id: string) =>
    api
      .get<Res<'/api/v1/simulations/{simulation_id}/heatmap', 'get'>>(`/simulations/${id}/heatmap`)
      .then((r) => r.data),
  replayPage: (id: string, fromS: number) =>
    api
      .get<SimulationReplay>(`/simulations/${id}/replay`, { params: { from_s: fromS, to_s: fromS + REPLAY_PAGE_S } })
      .then((r) => r.data),
  startSweep: (scenarioId: string, body: FleetSweepRequest) =>
    api
      .post<Res<'/api/v1/scenarios/{scenario_id}/fleet-sweep', 'post'>>(`/scenarios/${scenarioId}/fleet-sweep`, body)
      .then((r) => r.data),
  sweepResult: (scenarioId: string, jobId: string) =>
    api.get<FleetSweepResult>(`/scenarios/${scenarioId}/fleet-sweep/${jobId}`).then((r) => r.data),
  // 404 — the scenario was never swept for this process.
  latestSweep: (scenarioId: string, processKey: string) =>
    api
      .get<FleetSweepResult>(`/scenarios/${scenarioId}/fleet-sweep`, { params: { process_key: processKey } })
      .then((r) => r.data)
      .catch((error: unknown) => {
        if (isAxiosError(error) && error.response?.status === 404) return null
        throw error
      }),
  calculate: (scenarioId: string) =>
    api.post<CalculationRun>(`/scenarios/${scenarioId}/calculate`, {}).then((r) => r.data),
}

const keys = {
  list: (scenarioId: string) => [...qk.scenarios.one(scenarioId), 'simulations'] as const,
  run: (id: string) => ['simulations', id] as const,
  timeline: (id: string) => ['simulations', id, 'timeline'] as const,
  replay: (id: string) => ['simulations', id, 'replay'] as const,
  heatmap: (id: string) => ['simulations', id, 'heatmap'] as const,
  lastSweep: (scenarioId: string, processKey: string) =>
    [...qk.scenarios.one(scenarioId), 'fleet-sweep', 'last', processKey] as const,
}

// The player scrubs the whole day, so the pages of the event log are joined here, not in the screen.
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

export const useSimulationReplay = (id: string | null | undefined, enabled: boolean) =>
  useQuery({
    queryKey: keys.replay(id ?? ''),
    queryFn: () => fetchFullReplay(id!),
    enabled: Boolean(id) && enabled,
    staleTime: Infinity,
    retry: false,
  })

export const useSimulationHeatmap = (id: string | null | undefined, enabled: boolean) =>
  useQuery({
    queryKey: keys.heatmap(id ?? ''),
    queryFn: () => simulationApi.heatmap(id!),
    enabled: Boolean(id) && enabled,
    staleTime: Infinity,
    retry: false,
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

// 409 means the sweep is still running; any other answer ends the wait.
async function waitForSweep(scenarioId: string, jobId: string): Promise<FleetSweepResult> {
  for (let attempt = 0; attempt < SWEEP_POLL_LIMIT; attempt++) {
    try {
      return await simulationApi.sweepResult(scenarioId, jobId)
    } catch (error) {
      if (!isAxiosError(error) || error.response?.status !== 409) throw error
    }
    await new Promise((resolve) => setTimeout(resolve, SWEEP_POLL_MS))
  }
  throw new Error('Перебор флота не закончился за 3 минуты — попробуйте ещё раз')
}

async function runSweep(scenarioId: string, body: FleetSweepRequest): Promise<FleetSweepResult> {
  const job = await simulationApi.startSweep(scenarioId, body)
  return waitForSweep(scenarioId, job.id)
}

/* Какие процессы имитация умеет проверить: модель цикла (паллеты, G2P, тягачи). Число, заданное вручную, остаётся
   за пользователем; уже проверенное — не перепроверяем без явной просьбы. */
export const checkable = (sizing: SizingResult, force = false) =>
  sizing.robot.cycle_time_s != null &&
  sizing.count.source !== 'manual' &&
  (force || sizing.count.source !== 'simulated')

export type FleetCheck = { calculation: CalculationRun; checked: FleetSweepResult[]; skipped: string[] }

/* Расчёт сценария вместе с проверкой числа роботов имитацией (D-029): формула даёт стартовое N, перебор флота на
   планировке находит минимальное N, которое держит SLA во всех прогонах пика, и записывает его в сценарий, затем
   экономика пересчитывается. Где имитации нет (нет планировки, аэропорт, больница), остаётся расчёт по формуле. */
export async function calculateWithFleetCheck(scenarioId: string, force = false): Promise<FleetCheck> {
  const first = await simulationApi.calculate(scenarioId)
  const checked: FleetSweepResult[] = []
  const skipped: string[] = []
  for (const sizing of first.sizing.filter((s) => checkable(s, force))) {
    try {
      checked.push(await runSweep(scenarioId, { process_key: sizing.process_key, mode: 'peak', seed: SWEEP_SEED }))
    } catch (error) {
      skipped.push(parseApiProblem(error).detail)
    }
  }
  const calculation = checked.some((r) => r.applied) ? await simulationApi.calculate(scenarioId) : first
  return { calculation, checked, skipped }
}

/* Явная перепроверка с экрана «Имитация». Варианты с тем же процессом (RaaS, лизинг) получают свой перебор — тот же
   детерминированный день, — чтобы сравнение сопоставляло одинаковые парки; затем сценарии пересчитываются. */
export function useFleetSweep(projectId: string, scenarioId: string, variantIds: string[] = []) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: FleetSweepRequest) => {
      const result = await runSweep(scenarioId, body)
      const recalculate = result.applied ? [scenarioId] : []
      for (const id of variantIds) {
        const variant = await runSweep(id, body).catch(() => null)
        if (variant?.applied) recalculate.push(id)
      }
      await Promise.all(recalculate.map((id) => simulationApi.calculate(id).catch(() => undefined)))
      return result
    },
    onSuccess: (result, body) => {
      queryClient.setQueryData(keys.lastSweep(scenarioId, body.process_key), result)
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.scenarios.all }),
        queryClient.invalidateQueries({ queryKey: qk.projects.one(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.projects.list }),
      ])
    },
    meta: { silent: true },
  })
}

// Последний перебор хранится на сервере: таблица и «было → стало» остаются после перезагрузки.
export const useLastSweep = (scenarioId: string | undefined, processKey: string | undefined) =>
  useQuery<FleetSweepResult | null>({
    queryKey: keys.lastSweep(scenarioId ?? '', processKey ?? ''),
    queryFn: () => simulationApi.latestSweep(scenarioId!, processKey!),
    enabled: Boolean(scenarioId && processKey),
    retry: false,
  })

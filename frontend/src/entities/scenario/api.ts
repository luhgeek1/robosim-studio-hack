import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { calculateWithFleetCheck } from '@/entities/simulation'
import { api } from '@/shared/api/client'
import { qk } from '@/shared/api/keys'
import type {
  MonteCarloRequest,
  Res,
  Scenario,
  ScenarioCreate,
  ScenarioKind,
  ScenarioUpdate,
  SensitivityRequest,
} from '@/shared/api/types'

export const scenarioApi = {
  list: (projectId: string) =>
    api
      .get<Res<'/api/v1/projects/{project_id}/scenarios', 'get'>>(`/projects/${projectId}/scenarios`)
      .then((r) => r.data.items),
  get: (id: string) => api.get<Res<'/api/v1/scenarios/{scenario_id}', 'get'>>(`/scenarios/${id}`).then((r) => r.data),
  create: (projectId: string, body: ScenarioCreate) =>
    api
      .post<Res<'/api/v1/projects/{project_id}/scenarios', 'post'>>(`/projects/${projectId}/scenarios`, body)
      .then((r) => r.data),
  update: (id: string, body: ScenarioUpdate) =>
    api.patch<Res<'/api/v1/scenarios/{scenario_id}', 'patch'>>(`/scenarios/${id}`, body).then((r) => r.data),
  remove: (id: string) => api.delete(`/scenarios/${id}`).then(() => undefined),
  copy: (id: string, body: { name?: string; kind?: ScenarioKind }) =>
    api.post<Res<'/api/v1/scenarios/{scenario_id}/copy', 'post'>>(`/scenarios/${id}/copy`, body).then((r) => r.data),
  calculate: (id: string) =>
    api
      .post<Res<'/api/v1/scenarios/{scenario_id}/calculate', 'post'>>(`/scenarios/${id}/calculate`, {})
      .then((r) => r.data),
  calculation: (id: string) =>
    api.get<Res<'/api/v1/calculations/{calculation_id}', 'get'>>(`/calculations/${id}`).then((r) => r.data),
  trace: (id: string) =>
    api.get<Res<'/api/v1/calculations/{calculation_id}/trace', 'get'>>(`/calculations/${id}/trace`).then((r) => r.data),
  narrative: (id: string) =>
    api
      .get<Res<'/api/v1/calculations/{calculation_id}/narrative', 'get'>>(`/calculations/${id}/narrative`)
      .then((r) => r.data),
  comparison: (projectId: string) =>
    api
      .get<Res<'/api/v1/projects/{project_id}/comparison', 'get'>>(`/projects/${projectId}/comparison`)
      .then((r) => r.data),
  sensitivity: (id: string, body: SensitivityRequest) =>
    api
      .post<Res<'/api/v1/scenarios/{scenario_id}/sensitivity', 'post'>>(`/scenarios/${id}/sensitivity`, body)
      .then((r) => r.data),
  monteCarlo: (id: string, body: MonteCarloRequest) =>
    api
      .post<Res<'/api/v1/scenarios/{scenario_id}/monte-carlo', 'post'>>(`/scenarios/${id}/monte-carlo`, body)
      .then((r) => r.data),
  survey: (id: string) =>
    api
      .get<Res<'/api/v1/scenarios/{scenario_id}/survey-priorities', 'get'>>(`/scenarios/${id}/survey-priorities`)
      .then((r) => r.data),
}

export const useScenarios = (projectId: string) =>
  useQuery({ queryKey: qk.projects.scenarios(projectId), queryFn: () => scenarioApi.list(projectId) })

export const useScenario = (id: string) =>
  useQuery({ queryKey: qk.scenarios.one(id), queryFn: () => scenarioApi.get(id) })

export const useCalculation = (id: string | null | undefined) =>
  useQuery({
    queryKey: qk.calculations.one(id ?? ''),
    queryFn: () => scenarioApi.calculation(id!),
    enabled: Boolean(id),
    staleTime: Infinity,
  })

export const useTrace = (id: string | null | undefined, enabled = true) =>
  useQuery({
    queryKey: qk.calculations.trace(id ?? ''),
    queryFn: () => scenarioApi.trace(id!),
    enabled: Boolean(id) && enabled,
    staleTime: Infinity,
  })

export const useNarrative = (id: string | null | undefined) =>
  useQuery({
    queryKey: qk.calculations.narrative(id ?? ''),
    queryFn: () => scenarioApi.narrative(id!),
    enabled: Boolean(id),
    staleTime: Infinity,
  })

// The comparison recalculates stale scenarios on the server: the list and the project headline follow it. The project
// key is invalidated exactly — a prefix would include this very query and loop.
export function useComparison(projectId: string) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: qk.projects.comparison(projectId),
    queryFn: async () => {
      const data = await scenarioApi.comparison(projectId)
      void queryClient.invalidateQueries({ queryKey: qk.projects.scenarios(projectId) })
      void queryClient.invalidateQueries({ queryKey: qk.projects.one(projectId), exact: true })
      void queryClient.invalidateQueries({ queryKey: qk.projects.list })
      return data
    },
    retry: false,
  })
}

// Sensitivity and Monte Carlo are pure functions of the scenario and the request, so they are cached like reads.
export const useSensitivity = (id: string | undefined, body: SensitivityRequest) =>
  useQuery({
    queryKey: [...qk.scenarios.one(id ?? ''), 'sensitivity', body],
    queryFn: () => scenarioApi.sensitivity(id!, body),
    enabled: Boolean(id),
    retry: false,
  })

export const useMonteCarlo = (id: string | undefined, body: MonteCarloRequest) =>
  useQuery({
    queryKey: [...qk.scenarios.one(id ?? ''), 'monte-carlo', body],
    queryFn: () => scenarioApi.monteCarlo(id!, body),
    enabled: Boolean(id),
    retry: false,
  })

export const useSurvey = (id: string | undefined) =>
  useQuery({
    queryKey: qk.scenarios.survey(id ?? ''),
    queryFn: () => scenarioApi.survey(id!),
    enabled: Boolean(id),
    retry: false,
  })

function useRefreshScenarios(projectId: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.projects.scenarios(projectId) }),
      queryClient.invalidateQueries({ queryKey: qk.projects.comparison(projectId) }),
      queryClient.invalidateQueries({ queryKey: qk.projects.one(projectId) }),
      queryClient.invalidateQueries({ queryKey: qk.projects.list }),
    ])
}

export function useCreateScenario(projectId: string) {
  const refresh = useRefreshScenarios(projectId)
  return useMutation({ mutationFn: (body: ScenarioCreate) => scenarioApi.create(projectId, body), onSuccess: refresh })
}

export function useCopyScenario(projectId: string) {
  const refresh = useRefreshScenarios(projectId)
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; kind?: ScenarioKind }) => scenarioApi.copy(id, body),
    onSuccess: refresh,
  })
}

export function useDeleteScenario(projectId: string) {
  const refresh = useRefreshScenarios(projectId)
  return useMutation({ mutationFn: scenarioApi.remove, onSuccess: refresh })
}

export function useUpdateScenario(projectId: string, id: string) {
  const queryClient = useQueryClient()
  const refresh = useRefreshScenarios(projectId)
  return useMutation({
    mutationFn: (body: ScenarioUpdate) => scenarioApi.update(id, body),
    onSuccess: (scenario) => {
      queryClient.setQueryData(qk.scenarios.one(id), scenario)
      // Sensitivity, Monte Carlo, survey and the fleet sweep live under the scenario key: they follow the edit.
      return Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: qk.scenarios.one(id) })])
    },
  })
}

/* «Рассчитать» = формула + проверка числа роботов имитацией там, где она есть (D-029): пользователь сразу видит N,
   которое держит SLA, а не число по формуле, которое на шаге «Имитация» вдруг меняется. */
export function useCalculate(projectId: string, id: string) {
  const queryClient = useQueryClient()
  const refresh = useRefreshScenarios(projectId)
  return useMutation({
    // force — перепроверить и уже проверенное N (кнопка «Перепроверить»).
    mutationFn: (force?: boolean) => calculateWithFleetCheck(id, force ?? false),
    onSuccess: ({ calculation }) => {
      queryClient.setQueryData(qk.calculations.one(calculation.id), calculation)
      return Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: qk.scenarios.one(id) })])
    },
  })
}

/* Откуда сценарий берёт число роботов процесса: «по имитации» (auto — перебор флота) или «по формуле» (ручное число =
   формула + резерв). Выбор применяется и к вариантам с тем же процессом и продуктом (RaaS, лизинг): сравнение
   сопоставляет одинаковые парки. */
export function useCountSource(projectId: string, scenarioId: string) {
  const queryClient = useQueryClient()
  const refresh = useRefreshScenarios(projectId)
  return useMutation({
    mutationFn: async ({ processKey, manual }: { processKey: string; manual: number | null }) => {
      const current = await scenarioApi.get(scenarioId)
      const product = current.items.find((i) => i.process_key === processKey)?.product_id
      const siblings = (await scenarioApi.list(projectId)).filter(
        (s) =>
          s.id !== scenarioId &&
          !s.is_baseline &&
          s.items.some((i) => i.process_key === processKey && i.product_id === product),
      )
      for (const scenario of [current, ...siblings]) {
        await scenarioApi.update(scenario.id, { items: withCount(scenario, processKey, manual) })
      }
      const run = await scenarioApi.calculate(current.id)
      for (const scenario of siblings) await scenarioApi.calculate(scenario.id)
      return run
    },
    onSuccess: (run) => {
      queryClient.setQueryData(qk.calculations.one(run.id), run)
      return Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: qk.scenarios.all })])
    },
  })
}

function withCount(scenario: Scenario, processKey: string, manual: number | null): ScenarioUpdate['items'] {
  return scenario.items.map((item) => ({
    process_key: item.process_key,
    product_id: item.product_id,
    offer_id: item.offer_id,
    count_mode: item.process_key === processKey ? (manual ? 'manual' : 'auto') : item.count_mode,
    count_manual: item.process_key === processKey ? manual : (item.count_manual ?? null),
    stations: item.stations,
    notes: item.notes ?? null,
    price_override_rub: item.price_override_rub ?? null,
    throughput_override_per_hour: item.throughput_override_per_hour ?? null,
    override_reason: item.override_reason ?? null,
  }))
}

// The comparison follows one purchase scenario; RaaS and leasing are copies of it with the same fleet.
export function pickMainScenario(scenarios: Scenario[] | undefined): Scenario | undefined {
  const robotized = (scenarios ?? []).filter((s) => !s.is_baseline && s.items.length > 0)
  return (
    robotized.find((s) => s.is_recommended && s.kind === 'purchase') ??
    robotized.find((s) => s.kind === 'purchase') ??
    robotized[0]
  )
}

const VARIANT_NAME: Record<'raas' | 'lease', string> = { raas: 'Роботы как услуга (RaaS)', lease: 'Лизинг' }

/* ТЗ 3.5.5: «как сейчас» и не меньше двух вариантов роботизации в одной таблице. Одна кнопка собирает набор:
   покупку из рекомендации подбора (если её нет), её копии как RaaS и лизинг, и считает всё, что не посчитано. */
export function useBuildComparisonSet(projectId: string) {
  const refresh = useRefreshScenarios(projectId)
  return useMutation({
    mutationFn: async () => {
      const existing = await scenarioApi.list(projectId)
      let main = pickMainScenario(existing)
      if (!main) {
        main = await scenarioApi.create(projectId, {
          name: 'Покупка по рекомендации подбора',
          kind: 'purchase',
          from_recommendation: true,
        })
      }
      // Число роботов проверяется имитацией до копий: RaaS и лизинг наследуют тот же парк.
      await calculateWithFleetCheck(main.id)
      for (const kind of ['raas', 'lease'] as const) {
        if (existing.some((s) => s.kind === kind && s.items.length > 0)) continue
        await scenarioApi.copy(main.id, { kind, name: VARIANT_NAME[kind] })
      }
      const all = await scenarioApi.list(projectId)
      // One after another: each calculation re-picks the recommended scenario from the others' results.
      for (const s of all.filter((s) => !s.last_calculation || s.last_calculation.status === 'stale')) {
        await scenarioApi.calculate(s.id)
      }
      return main
    },
    onSuccess: refresh,
  })
}

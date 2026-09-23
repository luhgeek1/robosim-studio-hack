import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { qk } from '@/api/keys'
import type {
  MonteCarloRequest,
  Res,
  ScenarioCreate,
  ScenarioKind,
  ScenarioUpdate,
  SensitivityRequest,
} from '@/api/types'

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
  useQuery({
    queryKey: qk.projects.scenarios(projectId),
    queryFn: () => scenarioApi.list(projectId),
    enabled: Boolean(projectId),
  })

export const useScenario = (id: string) =>
  useQuery({ queryKey: qk.scenarios.one(id), queryFn: () => scenarioApi.get(id), enabled: Boolean(id) })

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

export const useComparison = (projectId: string) =>
  useQuery({
    queryKey: qk.projects.comparison(projectId),
    queryFn: () => scenarioApi.comparison(projectId),
    enabled: Boolean(projectId),
    retry: false,
  })

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
      return refresh()
    },
  })
}

export function useCalculate(projectId: string, id: string) {
  const queryClient = useQueryClient()
  const refresh = useRefreshScenarios(projectId)
  return useMutation({
    mutationFn: () => scenarioApi.calculate(id),
    onSuccess: (run) => {
      queryClient.setQueryData(qk.calculations.one(run.id), run)
      return Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: qk.scenarios.one(id) })])
    },
  })
}

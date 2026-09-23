import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { qk } from '@/api/keys'
import { scenarioApi } from '@/api/scenarios'
import type { components } from '@/api/schema'
import { pickMain } from '@/api/story'
import type {
  CandidateStatus,
  MatchingRunRequest,
  Res,
  Scenario,
  ScenarioItem,
  ScenarioItemWrite,
  ScenarioKind,
} from '@/api/types'

type ManualAddRequest = components['schemas']['ManualAddRequest']

export const matchingApi = {
  get: (projectId: string) =>
    api
      .get<Res<'/api/v1/projects/{project_id}/matching', 'get'>>(`/projects/${projectId}/matching`)
      .then((r) => r.data),
  run: (projectId: string, body: MatchingRunRequest) =>
    api
      .post<Res<'/api/v1/projects/{project_id}/matching', 'post'>>(`/projects/${projectId}/matching`, body)
      .then((r) => r.data),
  addManual: (projectId: string, body: ManualAddRequest) =>
    api
      .post<Res<'/api/v1/projects/{project_id}/matching/manual', 'post'>>(
        `/projects/${projectId}/matching/manual`,
        body,
      )
      .then((r) => r.data),
}

export const useMatching = (projectId: string) =>
  useQuery({
    queryKey: qk.projects.matching(projectId),
    queryFn: () => matchingApi.get(projectId),
    enabled: Boolean(projectId),
    retry: false,
  })

export function useRunMatching(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: MatchingRunRequest) => matchingApi.run(projectId, body),
    onSuccess: (data) => queryClient.setQueryData(qk.projects.matching(projectId), data),
  })
}

// ТЗ 3.4.4: an excluded product can still be compared, but only after the user has seen why it was excluded.
export function useAddManualCandidate(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Omit<ManualAddRequest, 'acknowledge_warning'>) =>
      matchingApi.addManual(projectId, { ...body, acknowledge_warning: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.projects.matching(projectId) }),
  })
}

export type ProductChoice = {
  processKey: string
  productId: string
  offerId: string | null
  // Solution types without a sizing model (pick-by-voice, arms) need the count from the user.
  count?: number | null
}

const toWrite = (item: ScenarioItem): ScenarioItemWrite => ({
  process_key: item.process_key,
  product_id: item.product_id,
  offer_id: item.offer_id,
  count_mode: item.count_mode,
  count_manual: item.count_manual,
  stations: item.stations,
  notes: item.notes,
  price_override_rub: item.price_override_rub,
  throughput_override_per_hour: item.throughput_override_per_hour,
  override_reason: item.override_reason,
})

// Other processes are written back unchanged, so the backend keeps their fleet-sweep results.
function withChoice(items: ScenarioItem[], choice: ProductChoice): ScenarioItemWrite[] {
  const next: ScenarioItemWrite = {
    process_key: choice.processKey,
    product_id: choice.productId,
    offer_id: choice.offerId,
    count_mode: choice.count ? 'manual' : 'auto',
    count_manual: choice.count ?? null,
  }
  const kept = items.map(toWrite)
  const index = kept.findIndex((item) => item.process_key === choice.processKey)
  if (index >= 0) kept[index] = next
  else kept.push(next)
  return kept
}

const productFor = (scenario: Scenario, processKey: string) =>
  scenario.items.find((item) => item.process_key === processKey)?.product_id ?? null

const STORY_VARIANTS: ScenarioKind[] = ['raas', 'lease']

// Puts the product into the main scenario. The RaaS and leasing variants are copies of it with the same fleet:
// while they still hold the same product for this process they follow the choice, so the comparison stays like for like.
export function useChooseProduct(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (choice: ProductChoice) => {
      const scenarios = await scenarioApi.list(projectId)
      const main = pickMain(scenarios)
      if (!main) throw new Error('Сценарий роботизации ещё не создан')
      const before = productFor(main, choice.processKey)
      const variants = STORY_VARIANTS.map((kind) =>
        scenarios.find((s) => !s.is_baseline && s.kind === kind && s.items.length > 0),
      ).filter((s): s is Scenario => Boolean(s) && s!.id !== main.id && productFor(s!, choice.processKey) === before)
      const updated = await scenarioApi.update(main.id, { items: withChoice(main.items, choice) })
      await Promise.all(variants.map((s) => scenarioApi.update(s.id, { items: withChoice(s.items, choice) })))
      return updated
    },
    onSuccess: (scenario) => {
      queryClient.setQueryData(qk.scenarios.one(scenario.id), scenario)
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.projects.scenarios(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.projects.comparison(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.projects.one(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.projects.list }),
        queryClient.invalidateQueries({ queryKey: qk.scenarios.all }),
      ])
    },
  })
}

export const CANDIDATE_STATUS_LABEL: Record<CandidateStatus, string> = {
  fit: 'Подходит',
  check: 'Требует проверки',
  excluded: 'Не подходит',
  manual: 'Добавлен вручную',
}

export const CRITERION_LABEL: Record<string, string> = {
  performance: 'Производительность',
  cost_efficiency: 'Стоимость',
  infrastructure_fit: 'Инфраструктура',
  maturity: 'Зрелость',
  data_quality: 'Полнота данных',
  references: 'Внедрения',
}

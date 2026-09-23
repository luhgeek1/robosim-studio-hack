import { useMutation, useQueryClient } from '@tanstack/react-query'
import { qk } from '@/api/keys'
import { scenarioApi, useScenarios } from '@/api/scenarios'
import type { Scenario, ScenarioKind } from '@/api/types'

// The story follows one "main" robotization scenario; variants (RaaS, leasing) are copies of it with the same fleet.
export function pickMain(scenarios: Scenario[] | undefined): Scenario | undefined {
  const robotized = (scenarios ?? []).filter((s) => !s.is_baseline && s.items.length > 0)
  return (
    robotized.find((s) => s.is_recommended && s.kind === 'purchase') ??
    robotized.find((s) => s.kind === 'purchase') ??
    robotized[0]
  )
}

export function useStory(projectId: string) {
  const scenarios = useScenarios(projectId)
  const list = scenarios.data
  const main = pickMain(list)
  return {
    ...scenarios,
    scenarios: list ?? [],
    baseline: list?.find((s) => s.is_baseline),
    main,
    variant: (kind: ScenarioKind) => list?.find((s) => !s.is_baseline && s.kind === kind && s.items.length > 0),
  }
}

const VARIANT_NAME: Record<Exclude<ScenarioKind, 'baseline'>, string> = {
  purchase: 'Покупка',
  raas: 'Роботы как услуга (RaaS)',
  lease: 'Лизинг',
}

// One click builds the whole comparison: main scenario from the recommendation, its RaaS and leasing copies,
// all calculated. Calculation takes tens of milliseconds, so the user sees a filled table right away.
export function useBuildStory(projectId: string, { silent = false }: { silent?: boolean } = {}) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent },
    mutationFn: async ({ variants = ['raas', 'lease'] }: { variants?: ('raas' | 'lease')[] } = {}) => {
      const existing = await scenarioApi.list(projectId)
      let main = pickMain(existing)
      if (!main) {
        main = await scenarioApi.create(projectId, {
          name: 'Покупка по рекомендации подбора',
          kind: 'purchase',
          from_recommendation: true,
        })
      }
      const created: Scenario[] = []
      for (const kind of variants) {
        if (existing.some((s) => s.kind === kind && s.items.length > 0)) continue
        created.push(await scenarioApi.copy(main.id, { kind, name: VARIANT_NAME[kind] }))
      }
      const all = await scenarioApi.list(projectId)
      await Promise.all(
        all
          .filter((s) => !s.last_calculation || s.last_calculation.status === 'stale')
          .map((s) => scenarioApi.calculate(s.id)),
      )
      return main
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.projects.one(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.projects.scenarios(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.projects.comparison(projectId) }),
        queryClient.invalidateQueries({ queryKey: qk.scenarios.all }),
      ]),
  })
}

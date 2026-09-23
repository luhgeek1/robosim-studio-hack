import { SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { parseApiProblem } from '@/api/problem'
import { useCalculations, useComparison } from '@/api/scenarios'
import { useBuildStory, useStory } from '@/api/story'
import type { CalculationRun } from '@/api/types'
import { ComparisonTable } from '@/components/economics/ComparisonTable'
import { CostBreakdown } from '@/components/economics/CostBreakdown'
import { economicsHeadline, economicsLead, isRobotized, sortByKind } from '@/components/economics/model'
import { PaybackChart } from '@/components/economics/PaybackChart'
import { Robustness } from '@/components/economics/Robustness'
import { ScenarioDrawer } from '@/components/economics/ScenarioDrawer'
import { Screen } from '@/components/Screen'
import { Empty, ErrorState, Loading } from '@/components/States'
import { Button, Disclosure } from '@/components/ui'
import { SCENARIO_KIND_LABEL } from '@/lib/labels'
import { stepPath, useProjectId } from '@/lib/story'
import { useStore } from '@/store'

// The comparison needs "as is" plus at least two robotization variants (ТЗ 3.5.5).
const MIN_ROBOTIZED = 2

export function EconomicsScreen() {
  const projectId = useProjectId()
  const navigate = useNavigate()
  const openTrace = useStore((s) => s.openTrace)
  const story = useStory(projectId)
  const build = useBuildStory(projectId, { silent: true })
  const calculatedRobotized = story.scenarios.filter(
    (s) => !s.is_baseline && s.items.length > 0 && s.last_calculation,
  ).length
  const needsBuild = story.isSuccess && calculatedRobotized < MIN_ROBOTIZED
  const building = build.isPending || (needsBuild && build.isIdle)
  const comparison = useComparison(projectId, story.isSuccess && !building)

  // Build the purchase / RaaS / leasing set once per visit; a failure is shown with a retry, never looped.
  const { mutate: runBuild } = build
  const started = useRef(false)
  useEffect(() => {
    if (!needsBuild || started.current) return
    started.current = true
    runBuild({})
  }, [needsBuild, runBuild])

  const table = comparison.data
  const scenarios = useMemo(() => (table ? sortByKind(table.scenarios) : []), [table])
  const calcQueries = useCalculations(scenarios.map((s) => s.calculation_id))
  const calcs: Record<string, CalculationRun | undefined> = {}
  scenarios.forEach((s, i) => (calcs[s.calculation_id] = calcQueries[i]?.data))

  const robotized = scenarios.filter(isRobotized)
  const recommendedId = table?.recommendation?.scenario_id ?? null
  const main =
    robotized.find((s) => s.scenario_id === story.main?.id) ??
    robotized.find((s) => s.scenario_id === recommendedId) ??
    robotized[0]
  const recommended = robotized.find((s) => s.scenario_id === recommendedId) ?? main

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = scenarios.find((s) => s.scenario_id === selectedId) ?? recommended ?? scenarios[0]
  const selectedCalc = selected ? calcs[selected.calculation_id] : undefined

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const openDrawer = () => {
    setDrawerId(selected && isRobotized(selected) ? selected.scenario_id : (recommended?.scenario_id ?? null))
    setDrawerOpen(true)
  }

  const stuck = build.isError && (!table || comparison.isError)
  if (building) {
    return (
      <Screen wide title="Считаем экономику" nextLabel="Перейти к решению">
        <Loading label="Считаем покупку, аренду и лизинг…" />
      </Screen>
    )
  }
  if (stuck || comparison.isError) {
    const noScenarios = !stuck && parseApiProblem(comparison.error).status === 409
    return (
      <Screen wide title="Экономика сценариев" nextLabel="Перейти к решению">
        {noScenarios ? (
          <Empty
            title="Нет рассчитанных сценариев роботизации"
            action={<Button onClick={() => navigate(stepPath(projectId, 'robots'))}>Выбрать роботов</Button>}
          >
            Для сравнения нужен хотя бы один подходящий робот. Выберите решения на шаге «Роботы» — покупку, аренду и
            лизинг мы посчитаем сами.
          </Empty>
        ) : stuck ? (
          <ErrorState title="Не удалось собрать сценарии" error={build.error} onRetry={() => build.mutate({})} />
        ) : (
          <ErrorState error={comparison.error} onRetry={() => comparison.refetch()} />
        )}
      </Screen>
    )
  }
  if (!table) {
    return (
      <Screen wide title="Экономика сценариев" nextLabel="Перейти к решению">
        <Loading label="Собираем сравнение сценариев…" />
      </Screen>
    )
  }

  const mainCalc = main ? calcs[main.calculation_id] : undefined
  return (
    <Screen
      wide
      title={economicsHeadline(table)}
      lead={economicsLead(table, main, mainCalc?.sizing) ?? undefined}
      nextLabel="Перейти к решению"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="meta">Нажмите на столбец — ниже откроются его статьи затрат</span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="text-[13px] font-medium text-accent hover:underline"
            onClick={() => navigate(stepPath(projectId, 'simulation'))}
          >
            Проверить в симуляции
          </button>
          <Button size="sm" icon={<SlidersHorizontal size={14} />} onClick={openDrawer} disabled={!robotized.length}>
            Настроить сценарий
          </Button>
        </div>
      </div>

      <ComparisonTable
        scenarios={scenarios}
        calcs={calcs}
        recommendedId={recommendedId}
        selectedId={selected?.scenario_id ?? null}
        onSelect={setSelectedId}
      />

      <section className="mt-10">
        <div className="mb-3 flex items-baseline justify-between">
          <div className="h3">Когда инвестиция выходит в плюс</div>
          <span className="meta">линия нуля — если ничего не менять</span>
        </div>
        <div className="card p-5">
          <PaybackChart scenarios={scenarios} calcs={calcs} marked={recommended} />
        </div>
      </section>

      {selected && (
        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <div className="h3">Статьи затрат: {SCENARIO_KIND_LABEL[selected.kind].toLowerCase()}</div>
              <span className="meta">строка раскрывается в формулу с источниками</span>
            </div>
            {selectedCalc && (
              <button
                type="button"
                className="text-[13px] font-medium text-accent hover:underline"
                onClick={() => openTrace(selectedCalc.id)}
              >
                Вся трасса расчёта
              </button>
            )}
          </div>
          <CostBreakdown calc={selectedCalc} isBaseline={!isRobotized(selected)} />
        </section>
      )}

      {robotized.length > 0 && (
        <section className="mt-8">
          <Disclosure label="Насколько устойчив результат">
            <Robustness scenarios={robotized} defaultId={recommended?.scenario_id ?? null} />
          </Disclosure>
        </section>
      )}

      <ScenarioDrawer
        open={drawerOpen}
        scenarioId={drawerId}
        options={robotized}
        onSwitch={setDrawerId}
        onClose={() => setDrawerOpen(false)}
      />
    </Screen>
  )
}

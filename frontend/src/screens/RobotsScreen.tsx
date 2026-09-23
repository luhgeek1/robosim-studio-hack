import { useState } from 'react'
import { ChevronDown, GitCompareArrows } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useSpecKeys } from '@/api/catalog'
import { useAddManualCandidate, useChooseProduct, useMatching } from '@/api/matching'
import { parseApiProblem } from '@/api/problem'
import { useProcesses } from '@/api/projects'
import { useBuildStory, useStory } from '@/api/story'
import type { Candidate, MatchingResult, ProcessMatching, Scenario } from '@/api/types'
import { compareUrl } from '@/components/catalog/compareSelection'
import { CandidateList, type ChooseState } from '@/components/robots/CandidateList'
import { CountModal } from '@/components/robots/CountModal'
import { CriteriaMatrix } from '@/components/robots/CriteriaMatrix'
import { ExcludedList, ManualAddModal } from '@/components/robots/ExcludedList'
import {
  checkedConstraints,
  countBy,
  headline,
  processShort,
  rankCandidates,
  scenarioItem,
  shortName,
} from '@/components/robots/model'
import { ProcessSwitcher } from '@/components/robots/ProcessSwitcher'
import { Screen } from '@/components/Screen'
import { Empty, ErrorState, Loading } from '@/components/States'
import { Button, Disclosure } from '@/components/ui'
import { pluralRu } from '@/lib/format'
import { stepPath, useProjectId } from '@/lib/story'
import { useStore } from '@/store'

const TOP = 4

type Then = 'stay' | 'simulate'

// Follow the money: the robotizable process with the largest labour cost that has solutions passing every check.
function defaultProcess(data: MatchingResult, costs: Map<string, number>, robotizable: Set<string> | null) {
  const byCost = [...data.processes].sort((a, b) => (costs.get(b.process_key) ?? 0) - (costs.get(a.process_key) ?? 0))
  const eligible = byCost.filter((p) => !robotizable || robotizable.has(p.process_key))
  return (
    eligible.find((p) => countBy(p.candidates, 'fit') > 0) ??
    eligible.find((p) => rankCandidates(p.candidates).length > 0) ??
    byCost[0]
  )
}

export function RobotsScreen() {
  const projectId = useProjectId()
  const matching = useMatching(projectId)
  const processes = useProcesses(projectId)
  const story = useStory(projectId)
  const [params, setParams] = useSearchParams()

  const ready = matching.data && !processes.isPending
  const data = matching.data
  const costs = new Map((processes.data?.processes ?? []).map((p) => [p.process_key, p.current?.cost_rub_year ?? 0]))
  const robotizable = processes.data
    ? new Set(processes.data.processes.filter((p) => p.robotizable).map((p) => p.process_key))
    : null
  const process = data
    ? (data.processes.find((p) => p.process_key === params.get('process')) ?? defaultProcess(data, costs, robotizable))
    : undefined

  if (!ready || !data || !process)
    return (
      <Screen title="Какие роботы подходят">
        {matching.isPending || processes.isPending ? (
          <Loading label="Подбираем решения из каталога…" />
        ) : matching.isError ? (
          <MatchingError projectId={projectId} error={matching.error} onRetry={() => matching.refetch()} />
        ) : (
          <Empty title="Нет процессов для подбора">
            У этого типа объекта нет процессов, которые можно роботизировать. Проверьте тип объекта в проекте.
          </Empty>
        )}
      </Screen>
    )

  return (
    <ProcessView
      key={process.process_key}
      projectId={projectId}
      data={data}
      process={process}
      costs={costs}
      main={story.main}
      storyPending={story.isPending}
      onProcess={(key) => setParams({ process: key }, { replace: true })}
    />
  )
}

function MatchingError({ projectId, error, onRetry }: { projectId: string; error: unknown; onRetry: () => void }) {
  const problem = parseApiProblem(error)
  if (problem.status !== 409) return <ErrorState error={error} onRetry={onRetry} />
  return (
    <Empty
      title="Подбор пока невозможен"
      action={
        <Link to={stepPath(projectId, 'object')}>
          <Button variant="primary">Заполнить параметры объекта</Button>
        </Link>
      }
    >
      {problem.detail}
    </Empty>
  )
}

function ProcessView({
  projectId,
  data,
  process,
  costs,
  main,
  storyPending,
  onProcess,
}: {
  projectId: string
  data: MatchingResult
  process: ProcessMatching
  costs: Map<string, number>
  main: Scenario | undefined
  storyPending: boolean
  onProcess: (key: string) => void
}) {
  const navigate = useNavigate()
  const toast = useStore((s) => s.toast)
  const specKeys = useSpecKeys()
  const choose = useChooseProduct(projectId)
  const build = useBuildStory(projectId)
  const addManual = useAddManualCandidate(projectId)

  const ranked = rankCandidates(process.candidates)
  const excluded = process.candidates.filter((c) => c.status === 'excluded')
  const item = scenarioItem(main, process.process_key)
  const inScenarioId = item?.product_id
  const [picked, setPicked] = useState<string | undefined>()
  const [showAll, setShowAll] = useState(false)
  const [askCount, setAskCount] = useState<{ candidate: Candidate; then: Then } | null>(null)
  const [askManual, setAskManual] = useState<Candidate | null>(null)

  const openId = [picked, inScenarioId, ranked[0]?.product.id].find(
    (id) => id && ranked.some((c) => c.product.id === id),
  )
  const open = ranked.find((c) => c.product.id === openId)
  const visible = ranked.filter(
    (c, i) => showAll || i < TOP || c.product.id === openId || c.product.id === inScenarioId,
  )
  const hidden = ranked.length - visible.length
  const matrix = ranked.slice(0, 3)
  if (open && !matrix.includes(open)) matrix.splice(2, 1, open)

  const busy = choose.isPending || build.isPending
  const chooseState: ChooseState = { enabled: Boolean(main), replaces: Boolean(item), busy }

  const apply = async (candidate: Candidate, count: number | null, then: Then) => {
    const choice = {
      processKey: process.process_key,
      productId: candidate.product.id,
      offerId: candidate.offer_id,
      count,
    }
    try {
      if (main) {
        await choose.mutateAsync(choice)
      } else {
        // Build the story from the recommendation first, then put the chosen product in and recalculate.
        const created = await build.mutateAsync({})
        if (scenarioItem(created, choice.processKey)?.product_id !== choice.productId) {
          await choose.mutateAsync(choice)
          await build.mutateAsync({})
        }
      }
    } catch {
      return
    }
    setAskCount(null)
    toast(`«${shortName(candidate.product.name)}» в сценарии: ${processShort(process).toLowerCase()}`)
    if (then === 'simulate') navigate(stepPath(projectId, 'simulation'))
  }

  const request = (candidate: Candidate, then: Then) => {
    if (candidate.estimate?.robots_count == null) setAskCount({ candidate, then })
    else void apply(candidate, null, then)
  }

  const confirmManual = async () => {
    if (!askManual) return
    const candidate = askManual
    try {
      await addManual.mutateAsync({
        process_key: process.process_key,
        product_id: candidate.product.id,
        offer_id: candidate.offer_id,
      })
    } catch {
      return
    }
    setAskManual(null)
    setPicked(candidate.product.id)
    toast(`«${shortName(candidate.product.name)}» добавлен вручную — с пометкой и причинами исключения`)
  }

  const dictionary = new Map((specKeys.data ?? []).map((s) => [s.key, s.name]))
  const constraints = checkedConstraints(process, dictionary)
  const criteria = Object.keys(data.weights)

  const scenarioProduct = item?.product_name ?? main?.items[0]?.product_name
  const next = main
    ? {
        label: busy ? 'Сохраняем выбор…' : `Проверить в симуляции: ${shortName(scenarioProduct ?? 'сценарий')}`,
        disabled: busy,
        run: () => navigate(stepPath(projectId, 'simulation')),
      }
    : {
        label: busy
          ? 'Собираем сценарий…'
          : open
            ? `Рассчитать конфигурацию: ${shortName(open.product.name)}`
            : 'Рассчитать конфигурацию',
        disabled: busy || storyPending || !open,
        run: () => {
          if (open) request(open, 'simulate')
        },
      }

  return (
    <Screen
      title={headline(process, ranked)}
      lead={
        <>
          {process.demand_summary && (
            <>
              Спрос: <span className="num">{process.demand_summary}</span>.{' '}
            </>
          )}
          {checkedText(process.candidates.length)} по жёстким ограничениям объекта
          {constraints.length > 0 && <> — {constraints.join(', ')}</>}; прошедшие ранжированы по {criteria.length}{' '}
          критериям справа.
        </>
      }
      nextLabel={next.label}
      nextDisabled={next.disabled}
      onNext={next.run}
    >
      <ProcessSwitcher
        processes={data.processes}
        value={process.process_key}
        inScenario={new Set(main?.items.map((i) => i.process_key) ?? [])}
        costs={costs}
        onChange={onProcess}
      />

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[7fr_5fr]">
        <div className="min-w-0">
          {ranked.length > 0 ? (
            <CandidateList
              candidates={visible}
              openId={openId}
              scenarioProductId={inScenarioId}
              choose={chooseState}
              onOpen={setPicked}
              onChoose={(c) => request(c, 'stay')}
            />
          ) : (
            <Empty title="Подходящих решений нет">
              {process.no_fit_message ??
                'Ни одно решение каталога не прошло жёсткие проверки объекта. Решение можно добавить вручную из списка ниже — с предупреждением.'}
            </Empty>
          )}
          {(hidden > 0 || showAll) && ranked.length > TOP && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink"
            >
              <ChevronDown size={14} className={`transition-transform ${showAll ? 'rotate-180' : ''}`} />
              {showAll ? 'Свернуть' : `Ещё ${hidden} — ниже по баллу или требуют проверки ТТХ`}
            </button>
          )}
          <ExcludedList candidates={excluded} onAdd={setAskManual} />
        </div>

        <div className="min-w-0">
          {matrix.length > 0 && (
            <>
              <div className="h3 mb-3">Как решения проходят по критериям</div>
              <CriteriaMatrix candidates={matrix} weights={data.weights} openId={openId} onOpen={setPicked} />
              <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
                Жёсткие ограничения исключают решение целиком, критерии дают балл от 0 до 100. Наведите на число, чтобы
                увидеть объяснение и вклад в итоговый балл.
              </p>
              {matrix.length >= 2 && (
                <Button
                  size="sm"
                  className="mt-3"
                  icon={<GitCompareArrows size={14} />}
                  onClick={() =>
                    navigate(
                      compareUrl(
                        matrix.map((c) => c.product.id),
                        projectId,
                      ),
                    )
                  }
                >
                  Сравнить выбранные по характеристикам
                </Button>
              )}
            </>
          )}
          <ScenarioNote main={main} process={process} />
          <div className="mt-5">
            <Disclosure label="Какие типы решений рассматривали">
              <ul className="space-y-1.5 text-[13px]">
                {process.solution_types.map((t) => (
                  <li key={t.key} className="flex items-baseline justify-between gap-3">
                    <span className={t.applicable ? 'text-ink-2' : 'text-ink-4'}>
                      {t.name}
                      {t.reason && <span className="block text-[12px] text-ink-4">{t.reason}</span>}
                    </span>
                    <span className="num shrink-0 text-ink-3">{t.candidates_count ?? 0}</span>
                  </li>
                ))}
              </ul>
            </Disclosure>
          </div>
        </div>
      </div>

      <CountModal
        candidate={askCount?.candidate ?? null}
        pending={busy}
        onCancel={() => setAskCount(null)}
        onConfirm={(count) => askCount && void apply(askCount.candidate, count, askCount.then)}
      />
      <ManualAddModal
        candidate={askManual}
        pending={addManual.isPending}
        onCancel={() => setAskManual(null)}
        onConfirm={() => void confirmManual()}
      />
    </Screen>
  )
}

const checkedText = (n: number) =>
  n === 1
    ? 'Единственное решение каталога для процесса проверено'
    : `Все ${n} ${pluralRu(n, ['решение', 'решения', 'решений'])} каталога для процесса проверены`

function ScenarioNote({ main, process }: { main: Scenario | undefined; process: ProcessMatching }) {
  const item = scenarioItem(main, process.process_key)
  const count = item?.count_result
  return (
    <div className="mt-5 rounded-[12px] bg-surface-2 p-4 text-[13.5px] leading-relaxed text-ink-2">
      {!main ? (
        <>
          <span className="font-medium text-ink">Сценарий ещё не собран.</span> «Рассчитать конфигурацию» возьмёт
          открытое решение и рекомендацию подбора по остальным процессам и посчитает покупку, RaaS и лизинг.
        </>
      ) : item ? (
        <>
          <span className="font-medium text-ink">В сценарии: {shortName(item.product_name ?? '')}</span>
          {count && (
            <>
              {' '}
              — <span className="num">{count.final}</span> шт.{' '}
              {count.source === 'simulated'
                ? '(подтверждено имитацией)'
                : count.source === 'manual'
                  ? '(задано вручную)'
                  : '(оценка по циклу, уточнит имитация)'}
            </>
          )}
          . Другое решение из списка заменит его в расчёте.
        </>
      ) : (
        <>
          <span className="font-medium text-ink">Процесс пока не входит в сценарий.</span> Откройте решение и нажмите
          «Добавить в сценарий», чтобы учесть его в экономике.
        </>
      )}
    </div>
  )
}

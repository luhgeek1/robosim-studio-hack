import { AnimatePresence, motion } from 'framer-motion'
import { GitCompareArrows, RotateCw, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useMatching, useRunMatching } from '@/entities/matching'
import { useProjectId } from '@/entities/project'
import { useCreateScenario } from '@/entities/scenario'
import { parseApiProblem } from '@/shared/api/problem'
import type { Candidate, CandidateStatus, MatchingResult, ProcessMatching } from '@/shared/api/types'
import { pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Screen } from '@/shared/ui/page'
import { EmptyState, ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { Segmented } from '@/shared/ui/v0'
import { CandidateCard } from './CandidateCard'
import { MAX_COMPARE, STATUS_ORDER } from './labels'
import { RecommendedBlock } from './RecommendedBlock'
import { WeightsPopover } from './WeightsPopover'

export function MatchingPage() {
  const projectId = useProjectId()
  const matching = useMatching(projectId)
  const run = useRunMatching(projectId)
  const createScenario = useCreateScenario(projectId)
  const navigate = useNavigate()
  const [includeRnd, setIncludeRnd] = useState(false)
  const [compare, setCompare] = useState<string[]>([])

  const createFromRecommendation = () =>
    createScenario.mutate(
      { name: 'Покупка по рекомендации подбора', kind: 'purchase', from_recommendation: true },
      { onSuccess: (scenario) => navigate(`/projects/${projectId}/scenarios/${scenario.id}`) },
    )

  const data = matching.data
  const noFit = data ? (data.totals?.fit ?? 0) === 0 : true
  const fit = data?.totals?.fit ?? 0
  const total = fit + (data?.totals?.check ?? 0) + (data?.totals?.excluded ?? 0)
  // «Лучшее» — первое место по баллу в первом процессе подбора; процесс называем, чтобы заголовок не обобщал.
  const firstProcess = data?.processes.find((p) => p.candidates.some((c) => c.status === 'fit'))
  const best = firstProcess?.candidates.find((c) => c.status === 'fit')

  return (
    <Screen
      wide
      dense
      title={
        data
          ? fit
            ? `Подходят ${fit} ${pluralRu(fit, ['решение', 'решения', 'решений'])} из ${total}${best && firstProcess ? `, лучшее в процессе «${firstProcess.name.split(' (')[0]}» — ${best.product.name}` : ''}`
            : 'Подходящих решений не найдено'
          : 'Подбор роботов'
      }
      actions={
        data && (
          <>
            <WeightsPopover
              projectId={projectId}
              weights={data.weights}
              includeRnd={includeRnd}
              onIncludeRndChange={setIncludeRnd}
            />
            <Button
              variant="outline"
              onClick={() => run.mutate({ weights: data.weights, include_rnd: includeRnd })}
              disabled={run.isPending}
            >
              {run.isPending ? <Spinner /> : <RotateCw />} Пересчитать
            </Button>
            <Button onClick={createFromRecommendation} disabled={createScenario.isPending || noFit}>
              {createScenario.isPending ? <Spinner /> : <Sparkles />} Создать сценарий из рекомендации
            </Button>
          </>
        )
      }
    >
      {matching.isPending && <LoadingBlock rows={4} />}
      {matching.isError &&
        (parseApiProblem(matching.error).status === 409 ? (
          <EmptyState
            title="Подбор пока невозможен"
            description={parseApiProblem(matching.error).detail}
            action={
              <Button asChild>
                <Link to={`/projects/${projectId}/object`}>Заполнить параметры объекта</Link>
              </Button>
            }
          />
        ) : (
          <ErrorBlock error={matching.error} onRetry={() => matching.refetch()} />
        ))}

      {data && <RecommendedBlock projectId={projectId} matching={data} />}
      {data && <h2 className="h2 mb-5">Все кандидаты</h2>}

      {data && (
        <MatchingView
          projectId={projectId}
          data={data}
          compare={compare}
          onToggleCompare={(id, on) =>
            setCompare((prev) =>
              on ? [...new Set([...prev, id])].slice(0, MAX_COMPARE) : prev.filter((x) => x !== id),
            )
          }
        />
      )}

      {compare.length > 0 && (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-[14px] border border-line bg-white/95 px-4 py-2 shadow-float backdrop-blur">
          <span className="text-sm">
            Выбрано для сравнения: <span className="num font-medium">{compare.length}</span> из {MAX_COMPARE}
          </span>
          <Button asChild size="sm" disabled={compare.length < 2}>
            {compare.length < 2 ? (
              <span aria-disabled className="pointer-events-none opacity-50">
                <GitCompareArrows /> Сравнить
              </span>
            ) : (
              <Link to={`/catalog/compare?ids=${compare.join(',')}&project=${projectId}`}>
                <GitCompareArrows /> Сравнить
              </Link>
            )}
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => setCompare([])} aria-label="Очистить выбор">
            <X />
          </Button>
        </div>
      )}
    </Screen>
  )
}

type Filter = 'all' | CandidateStatus

function MatchingView({
  projectId,
  data,
  compare,
  onToggleCompare,
}: {
  projectId: string
  data: MatchingResult
  compare: string[]
  onToggleCompare: (productId: string, on: boolean) => void
}) {
  const [params, setParams] = useSearchParams()
  const selectedKey = params.get('process') ?? data.processes[0]?.process_key
  const selected = data.processes.find((p) => p.process_key === selectedKey) ?? data.processes[0]

  if (data.processes.length === 0) {
    return (
      <EmptyState
        title="Нет процессов для подбора"
        description="Проверьте набор процессов объекта на шаге «Где деньги»."
      />
    )
  }

  return (
    <div className="grid grid-cols-[15rem_minmax(0,1fr)] items-start gap-8">
      <nav className="sticky top-40 space-y-0.5" aria-label="Процессы">
        {data.processes.map((process) => {
          const active = process === selected
          const fit = process.candidates.filter((c) => c.status === 'fit').length
          return (
            <button
              key={process.process_key}
              type="button"
              onClick={() => setParams({ process: process.process_key }, { replace: true })}
              className={cn(
                'relative flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left text-[13.5px] transition-colors',
                active ? 'text-ink' : 'text-ink-3 hover:text-ink',
              )}
            >
              {active && (
                <motion.span
                  layoutId="matching-process"
                  className="absolute inset-0 rounded-lg bg-white shadow-[0_1px_2px_rgba(20,20,24,0.06),0_0_0_1px_rgba(20,20,24,0.04)]"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
              <span className="relative min-w-0 flex-1 leading-snug">{shortName(process.name)}</span>
              <span className={cn('num relative text-[12px] leading-snug', fit ? 'text-ok' : 'text-ink-4')}>
                {fit}/{process.candidates.length}
              </span>
            </button>
          )
        })}
      </nav>

      {selected && (
        <ProcessView
          key={selected.process_key}
          projectId={projectId}
          process={selected}
          compare={compare}
          onToggleCompare={onToggleCompare}
        />
      )}
    </div>
  )
}

function ProcessView({
  projectId,
  process,
  compare,
  onToggleCompare,
}: {
  projectId: string
  process: ProcessMatching
  compare: string[]
  onToggleCompare: (productId: string, on: boolean) => void
}) {
  const counts = countByStatus(process.candidates)
  const [filter, setFilter] = useState<Filter>('all')
  const ordered = STATUS_ORDER.flatMap((status) => process.candidates.filter((c) => c.status === status))
  const shown = filter === 'all' ? ordered : ordered.filter((c) => c.status === filter)

  return (
    <div className="space-y-5">
      <div>
        <Segmented
          layoutId="matching-filter"
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `Все · ${process.candidates.length}` },
            ...STATUS_ORDER.filter((s) => counts[s]).map((s) => ({
              value: s as Filter,
              label: `${FILTER_LABEL[s]} · ${counts[s]}`,
            })),
          ]}
        />
      </div>

      {process.no_fit_message && (
        <p className="flex items-start gap-2 rounded-xl bg-warn-soft/60 px-4 py-3 text-[13.5px] text-ink-2">
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn" />
          {process.no_fit_message}
        </p>
      )}

      {shown.length === 0 ? (
        <EmptyState title="Кандидатов нет" description="В каталоге нет продуктов для этого процесса и типа объекта." />
      ) : (
        <motion.div layout className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence initial={false} mode="popLayout">
            {shown.map((candidate, i) => (
              <motion.div
                key={candidate.offer_id ?? candidate.product.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 260, damping: 30, delay: Math.min(i, 8) * 0.02 }}
                className="flex"
              >
                <CandidateCard
                  projectId={projectId}
                  processKey={process.process_key}
                  candidate={candidate}
                  selected={compare.includes(candidate.product.id)}
                  selectDisabled={compare.length >= MAX_COMPARE}
                  onSelectedChange={(on) => onToggleCompare(candidate.product.id, on)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  )
}

const FILTER_LABEL: Record<CandidateStatus, string> = {
  fit: 'Подходят',
  check: 'Проверить',
  manual: 'Вручную',
  excluded: 'Не подходят',
}

// «Перемещение паллет (приёмка → хранение → отгрузка)» → «Перемещение паллет»: во вкладке хватает сути.
const shortName = (name: string) => name.split(' (')[0]

function countByStatus(candidates: Candidate[]): Partial<Record<CandidateStatus, number>> {
  const counts: Partial<Record<CandidateStatus, number>> = {}
  for (const c of candidates) counts[c.status] = (counts[c.status] ?? 0) + 1
  return counts
}

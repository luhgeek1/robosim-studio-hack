import { ChevronRight, GitCompareArrows, RotateCw, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { CANDIDATE_STATUS_LABEL, useMatching, useRunMatching } from '@/entities/matching'
import { useProjectId } from '@/entities/project'
import { useCreateScenario } from '@/entities/scenario'
import { parseApiProblem } from '@/shared/api/problem'
import type { Candidate, CandidateStatus, MatchingResult, ProcessMatching } from '@/shared/api/types'
import { formatDateTime, formatNumber, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible'
import { Screen, Stat, StatStrip } from '@/shared/ui/page'
import { EmptyState, ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { ToneBadge, ToneDot } from '@/shared/ui/tone'
import { CandidateCard } from './CandidateCard'
import { MAX_COMPARE, STATUS_GROUP_HINT, STATUS_ORDER, STATUS_TONE } from './labels'
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
      title={
        data
          ? fit
            ? `Подходят ${fit} ${pluralRu(fit, ['решение', 'решения', 'решений'])} из ${total}${best && firstProcess ? `, лучшее в процессе «${firstProcess.name.split(' (')[0]}» — ${best.product.name}` : ''}`
            : 'Подходящих решений не найдено'
          : 'Подбор роботов'
      }
      lead="Каталог отфильтрован по ограничениям объекта: тип груза, вес, ширина проходов, пол и зрелость решения. Оставшиеся решения ранжированы по производительности на вашем объекте, стоимости, инфраструктуре, зрелости и качеству данных."
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

  return (
    <>
      <StatStrip columns={4} className="mb-6">
        <Stat
          label="Подходит"
          value={formatNumber(data.totals?.fit)}
          valueClassName="text-ok"
          hint="продуктов по всем процессам"
        />
        <Stat
          label="Требует проверки"
          value={formatNumber(data.totals?.check)}
          valueClassName="text-warn"
          hint="не хватает данных по ограничению"
        />
        <Stat
          label="Не подходит"
          value={formatNumber(data.totals?.excluded)}
          valueClassName="text-crit"
          hint="подтверждённое несоответствие"
        />
        <Stat
          label="Каталог"
          value={<span className="text-base">версия {data.catalog_version}</span>}
          hint={`подбор от ${formatDateTime(data.computed_at)}, данные объекта v${data.project_version}`}
        />
      </StatStrip>

      {data.processes.length === 0 ? (
        <EmptyState
          title="Нет процессов для подбора"
          description="Проверьте набор процессов объекта на шаге «Где деньги»."
        />
      ) : (
        <div className="grid grid-cols-[260px_1fr] items-start gap-6">
          <nav className="sticky top-36 space-y-1" aria-label="Процессы">
            {data.processes.map((process) => {
              const counts = countByStatus(process.candidates)
              const active = process === selected
              return (
                <button
                  key={process.process_key}
                  type="button"
                  onClick={() => setParams({ process: process.process_key }, { replace: true })}
                  className={cn(
                    'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                    active ? 'border-primary/50 bg-surface' : 'border-transparent hover:bg-surface',
                  )}
                >
                  <div className="text-sm leading-snug font-medium">{process.name}</div>
                  {process.demand_summary && (
                    <div className="num mt-0.5 text-xs text-muted-foreground">{process.demand_summary}</div>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs">
                    {STATUS_ORDER.filter((s) => counts[s]).map((status) => (
                      <span
                        key={status}
                        className="inline-flex items-center gap-1"
                        title={CANDIDATE_STATUS_LABEL[status]}
                      >
                        <ToneDot tone={STATUS_TONE[status]} />
                        <span className="num">{counts[status]}</span>
                      </span>
                    ))}
                  </div>
                </button>
              )
            })}
          </nav>

          {selected && (
            <ProcessView projectId={projectId} process={selected} compare={compare} onToggleCompare={onToggleCompare} />
          )}
        </div>
      )}
    </>
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
  const groups = STATUS_ORDER.map((status) => ({
    status,
    items: process.candidates.filter((c) => c.status === status),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="min-w-0 space-y-5">
      <div className="space-y-2">
        <h2 className="text-[17px] font-semibold">{process.name}</h2>
        {process.demand_summary && (
          <p className="text-muted-foreground">
            Спрос: <span className="num">{process.demand_summary}</span>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {process.solution_types.map((type) => (
            <div
              key={type.key}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs',
                type.applicable ? 'bg-surface' : 'border-dashed bg-transparent text-muted-foreground',
              )}
              title={type.reason ?? undefined}
            >
              <div className="flex items-center gap-1.5 font-medium">
                <ToneDot tone={type.applicable ? 'ok' : 'muted'} />
                {type.name}
                {type.candidates_count !== undefined && (
                  <span className="num font-normal text-muted-foreground">· {type.candidates_count}</span>
                )}
              </div>
              {type.reason && <div className="mt-0.5 max-w-80 text-muted-foreground">{type.reason}</div>}
            </div>
          ))}
        </div>
      </div>

      {process.no_fit_message && (
        <div className="rounded-lg border border-l-2 border-l-warn bg-surface px-4 py-3">{process.no_fit_message}</div>
      )}

      {groups.length === 0 && (
        <EmptyState title="Кандидатов нет" description="В каталоге нет продуктов для этого процесса и типа объекта." />
      )}

      {groups.map(({ status, items }) => (
        <CandidateGroup
          key={status}
          projectId={projectId}
          processKey={process.process_key}
          status={status}
          items={items}
          compare={compare}
          onToggleCompare={onToggleCompare}
        />
      ))}
    </div>
  )
}

function CandidateGroup({
  projectId,
  processKey,
  status,
  items,
  compare,
  onToggleCompare,
}: {
  projectId: string
  processKey: string
  status: CandidateStatus
  items: Candidate[]
  compare: string[]
  onToggleCompare: (productId: string, on: boolean) => void
}) {
  const [open, setOpen] = useState(status !== 'excluded')
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="group flex w-full items-center gap-2 text-left">
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
        <ToneBadge tone={STATUS_TONE[status]}>
          {CANDIDATE_STATUS_LABEL[status]} · <span className="num">{items.length}</span>
        </ToneBadge>
        <span className="text-xs text-muted-foreground">{STATUS_GROUP_HINT[status]}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2">
        {items.map((candidate) => (
          <CandidateCard
            key={candidate.offer_id ?? candidate.product.id}
            projectId={projectId}
            processKey={processKey}
            candidate={candidate}
            selected={compare.includes(candidate.product.id)}
            selectDisabled={compare.length >= MAX_COMPARE}
            onSelectedChange={(on) => onToggleCompare(candidate.product.id, on)}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

function countByStatus(candidates: Candidate[]): Partial<Record<CandidateStatus, number>> {
  const counts: Partial<Record<CandidateStatus, number>> = {}
  for (const c of candidates) counts[c.status] = (counts[c.status] ?? 0) + 1
  return counts
}

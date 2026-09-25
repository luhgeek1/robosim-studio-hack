import { ArrowLeft, Calculator, ListTree, RotateCcw, Save, Star } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useProject, useProjectId } from '@/entities/project'
import { SCENARIO_KIND_LABEL, useCalculate, useCalculation, useScenario, useUpdateScenario } from '@/entities/scenario'
import { formatDateTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { EmptyState, ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { Segmented } from '@/shared/ui/v0'
import { CalculationView } from './CalculationView'
import { draftProblems, sameDraft, toDraft, toUpdate, type Draft } from './draft'
import { ScenarioEditor } from './ScenarioEditor'
import { TraceSheet } from './TraceSheet'

export function ScenarioPage() {
  const projectId = useProjectId()
  const { scenarioId = '' } = useParams()
  const project = useProject(projectId).data!
  const scenario = useScenario(scenarioId)
  const calculationId = scenario.data?.last_calculation?.calculation_id
  const calculation = useCalculation(calculationId)
  const update = useUpdateScenario(projectId, scenarioId)
  const calculate = useCalculate(projectId, scenarioId)

  const [draft, setDraft] = useState<Draft | null>(null)
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [tab, setTab] = useState<string | null>(null)
  const [traceOpen, setTraceOpen] = useState(false)
  const [traceQuery, setTraceQuery] = useState('')

  // The server copy wins after every save or recalculation; local edits live in the draft until then.
  if (scenario.data && scenario.data.updated_at !== syncedAt) {
    setSyncedAt(scenario.data.updated_at)
    setDraft(toDraft(scenario.data))
  }

  if (scenario.isPending) return <LoadingBlock rows={5} />
  if (scenario.isError) return <ErrorBlock error={scenario.error} onRetry={() => scenario.refetch()} />
  if (!draft) return null

  const current = scenario.data
  const isBaseline = current.is_baseline
  const dirty = !sameDraft(draft, toDraft(current), isBaseline)
  const problems = draftProblems(draft)
  const stale = current.last_calculation?.status === 'stale'
  const busy = update.isPending || calculate.isPending
  const activeTab = tab ?? (calculationId ? 'result' : 'config')

  const save = async () => {
    await update.mutateAsync(toUpdate(draft, isBaseline))
  }
  const saveAndCalculate = async () => {
    if (dirty) await save()
    await calculate.mutateAsync()
    setTab('result')
  }
  const openTrace = (query: string) => {
    setTraceQuery(query)
    setTraceOpen(true)
  }

  return (
    <div className="mx-auto max-w-300 space-y-5 pb-16 pt-2">
      <div className="space-y-3">
        <Link
          to={`/projects/${projectId}/scenarios`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Все сценарии
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              aria-label="Название сценария"
              className="h1 h-auto border-transparent bg-transparent px-0 shadow-none hover:border-border focus-visible:px-2 md:text-[34px]"
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-ink-3">
              <span className="flex items-center gap-1.5 font-medium text-ink-2">
                <span className="size-1.5 rounded-full bg-ink-4" />
                {SCENARIO_KIND_LABEL[current.kind]}
              </span>
              {current.is_recommended && (
                <span className="flex items-center gap-1 font-medium text-ink">
                  <Star size={12} className="fill-warn text-warn" /> рекомендуем
                </span>
              )}
              {current.last_calculation ? (
                <span className="num">рассчитан {formatDateTime(current.last_calculation.computed_at)}</span>
              ) : (
                <span>ещё не рассчитан</span>
              )}
              {stale && (
                <span className="flex items-center gap-1.5 text-warn">
                  <span className="size-1.5 rounded-full bg-warn" /> данные менялись после расчёта
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {calculationId && (
              <Button variant="outline" onClick={() => openTrace('')}>
                <ListTree /> Трасса расчёта
              </Button>
            )}
            <Button onClick={saveAndCalculate} disabled={busy || problems.length > 0}>
              {calculate.isPending ? <Spinner /> : <Calculator />}
              {dirty ? 'Сохранить и рассчитать' : current.last_calculation ? 'Пересчитать' : 'Рассчитать'}
            </Button>
          </div>
        </div>
      </div>

      {(dirty || problems.length > 0) && (
        <div className="sticky top-34 z-20 flex flex-wrap items-center gap-3 rounded-[12px] border border-line bg-white/95 px-4 py-2.5 text-sm shadow-float backdrop-blur">
          <span className="font-medium">Есть несохранённые изменения</span>
          {problems.length > 0 && <span className="text-warn">{problems[0]}</span>}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDraft(toDraft(current))} disabled={busy}>
              <RotateCcw /> Отменить
            </Button>
            <Button variant="outline" size="sm" onClick={save} disabled={busy || problems.length > 0}>
              {update.isPending ? <Spinner /> : <Save />} Сохранить
            </Button>
          </div>
        </div>
      )}

      <Segmented
        layoutId="scenario-tab"
        value={activeTab}
        onChange={setTab}
        options={[
          { value: 'result', label: 'Результат расчёта' },
          { value: 'config', label: isBaseline ? 'Условия' : 'Состав и условия' },
        ]}
      />
      {activeTab === 'result' && (
        <div className="pt-1">
          {!calculationId && (
            <EmptyState
              title="Сценарий ещё не рассчитан"
              description={
                isBaseline
                  ? 'Рассчитайте базу — это точка отсчёта для всех сценариев.'
                  : 'Проверьте состав и условия и нажмите «Рассчитать».'
              }
              action={
                <Button onClick={saveAndCalculate} disabled={busy || problems.length > 0}>
                  <Calculator /> Рассчитать
                </Button>
              }
            />
          )}
          {calculation.isPending && calculationId && <LoadingBlock rows={4} />}
          {calculation.isError && <ErrorBlock error={calculation.error} onRetry={() => calculation.refetch()} />}
          {calculation.data && <CalculationView run={calculation.data} isBaseline={isBaseline} onTrace={openTrace} />}
        </div>
      )}
      {activeTab === 'config' && (
        <div className="pt-1">
          <ScenarioEditor
            projectId={projectId}
            objectType={project.object_type}
            scenario={current}
            draft={draft}
            onChange={setDraft}
          />
        </div>
      )}

      {calculationId && (
        <TraceSheet
          calculationId={calculationId}
          open={traceOpen}
          onOpenChange={setTraceOpen}
          query={traceQuery}
          onQueryChange={setTraceQuery}
        />
      )}
    </div>
  )
}

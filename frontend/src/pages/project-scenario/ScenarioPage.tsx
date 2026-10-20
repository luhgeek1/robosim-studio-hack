import { ArrowLeft, ArrowRight, Calculator, ListTree, RotateCcw, Save, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useProject, useProjectId } from '@/entities/project'
import { SCENARIO_KIND_LABEL, useCalculate, useCalculation, useScenario, useUpdateScenario } from '@/entities/scenario'
import { parseApiProblem } from '@/shared/api/problem'
import { formatDateTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Textarea } from '@/shared/ui/textarea'
import { EmptyState, ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { Segmented } from '@/shared/ui/v0'
import { CalculationView } from './CalculationView'
import { RfqPanel } from './RfqPanel'
import { draftProblems, sameDraft, toDraft, toUpdate, type Draft } from './draft'
import { ScenarioEditor } from './ScenarioEditor'
import { TraceSheet } from './TraceSheet'

export function ScenarioPage() {
  const projectId = useProjectId()
  const [searchParams] = useSearchParams()
  const { scenarioId = '' } = useParams()
  const project = useProject(projectId).data!
  const scenario = useScenario(scenarioId)
  const calculationId = scenario.data?.last_calculation?.calculation_id
  const calculation = useCalculation(calculationId)
  const update = useUpdateScenario(projectId, scenarioId)
  const calculate = useCalculate(projectId, scenarioId)

  const [draft, setDraft] = useState<Draft | null>(null)
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [tab, setTab] = useState<string | null>(searchParams.has('edit') ? 'config' : null)
  const [failure, setFailure] = useState<string | null>(null)
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({})
  const [traceOpen, setTraceOpen] = useState(false)
  const [traceQuery, setTraceQuery] = useState('')

  // The server copy wins after every save or recalculation; local edits live in the draft until then.
  if (scenario.data && scenario.data.updated_at !== syncedAt) {
    setSyncedAt(scenario.data.updated_at)
    setDraft(toDraft(scenario.data))
  }

  const focusItem = (key: string) => {
    const row = document.getElementById(`scenario-item-${key}`)
    row?.scrollIntoView({ block: 'center' })
    const control = row?.querySelector<HTMLElement>('[aria-invalid="true"]')
    ;(control ?? row)?.focus({ preventScroll: true })
  }
  useEffect(() => {
    const key = Object.keys(itemErrors)[0]
    if (key && tab === 'config') focusItem(key)
  }, [itemErrors, tab])

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
    setFailure(null)
    setItemErrors({})
    try {
      if (dirty) await save()
      await calculate.mutateAsync()
      setTab('result')
    } catch (error) {
      const problem = parseApiProblem(error)
      setFailure(problem.detail)
      const errors: Record<string, string> = {}
      for (const detail of problem.details) {
        if (detail.loc?.[0] === 'items' && detail.loc[1]) errors[detail.loc[1]] = detail.msg ?? problem.detail
      }
      setItemErrors(errors)
      setTab('config')
    }
  }
  const openTrace = (query: string) => {
    setTraceQuery(query)
    setTraceOpen(true)
  }

  const nextButton = (
    // На телефоне переход дальше остаётся внизу экрана, как в остальных шагах.
    <Button asChild variant="outline" className="max-sm:hidden">
      <Link to={`/projects/${projectId}/comparison`}>
        Далее: сравнение <ArrowRight />
      </Link>
    </Button>
  )

  return (
    <div className="mx-auto w-full max-w-300 space-y-5 pb-16 pt-2">
      <div className="space-y-3">
        <Link
          to={`/projects/${projectId}/scenarios`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Все сценарии
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[min(100%,18rem)] flex-1 space-y-2">
            {/* Многострочное поле: длинное название на телефоне переносится, а не обрезается. */}
            <Textarea
              rows={1}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value.replace(/\n/g, ' ') })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  e.currentTarget.blur()
                }
              }}
              aria-label="Название сценария"
              className="h1 h-auto min-h-0 resize-none border-transparent bg-transparent px-0 py-1 shadow-none hover:border-border focus-visible:px-2 max-md:text-[27px] max-md:leading-tight md:text-[34px]"
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-ink-3">
              <span className="flex items-center gap-1.5 font-medium text-ink-2">
                <span className="size-1.5 rounded-full bg-ink-4" />
                {SCENARIO_KIND_LABEL[current.kind]}
              </span>
              {current.origin === 'recommendation' && <span>На основе рекомендации подбора · состав можно менять</span>}
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
          <div className="flex flex-wrap items-center gap-2">
            {calculationId && (
              <Button variant="outline" onClick={() => openTrace('')}>
                <ListTree /> Трасса расчёта
              </Button>
            )}
            <Button onClick={saveAndCalculate} disabled={busy || problems.length > 0}>
              {calculate.isPending ? <Spinner /> : <Calculator />}
              {calculate.isPending
                ? 'Рассчитываем…'
                : dirty
                  ? 'Сохранить и рассчитать'
                  : current.last_calculation
                    ? 'Пересчитать'
                    : 'Рассчитать'}
            </Button>
            {nextButton}
          </div>
        </div>
      </div>

      {failure && (
        <div role="alert" className="rounded-xl border border-crit/30 bg-crit-soft/50 p-4 text-sm">
          <p className="font-medium text-crit">Расчёт не выполнен</p>
          <p className="mt-1">{failure}</p>
          {Object.keys(itemErrors).map((key) => (
            <Button
              key={key}
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                setTab('config')
                focusItem(key)
              }}
            >
              Перейти к количеству
            </Button>
          ))}
        </div>
      )}
      {isBaseline && (
        <p className="rounded-xl border border-line bg-card p-4 text-sm text-ink-3">
          «Как сейчас» - база без роботизации: текущие расходы на персонал и другие введённые затраты. Уже установленный
          парк роботов и его обслуживание отдельно не моделируются (ТЗ §3.5.5).
        </p>
      )}
      {(dirty || problems.length > 0) && (
        <div className="sticky top-34 z-20 flex flex-wrap items-center gap-3 rounded-[12px] border border-line bg-white/95 px-4 py-2.5 text-sm shadow-float backdrop-blur">
          <span className="font-medium">{dirty ? 'Есть несохранённые изменения' : 'Проверьте состав сценария'}</span>
          {problems.length > 0 && <span className="text-warn">{problems[0]}</span>}
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDraft(toDraft(current))} disabled={busy}>
              <RotateCcw /> Отменить
            </Button>
            <Button variant="outline" size="sm" onClick={save} disabled={busy || problems.length > 0}>
              {update.isPending ? <Spinner /> : <Save />} Сохранить
            </Button>
          </div>
        </div>
      )}

      <RfqPanel
        projectId={projectId}
        scenario={current}
        onApplyPrice={(productId, price, reason) => {
          setDraft({
            ...draft,
            items: draft.items.map((item) =>
              item.product_id === productId ? { ...item, price_override_rub: price, override_reason: reason } : item,
            ),
          })
          setTab('config')
        }}
      />
      <Segmented
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
                  ? 'Рассчитайте базу - это точка отсчёта для всех сценариев.'
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
          {calculation.data && (
            <CalculationView
              run={calculation.data}
              isBaseline={isBaseline}
              onTrace={openTrace}
              locked={dirty || busy}
            />
          )}
        </div>
      )}
      {activeTab === 'config' && (
        <fieldset disabled={busy} className="pt-1">
          <ScenarioEditor
            projectId={projectId}
            objectType={project.object_type}
            scenario={current}
            draft={draft}
            itemErrors={itemErrors}
            onChange={(value) => {
              setDraft(value)
              setFailure(null)
              setItemErrors({})
            }}
          />
        </fieldset>
      )}

      <div className="hairline mt-10 flex flex-wrap-reverse items-center justify-between gap-3 pt-6 sm:mt-12">
        <Button asChild variant="ghost">
          <Link to={`/projects/${projectId}/scenarios`}>
            <ArrowLeft /> Все сценарии
          </Link>
        </Button>
        <Button asChild size="lg">
          <Link to={`/projects/${projectId}/comparison`}>
            Далее: сравнение <ArrowRight />
          </Link>
        </Button>
      </div>

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

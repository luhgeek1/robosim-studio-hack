import { ArrowRight, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useProjectId } from '@/entities/project'
import { SCENARIO_KIND_LABEL, useScenarios, useSensitivity } from '@/entities/scenario'
import { formatDateTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { PageHeader, Section } from '@/shared/ui/page'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { EmptyState, ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { ToneBadge } from '@/shared/ui/tone'
import { Heatmap } from './Heatmap'
import { METRIC, METRIC_KEYS, type Metric } from './metrics'
import { MonteCarloPanel } from './MonteCarloPanel'
import { SurveyPanel } from './SurveyPanel'
import { Tornado } from './Tornado'

const HEATMAP = { x_key: 'labor_cost', y_key: 'operations_volume', steps: 7 }

export function RisksPage() {
  const projectId = useProjectId()
  const scenarios = useScenarios(projectId)
  const [picked, setPicked] = useState<string>()
  const [metric, setMetric] = useState<Metric>('payback_years')

  const options = (scenarios.data ?? []).filter((s) => !s.is_baseline && s.last_calculation)
  const scenario =
    options.find((s) => s.id === picked) ?? options.find((s) => s.is_recommended) ?? options.at(0) ?? null

  const header = (
    <PageHeader
      eyebrow="Риски и обследование"
      title="Насколько устойчив результат"
      description="Какие параметры сильнее всего меняют окупаемость (ТЗ 3.5.6), как результат распределяется при неопределённости и что замерить на объекте в первую очередь (ТЗ 3.7.5)."
      actions={
        options.length > 0 && (
          <Select value={scenario?.id} onValueChange={setPicked}>
            <SelectTrigger className="min-w-72">
              <SelectValue placeholder="Сценарий" />
            </SelectTrigger>
            <SelectContent>
              {options.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} · {SCENARIO_KIND_LABEL[s.kind]}
                  {s.is_recommended && ' · рекомендуем'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      }
    />
  )

  if (scenarios.isPending) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        {header}
        <LoadingBlock rows={4} />
      </div>
    )
  }

  if (scenarios.isError || !scenario) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        {header}
        {scenarios.isError ? (
          <ErrorBlock error={scenarios.error} onRetry={() => scenarios.refetch()} />
        ) : (
          <EmptyState
            icon={<ShieldAlert className="size-6" />}
            title="Нет рассчитанных сценариев роботизации"
            description="Анализ рисков строится для сценария роботизации с готовым расчётом. Базовый сценарий «как сейчас» — точка отсчёта, для него риски не считаются."
            action={
              <Button asChild>
                <Link to="../scenarios">
                  К сценариям <ArrowRight />
                </Link>
              </Button>
            }
          />
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {header}

      {scenario.last_calculation?.status === 'stale' && (
        <div className="flex items-center gap-3 rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 text-warn">
          <ToneBadge tone="warn">устарел — пересчитайте</ToneBadge>
          Данные объекта изменились после расчёта сценария «{scenario.name}».
          <Button asChild size="sm" variant="outline" className="ml-auto">
            <Link to={`../scenarios/${scenario.id}`}>Открыть сценарий</Link>
          </Button>
        </div>
      )}

      <SensitivitySections scenarioId={scenario.id} metric={metric} onMetric={setMetric} />
      <MonteCarloPanel scenarioId={scenario.id} />
      <SurveyPanel scenarioId={scenario.id} />
    </div>
  )
}

function SensitivitySections({
  scenarioId,
  metric,
  onMetric,
}: {
  scenarioId: string
  metric: Metric
  onMetric: (m: Metric) => void
}) {
  const tornado = useSensitivity(scenarioId, { metric })
  const heatmap = useSensitivity(scenarioId, { metric, heatmap: HEATMAP })

  const metricSelect = (
    <Select value={metric} onValueChange={(v) => onMetric(v as Metric)}>
      <SelectTrigger className="min-w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {METRIC_KEYS.map((m) => (
          <SelectItem key={m} value={m}>
            {METRIC[m].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  return (
    <>
      <Section
        title="Чувствительность: торнадо"
        description={
          <>
            Каждый параметр по очереди сдвигается к нижней и верхней границе диапазона, остальные остаются как в
            расчёте. Сверху — параметры с наибольшим влиянием.
            {tornado.data?.computed_at && (
              <span className="text-xs"> Рассчитано {formatDateTime(tornado.data.computed_at)}.</span>
            )}
          </>
        }
        actions={metricSelect}
      >
        {tornado.isPending && <LoadingBlock rows={4} />}
        {tornado.isError && <ErrorBlock error={tornado.error} onRetry={() => tornado.refetch()} />}
        {tornado.data && <Tornado result={tornado.data} metric={metric} />}
      </Section>

      <Section
        title="Тепловая карта: ФОТ × объём операций"
        description={`Одновременное изменение двух главных внешних факторов. Показатель: ${METRIC[metric].label}.`}
      >
        {heatmap.isPending && <LoadingBlock rows={3} />}
        {heatmap.isError && <ErrorBlock error={heatmap.error} onRetry={() => heatmap.refetch()} />}
        {heatmap.data && <Heatmap result={heatmap.data} metric={metric} />}
      </Section>
    </>
  )
}

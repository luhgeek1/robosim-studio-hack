import { ArrowRight, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useProjectId } from '@/entities/project'
import { SCENARIO_KIND_LABEL, useMonteCarlo, useScenarios, useSensitivity } from '@/entities/scenario'
import type { MonteCarloResult } from '@/shared/api/types'
import { formatNumber, formatPayback, formatPct, formatYears, isNum } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Callout, Screen, Section, Stat, StatStrip } from '@/shared/ui/page'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { EmptyState, ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { ToneBadge } from '@/shared/ui/tone'
import { Segmented } from '@/shared/ui/v0'
import { Heatmap } from './Heatmap'
import { MC_REQUEST, METRIC, METRIC_KEYS, type Metric } from './metrics'
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

  // Same request as the panel's default view, so the title and the panel share one cached run.
  const mc = useMonteCarlo(scenario?.id, { ...MC_REQUEST, metric: 'payback_years' })
  const probability = mc.data?.probability ?? {}
  const title = isNum(probability.payback_le_5y)
    ? `В ${formatPct(probability.payback_le_5y, { share: true, digits: 0 })} случаев окупится быстрее 5 лет`
    : 'Насколько устойчив результат'
  const lead = 'Разброс результата, что сильнее всего его двигает и какие данные объекта замерить первыми.'
  const actions = options.length > 0 && (
    <Select value={scenario?.id} onValueChange={setPicked}>
      <SelectTrigger className="max-w-[calc(100vw-2rem)] min-w-0 sm:min-w-72">
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

  if (scenarios.isPending) {
    return (
      <Screen title="Насколько устойчив результат" lead={lead}>
        <LoadingBlock label="Загружаем сценарии…" />
      </Screen>
    )
  }

  if (scenarios.isError || !scenario) {
    return (
      <Screen title="Насколько устойчив результат" lead={lead} nextDisabled>
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
      </Screen>
    )
  }

  return (
    <Screen title={title} lead={lead} actions={actions} nextLabel="Проверить имитацией">
      <div className="space-y-6">
        {scenario.last_calculation?.status === 'stale' && (
          <Callout
            action={
              <Button asChild size="sm" variant="outline">
                <Link to={`../scenarios/${scenario.id}`}>Открыть сценарий</Link>
              </Button>
            }
          >
            <ToneBadge tone="warn" className="mr-2">
              устарел
            </ToneBadge>
            Данные объекта изменились после расчёта сценария «{scenario.name}» — пересчитайте его.
          </Callout>
        )}

        {mc.data && <Odds result={mc.data} horizon={scenario.horizon_years} />}
        <MonteCarloPanel scenarioId={scenario.id} horizon={scenario.horizon_years} />
        <SensitivitySections scenarioId={scenario.id} metric={metric} onMetric={setMetric} />
        <SurveyPanel scenarioId={scenario.id} />
      </div>
    </Screen>
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

  const metricSwitch = (
    <Segmented
      size="sm"
      value={metric}
      onChange={onMetric}
      options={METRIC_KEYS.map((m) => ({ value: m, label: METRIC[m].short, hint: METRIC[m].label }))}
    />
  )

  return (
    <>
      <Section
        title="Что сильнее всего меняет результат"
        description="Каждый параметр по очереди сдвигается к границам диапазона; сверху — самый влиятельный"
        actions={metricSwitch}
      >
        {tornado.isPending && <LoadingBlock rows={4} />}
        {tornado.isError && <ErrorBlock error={tornado.error} onRetry={() => tornado.refetch()} />}
        {tornado.data && <Tornado result={tornado.data} metric={metric} />}
      </Section>

      <Section
        title="Если зарплаты и объёмы изменятся вместе"
        description={`${METRIC[metric].label} при одновременном сдвиге ФОТ и объёма операций`}
      >
        {heatmap.isPending && <LoadingBlock rows={3} />}
        {heatmap.isError && <ErrorBlock error={heatmap.error} onRetry={() => heatmap.refetch()} />}
        {heatmap.data && <Heatmap result={heatmap.data} metric={metric} />}
      </Section>
    </>
  )
}

function Odds({ result, horizon }: { result: MonteCarloResult; horizon: number }) {
  const p = result.probability ?? {}
  const share = (v: number | undefined) => (isNum(v) ? formatPct(v, { share: true, digits: 0 }) : '—')
  return (
    <StatStrip columns={4}>
      <Stat label="Окупится до 3 лет" value={share(p.payback_le_3y)} hint="вероятность" />
      <Stat label="Окупится до 5 лет" value={share(p.payback_le_5y)} hint="вероятность" />
      <Stat label="NPV больше нуля" value={share(p.npv_positive)} hint="вероятность" />
      <Stat
        label="Окупаемость, P10–P90"
        value={
          isNum(result.p90) && result.p90 >= horizon - 1e-6
            ? `от ${formatNumber(result.p10, 1)} до «не окупается»`
            : `${formatNumber(result.p10, 1)}–${formatYears(result.p90)}`
        }
        hint={`медиана ${formatPayback(result.p50, horizon)}`}
      />
    </StatStrip>
  )
}

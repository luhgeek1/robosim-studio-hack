import { ArrowRight, ShieldAlert } from 'lucide-react'
import { useSession } from '@/entities/session'
import { useState } from 'react'
import { Link } from 'react-router'
import { useProjectId } from '@/entities/project'
import { SCENARIO_KIND_LABEL, useMonteCarlo, useScenarios, useSensitivity } from '@/entities/scenario'
import type { MonteCarloResult } from '@/shared/api/types'
import { formatNumber, formatPayback, formatPct, formatYears, isNum } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { InfoHint } from '@/shared/ui/info-hint'
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
  const { user } = useSession()
  const request = { ...MC_REQUEST, n: user?.role === 'guest' ? 1000 : MC_REQUEST.n }
  const projectId = useProjectId()
  const scenarios = useScenarios(projectId)
  const [picked, setPicked] = useState<string>()
  const [metric, setMetric] = useState<Metric>('payback_years')

  const options = (scenarios.data ?? []).filter((s) => !s.is_baseline && s.last_calculation)
  const scenario =
    options.find((s) => s.id === picked) ?? options.find((s) => s.is_recommended) ?? options.at(0) ?? null

  // Same request as the panel's default view, so the title and the panel share one cached run.
  const mc = useMonteCarlo(scenario?.id, { ...request, metric: 'payback_years' })
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
    <div className="min-w-0 max-w-full max-sm:[&_button]:px-2">
      <Segmented
        size="sm"
        value={metric}
        onChange={onMetric}
        options={METRIC_KEYS.map((m) => ({
          value: m,
          label:
            m === 'payback_years' ? (
              <>
                <span className="sm:hidden">Срок</span>
                <span className="hidden sm:inline">{METRIC[m].short}</span>
              </>
            ) : (
              METRIC[m].short
            ),
          hint: METRIC[m].label,
        }))}
      />
    </div>
  )

  return (
    <>
      <section className="card" aria-labelledby="sensitivity-heading">
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 px-4 pt-4 pb-4 sm:px-5 sm:pt-5">
          <div className="flex min-w-0 max-w-full items-start">
            <h2 id="sensitivity-heading" className="h3 min-w-0">
              Что сильнее всего меняет результат
            </h2>
            <InfoHint
              title="Как считается влияние"
              size="sm"
              showCloseButton={false}
              className="-mt-1 -mr-1 -ml-1 max-sm:-mt-2 max-sm:-ml-2"
            >
              <p>
                Каждый параметр по очереди меняется к границам своего диапазона. Для объёма операций одновременно
                пропорционально меняется штат без роботов: это допущение о найме при росте нагрузки.
              </p>
              <p className="mt-2">
                При изменении физики парк определяется по формуле цикла; прежнее подтверждение имитацией не переносится
                на новые условия. Поэтому результат может отличаться и из-за способа подбора парка.
              </p>
              <p className="mt-2">
                Сверху — параметры с самым большим разбросом результата. Это чувствительность расчёта к параметру, а не
                вероятность исхода.
              </p>
            </InfoHint>
          </div>
          <div className="min-w-0 max-w-full max-sm:w-full">{metricSwitch}</div>
        </div>
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <p className="mb-4 text-sm text-ink-3">
            Объём меняется вместе со штатом без роботов. Для роста нагрузки при прежнем штате создайте копию сценария и
            измените только объёмы. Новые физические условия требуют повторной имитации.
          </p>
          {tornado.isPending && <LoadingBlock rows={4} />}
          {tornado.isError && <ErrorBlock error={tornado.error} onRetry={() => tornado.refetch()} />}
          {tornado.data && <Tornado result={tornado.data} metric={metric} />}
        </div>
      </section>

      <Section
        title="Если зарплаты и объёмы изменятся вместе"
        description={`${METRIC[metric].label} при изменении зарплат и объёма; штат без роботов растёт пропорционально объёму`}
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

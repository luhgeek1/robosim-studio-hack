import { useState } from 'react'
import { ArrowRight, Layers, Scale } from 'lucide-react'
import { Link } from 'react-router'
import { useProjectId } from '@/entities/project'
import { useBuildComparisonSet, useComparison } from '@/entities/scenario'
import { parseApiProblem } from '@/shared/api/problem'
import { Button } from '@/shared/ui/button'
import { formatPct, formatRub, formatYears, isNum } from '@/shared/lib/format'
import { Callout, Screen, Section, Stat, StatStrip } from '@/shared/ui/page'
import { EmptyState, ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { CashflowChart } from './CashflowChart'
import { ComparisonGrid } from './ComparisonGrid'
import { ScenarioCards } from './ScenarioCards'
import { WhySheet } from './WhySheet'

const MIN_ROBOTIZED = 2

export function ComparisonPage() {
  const projectId = useProjectId()
  const comparison = useComparison(projectId)
  const buildSet = useBuildComparisonSet(projectId)
  const [whyOpen, setWhyOpen] = useState(false)
  const table = comparison.data
  const buildSetButton = (size?: 'sm') => (
    <Button size={size} onClick={() => buildSet.mutate()} disabled={buildSet.isPending}>
      {buildSet.isPending ? <Spinner /> : <Layers />} Собрать покупку, RaaS и лизинг
    </Button>
  )

  if (comparison.isPending) {
    return (
      <Screen title="Как сейчас против роботизации">
        <LoadingBlock label="Сравниваем сценарии…" />
      </Screen>
    )
  }

  if (comparison.isError) {
    const noScenarios = parseApiProblem(comparison.error).status === 409
    return (
      <Screen title="Как сейчас против роботизации" nextDisabled>
        {noScenarios ? (
          <EmptyState
            icon={<Scale className="size-6" />}
            title="Нет рассчитанных сценариев роботизации"
            description="Для сравнения нужен рассчитанный сценарий «как сейчас» и хотя бы два сценария роботизации. Их можно собрать одной кнопкой: покупка по рекомендации подбора, её копии как RaaS и лизинг — все сразу рассчитаются."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {buildSetButton()}
                <Button asChild variant="outline">
                  <Link to="../scenarios">
                    К сценариям <ArrowRight />
                  </Link>
                </Button>
              </div>
            }
          />
        ) : (
          <ErrorBlock error={comparison.error} onRetry={() => comparison.refetch()} />
        )}
      </Screen>
    )
  }

  const robotized = table!.scenarios.filter((s) => s.kind !== 'baseline').length
  const stale = table!.scenarios.filter((s) => s.status === 'stale').length
  const best =
    table!.scenarios.find((s) => s.scenario_id === table!.recommendation?.scenario_id) ??
    table!.scenarios.find((s) => s.kind !== 'baseline')
  const m = best?.metrics

  return (
    <Screen title={table!.verdict.headline} nextLabel="Проверить риски">
      <div className="space-y-6">
        {(robotized < MIN_ROBOTIZED || stale > 0) && (
          <Callout
            action={
              robotized < MIN_ROBOTIZED ? (
                buildSetButton('sm')
              ) : (
                <Button asChild size="sm" variant="outline">
                  <Link to="../scenarios">К сценариям</Link>
                </Button>
              )
            }
          >
            <div className="space-y-1">
              {robotized < MIN_ROBOTIZED && (
                <div>
                  Рассчитано сценариев роботизации: {robotized}. Для сравнения нужно не меньше {MIN_ROBOTIZED}, например
                  покупка и RaaS.
                </div>
              )}
              {stale > 0 && <div>Часть сценариев рассчитана по устаревшим данным объекта — пересчитайте их.</div>}
            </div>
          </Callout>
        )}

        {m && (
          <StatStrip columns={4}>
            <Stat
              label="Окупаемость"
              value={isNum(m.payback_years) ? formatYears(m.payback_years) : 'не окупается'}
              hint={`с дисконтом — ${isNum(m.discounted_payback_years) ? formatYears(m.discounted_payback_years) : 'нет'}`}
            />
            <Stat label="Вложения" value={formatRub(m.capex_rub)} hint="CAPEX, с НДС" />
            <Stat label="Эффект в год" value={formatRub(m.effect_rub_year)} hint="минус затраты на роботов" />
            <Stat
              label="NPV"
              value={formatRub(m.npv_rub)}
              hint={`ставка ${formatPct(m.discount_rate_pct, { digits: 0 })}${isNum(m.irr_pct) ? ` · IRR ${formatPct(m.irr_pct, { digits: 0 })}` : ''}`}
            />
          </StatStrip>
        )}

        <ScenarioCards table={table!} onExplain={() => setWhyOpen(true)} />
        <WhySheet table={table!} open={whyOpen} onOpenChange={setWhyOpen} />

        <Section
          title="Накопленный денежный поток"
          description="«Как сейчас» — пунктир; чем выше линия сценария, тем меньше он стоит объекту за горизонт"
        >
          <CashflowChart table={table!} />
        </Section>

        <Section
          title="Сводная таблица"
          description="Суммы с НДС. Название сценария ведёт к расчёту и трассе формул"
          bodyClassName="p-0"
        >
          <ComparisonGrid table={table!} />
        </Section>
      </div>
    </Screen>
  )
}

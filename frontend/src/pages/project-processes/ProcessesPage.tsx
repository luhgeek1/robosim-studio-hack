import { ArrowRight } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { useCatalogFacets } from '@/entities/catalog'
import { useProcesses, useProjectId } from '@/entities/project'
import { formatNumber, formatRub } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { PageHeader, Section, Stat, StatStrip } from '@/shared/ui/page'
import { EmptyState, ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { LaborCostChart } from './LaborCostChart'
import { ProcessCard } from './ProcessCard'

export function ProcessesPage() {
  const projectId = useProjectId()
  const processes = useProcesses(projectId)
  const facets = useCatalogFacets()

  const solutionNames = useMemo(
    () => new Map((facets.data?.solution_types ?? []).map((f) => [f.key, f.name])),
    [facets.data],
  )
  const sorted = useMemo(
    () =>
      [...(processes.data?.processes ?? [])].sort(
        (a, b) => (b.current?.cost_rub_year ?? 0) - (a.current?.cost_rub_year ?? 0),
      ),
    [processes.data],
  )

  const data = processes.data
  const robotizable = sorted.filter((p) => p.robotizable).length

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Где деньги"
        description="Спрос, пик и стоимость персонала по процессам. Роботизировать стоит там, где крупный ФОТ и высокий пик."
      />

      {processes.isPending && <LoadingBlock rows={4} />}
      {processes.error && <ErrorBlock error={processes.error} onRetry={() => processes.refetch()} />}

      {data && (
        <>
          <StatStrip columns={4}>
            <Stat
              label="ФОТ по процессам"
              value={formatRub(data.total_labor_cost_rub_year)}
              hint="в год, с начислениями"
            />
            <Stat
              label="Рабочих часов в сутки"
              value={data.working_hours_per_day !== undefined ? `${formatNumber(data.working_hours_per_day)} ч` : '—'}
              hint="по режиму работы объекта"
            />
            <Stat
              label="Пиковый коэффициент"
              value={data.peak_factor !== undefined ? `×${formatNumber(data.peak_factor)}` : '—'}
              hint="пиковый час к среднему"
            />
            <Stat label="Процессов" value={sorted.length} hint={`можно роботизировать: ${robotizable}`} />
          </StatStrip>

          {sorted.length === 0 ? (
            <EmptyState title="Процессов нет" description="Для этого типа объекта процессы не заданы." />
          ) : (
            <>
              <Section title="ФОТ по процессам в год">
                <LaborCostChart processes={sorted} />
              </Section>

              <div className="space-y-4">
                {sorted.map((process) => (
                  <ProcessCard
                    key={process.process_key}
                    process={process}
                    solutionNames={solutionNames}
                    peakFactor={data.peak_factor}
                  />
                ))}
              </div>
            </>
          )}

          <div className="flex justify-end">
            <Button asChild size="lg">
              <Link to="../matching">
                Перейти к подбору решений <ArrowRight />
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

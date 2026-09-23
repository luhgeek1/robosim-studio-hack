import { useMemo, useState } from 'react'
import { useCatalogFacets } from '@/api/catalog'
import { useProcesses, useProject, useProjectParams, useValidation } from '@/api/projects'
import type { ProcessDemandList } from '@/api/types'
import { Findings, Requirements } from '@/components/analysis/Findings'
import { LaborDetails } from '@/components/analysis/LaborDetails'
import { LoadCard } from '@/components/analysis/LoadCard'
import { ProcessStrip } from '@/components/analysis/ProcessStrip'
import { lowerFirst, mainProcess, shortName } from '@/components/analysis/process'
import { Screen } from '@/components/Screen'
import { Empty, ErrorState, Loading } from '@/components/States'
import { Disclosure } from '@/components/ui'
import { formatNumber, formatPct, formatRub, isNum } from '@/lib/format'
import { useProjectId } from '@/lib/story'

function composeLead(data: ProcessDemandList): string {
  const mode = [
    isNum(data.working_hours_per_day) && `объект работает ${formatNumber(data.working_hours_per_day)} ч в сутки`,
    isNum(data.peak_factor) && `в пиковый час нагрузка в ${formatNumber(data.peak_factor)} раза выше средней`,
  ].filter(Boolean)
  const tail = mode.length ? ` ${mode.join(', ').replace(/^о/, 'О')}.` : ''
  return `ФОТ с начислениями — ${formatRub(data.total_labor_cost_rub_year)} в год.${tail}`
}

export function AnalysisScreen() {
  const projectId = useProjectId()
  const project = useProject(projectId).data!
  const processes = useProcesses(projectId)
  const params = useProjectParams(projectId)
  const validation = useValidation(projectId)
  const facets = useCatalogFacets(project.object_type)
  const [picked, setPicked] = useState<string | null>(null)

  const data = processes.data
  const list = useMemo(() => data?.processes ?? [], [data])
  const main = useMemo(() => mainProcess(list), [list])
  const selected = list.find((p) => p.process_key === picked) ?? main
  const solutionNames = useMemo(
    () => new Map((facets.data?.solution_types ?? []).map((f) => [f.key, f.name])),
    [facets.data],
  )

  const share = main?.share_of_labor_cost
  const title =
    main && isNum(share) && share > 0
      ? `Дороже всего обходится ${lowerFirst(shortName(main))} — ${formatPct(share, { share: true, digits: 0 }).replace(' ', '\u00a0')}\u00a0ФОТ`
      : 'Где сейчас уходят деньги'

  return (
    <Screen
      title={title}
      lead={data && composeLead(data)}
      nextLabel="Подобрать роботов"
      nextDisabled={!validation.data?.can_match}
    >
      {processes.isPending && <Loading label="Считаем спрос и затраты по процессам…" />}
      {processes.error && <ErrorState error={processes.error} onRetry={() => processes.refetch()} />}
      {data && list.length === 0 && (
        <Empty title="Процессов нет">Для этого типа объекта процессы не заданы — анализировать нечего.</Empty>
      )}

      {data && main && selected && (
        <>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[7fr_5fr]">
            <LoadCard processes={list} selected={selected} onSelect={setPicked} peakFactor={data.peak_factor} />
            <div className="flex flex-col gap-6">
              <Findings processes={list} main={main} />
              <Requirements main={main} params={params.data?.params ?? []} canMatch={validation.data?.can_match} />
            </div>
          </div>

          <section className="mt-10">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <div className="h3">Как проходит поток сегодня</div>
              <span className="meta">нажмите на процесс, чтобы увидеть его нагрузку по часам</span>
            </div>
            <ProcessStrip
              processes={list}
              selectedKey={selected.process_key}
              mainKey={main.process_key}
              onSelect={(key) => {
                setPicked(key)
                document.getElementById('load-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }}
            />
            <div className="mt-4">
              <Disclosure label="Кто делает эту работу сейчас">
                <LaborDetails processes={list} solutionNames={solutionNames} />
              </Disclosure>
            </div>
          </section>
        </>
      )}
    </Screen>
  )
}

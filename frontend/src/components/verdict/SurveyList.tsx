import { Ruler } from 'lucide-react'
import { useSurvey } from '@/api/scenarios'
import type { SurveyPriorities } from '@/api/types'
import { formatValue } from '@/lib/format'
import { SourcePill } from '../Provenance'
import { ErrorState, Skeleton } from '../States'
import { Disclosure } from '../ui'

const TOP = 3

type Item = SurveyPriorities['items'][number]

// ТЗ 3.7.5: the estimate is preliminary; these are the inputs to measure first on the site survey.
export function SurveyList({ scenarioId }: { scenarioId: string }) {
  const survey = useSurvey(scenarioId)
  const items = [...(survey.data?.items ?? [])].sort((a, b) => a.rank - b.rank)
  if (survey.isPending) return <Skeleton className="h-[180px]" />
  if (survey.isError) return <ErrorState error={survey.error} onRetry={() => survey.refetch()} />
  if (!items.length) {
    return (
      <p className="text-[14px] text-ink-3">Все влияющие на результат параметры подтверждены или введены вручную.</p>
    )
  }
  const rest = items.slice(TOP)
  return (
    <div>
      <ol className="divide-y divide-line">
        {items.slice(0, TOP).map((item) => (
          <SurveyRow key={item.key} item={item} />
        ))}
      </ol>
      {rest.length > 0 && (
        <div className="mt-2">
          <Disclosure label={`Ещё ${rest.length} параметров`}>
            <ol className="divide-y divide-line">
              {rest.map((item) => (
                <SurveyRow key={item.key} item={item} />
              ))}
            </ol>
          </Disclosure>
        </div>
      )}
    </div>
  )
}

function SurveyRow({ item }: { item: Item }) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 py-3">
      <span className="num mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/[0.05] text-[12px] font-semibold">
        {item.rank}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-medium">{item.name}</span>
          <span className="num text-[13px] text-ink-3">сейчас {formatValue(item.current_value, item.unit)}</span>
          <SourcePill status={item.status} />
        </div>
        <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{item.recommendation}</p>
        {item.how_to_measure && (
          <p className="mt-1 flex gap-1.5 text-[12.5px] text-ink-3">
            <Ruler size={13} className="mt-[3px] shrink-0" />
            {item.how_to_measure}
          </p>
        )}
      </div>
    </li>
  )
}

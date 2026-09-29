import { ChevronDown, ClipboardList } from 'lucide-react'
import { useState } from 'react'
import { ProvenanceBadge } from '@/entities/provenance'
import { useSurvey } from '@/entities/scenario'
import { formatRub, formatValue } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Section } from '@/shared/ui/page'
import { EmptyState, ErrorBlock, LoadingBlock } from '@/shared/ui/states'

// The head of the list is what a survey visit can realistically cover; the tail stays one click away.
const SHOWN = 5

export function SurveyPanel({ scenarioId }: { scenarioId: string }) {
  const survey = useSurvey(scenarioId)
  const [all, setAll] = useState(false)
  const items = [...(survey.data?.items ?? [])].sort((a, b) => a.rank - b.rank)
  const maxSwing = Math.max(...items.map((i) => i.swing), 0)
  const shown = all ? items : items.slice(0, SHOWN)

  return (
    <Section
      title="Что замерить на объекте первым"
      description="Самые влиятельные параметры, которые пока взяты по умолчанию или как допущение"
      bodyClassName="p-0"
    >
      {survey.isPending && <LoadingBlock rows={3} className="mx-4 mb-5 sm:mx-5" />}
      {survey.isError && (
        <div className="px-4 pb-5 sm:px-5">
          <ErrorBlock error={survey.error} onRetry={() => survey.refetch()} />
        </div>
      )}
      {survey.data && !items.length && (
        <EmptyState
          icon={<ClipboardList className="size-6" />}
          title="Уточнять нечего"
          description="Все влияющие на результат параметры подтверждены или введены вручную."
        />
      )}
      {items.length > 0 && (
        <>
          <ol className="hairline divide-y divide-line">
            {shown.map((item) => (
              <li
                key={item.key}
                className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-x-3 gap-y-3 px-4 py-4 sm:grid-cols-[1.75rem_minmax(0,1fr)_11rem] sm:gap-4 sm:px-5"
              >
                <span className="num flex size-7 items-center justify-center rounded-full bg-black/5 text-[12.5px] font-semibold">
                  {item.rank}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[14px] font-medium">{item.name}</span>
                    <ProvenanceBadge status={item.status} />
                  </div>
                  <p
                    className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-3"
                    title={item.how_to_measure ? undefined : item.recommendation}
                  >
                    <span className="num text-ink-2">сейчас {formatValue(item.current_value, item.unit)}</span>
                    {' · '}
                    {item.how_to_measure ?? item.recommendation}
                  </p>
                </div>
                <div className="col-start-2 pt-1 sm:col-start-auto">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11.5px] text-ink-3">размах NPV</span>
                    <span className="num text-[13px] font-semibold">{formatRub(item.swing)}</span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/5">
                    <div
                      className="h-full rounded-full bg-ink"
                      style={{ width: `${maxSwing ? (item.swing / maxSwing) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {items.length > SHOWN && (
            <button
              type="button"
              onClick={() => setAll((v) => !v)}
              className="hairline flex w-full items-center justify-center gap-1.5 py-3 text-[13px] font-medium text-ink-3 transition-colors hover:text-ink"
            >
              {all ? 'Свернуть' : `Показать все ${items.length}`}
              <ChevronDown size={14} className={cn('transition-transform', all && 'rotate-180')} />
            </button>
          )}
        </>
      )}
    </Section>
  )
}

import { ClipboardList, Ruler } from 'lucide-react'
import { ProvenanceBadge } from '@/entities/provenance'
import { useSurvey } from '@/entities/scenario'
import { formatRub, formatValue } from '@/shared/lib/format'
import { Section } from '@/shared/ui/page'
import { EmptyState, ErrorBlock, LoadingBlock } from '@/shared/ui/states'

export function SurveyPanel({ scenarioId }: { scenarioId: string }) {
  const survey = useSurvey(scenarioId)
  const items = [...(survey.data?.items ?? [])].sort((a, b) => a.rank - b.rank)
  const maxSwing = Math.max(...items.map((i) => i.swing), 0)

  return (
    <Section
      title="Что уточнить при обследовании объекта"
      description="Параметры, которые сильнее всего меняют результат и при этом пока взяты по умолчанию или как допущение. Их стоит замерить в первую очередь — это самый короткий путь к надёжной оценке и пилоту."
    >
      {survey.isPending && <LoadingBlock rows={3} />}
      {survey.isError && <ErrorBlock error={survey.error} onRetry={() => survey.refetch()} />}
      {survey.data && !items.length && (
        <EmptyState
          icon={<ClipboardList className="size-6" />}
          title="Уточнять нечего"
          description="Все влияющие на результат параметры подтверждены или введены вручную."
        />
      )}
      {items.length > 0 && (
        <ol className="divide-y">
          {items.map((item) => (
            <li key={item.key} className="grid grid-cols-[2rem_minmax(0,1fr)_14rem] gap-4 py-3">
              <div className="num flex size-7 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                {item.rank}
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{item.name}</span>
                  <ProvenanceBadge status={item.status} />
                  <span className="num text-muted-foreground">
                    сейчас: {formatValue(item.current_value, item.unit)}
                  </span>
                </div>
                <p>{item.recommendation}</p>
                {item.how_to_measure && (
                  <p className="flex gap-1.5 text-muted-foreground">
                    <Ruler className="mt-0.5 size-3.5 shrink-0" />
                    <span>Как замерить: {item.how_to_measure}</span>
                  </p>
                )}
              </div>
              <div className="space-y-1 pt-1">
                <div className="text-xs text-muted-foreground">Влияние на NPV (размах)</div>
                <div className="num text-sm font-semibold">{formatRub(item.swing)}</div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-info"
                    style={{ width: `${maxSwing ? (item.swing / maxSwing) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Section>
  )
}

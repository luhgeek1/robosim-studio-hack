import { ArrowRight, Scale, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { useProjectId } from '@/entities/project'
import { useComparison } from '@/entities/scenario'
import { parseApiProblem } from '@/shared/api/problem'
import { Button } from '@/shared/ui/button'
import { PageHeader, Section } from '@/shared/ui/page'
import { EmptyState, ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { CashflowChart } from './CashflowChart'
import { ComparisonGrid } from './ComparisonGrid'
import { VerdictPanel } from './VerdictPanel'

const MIN_ROBOTIZED = 2

export function ComparisonPage() {
  const projectId = useProjectId()
  const comparison = useComparison(projectId)
  const table = comparison.data

  const header = (
    <PageHeader
      eyebrow="Сравнение сценариев"
      title="Как сейчас против роботизации"
      description="Все рассчитанные сценарии в одной таблице: затраты, эффект, окупаемость, NPV и TCO за горизонт. Лучшее значение в строке отмечено зелёным."
      actions={
        <Button asChild variant="outline">
          <Link to="../risks">
            Риски и обследование <ArrowRight />
          </Link>
        </Button>
      }
    />
  )

  if (comparison.isPending) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        {header}
        <LoadingBlock rows={4} />
      </div>
    )
  }

  if (comparison.isError) {
    const noScenarios = parseApiProblem(comparison.error).status === 409
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        {header}
        {noScenarios ? (
          <EmptyState
            icon={<Scale className="size-6" />}
            title="Нет рассчитанных сценариев роботизации"
            description="Для сравнения нужен рассчитанный сценарий «как сейчас» и хотя бы один сценарий роботизации. Создайте сценарии из рекомендации подбора и запустите расчёт."
            action={
              <Button asChild>
                <Link to="../scenarios">
                  К сценариям <ArrowRight />
                </Link>
              </Button>
            }
          />
        ) : (
          <ErrorBlock error={comparison.error} onRetry={() => comparison.refetch()} />
        )}
      </div>
    )
  }

  const robotized = table!.scenarios.filter((s) => s.kind !== 'baseline').length
  const stale = table!.scenarios.filter((s) => s.status === 'stale').length

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {header}

      {(robotized < MIN_ROBOTIZED || stale > 0) && (
        <div className="flex items-start gap-3 rounded-xl border border-warn/25 bg-warn-soft p-4 text-warn">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1 space-y-1">
            {robotized < MIN_ROBOTIZED && (
              <div>
                Рассчитано сценариев роботизации: {robotized}. Для полноценного сравнения нужно не меньше{' '}
                {MIN_ROBOTIZED} (например, покупка и RaaS).
              </div>
            )}
            {stale > 0 && (
              <div>Часть сценариев рассчитана по устаревшим данным объекта — пересчитайте их перед выводами.</div>
            )}
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="../scenarios">К сценариям</Link>
          </Button>
        </div>
      )}

      <VerdictPanel table={table!} />

      <Section
        title="Сводная таблица"
        description="Суммы с НДС. Нажмите на название сценария, чтобы открыть расчёт и трассу формул."
      >
        <ComparisonGrid table={table!} />
      </Section>

      <Section
        title="Накопленный денежный поток"
        description="Кумулятивный поток каждого сценария по периодам расчёта. «Как сейчас» — пунктир; чем выше линия сценария, тем меньше он стоит объекту за горизонт."
      >
        <CashflowChart table={table!} />
      </Section>
    </div>
  )
}

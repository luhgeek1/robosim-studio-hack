import { CheckCircle2, CircleAlert, Info, TriangleAlert } from 'lucide-react'
import { useValidation } from '@/entities/project'
import type { ValidationIssue } from '@/shared/api/types'
import { cn } from '@/shared/lib/utils'
import { Section } from '@/shared/ui/page'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { ToneBadge } from '@/shared/ui/tone'
import { scrollToParam } from './scroll'

const BLOCK_LABEL: Record<NonNullable<ValidationIssue['blocks']>[number], string> = {
  matching: 'подбор',
  calculation: 'расчёт',
  simulation: 'имитацию',
  report: 'отчёт',
}

const SEVERITY_RANK: Record<ValidationIssue['severity'], number> = { error: 0, warning: 1, info: 2 }

export function ValidationPanel({ projectId }: { projectId: string }) {
  const validation = useValidation(projectId)

  if (validation.isPending) return <LoadingBlock rows={2} />
  if (validation.error) return <ErrorBlock error={validation.error} onRetry={() => validation.refetch()} />

  const report = validation.data
  const issues = [...report.issues].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
  const gates = [
    { ok: report.can_match, yes: 'Подбор доступен', no: 'Подбор заблокирован' },
    { ok: report.can_calculate, yes: 'Расчёт доступен', no: 'Расчёт заблокирован' },
    { ok: report.can_simulate, yes: 'Имитация доступна', no: 'Имитация заблокирована' },
  ]

  return (
    <Section title="Проверка данных">
      <div className="mb-4 flex flex-wrap gap-2">
        {gates.map((gate) => (
          <ToneBadge key={gate.yes} tone={gate.ok ? 'ok' : 'crit'}>
            {gate.ok ? <CheckCircle2 /> : <CircleAlert />}
            {gate.ok ? gate.yes : gate.no}
          </ToneBadge>
        ))}
      </div>

      {issues.length === 0 ? (
        <div className="flex items-center gap-2 text-ok">
          <CheckCircle2 className="size-4" /> Замечаний нет — все обязательные параметры заданы и в допустимых
          диапазонах.
        </div>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {issues.map((issue, index) => {
            const Icon = issue.severity === 'error' ? CircleAlert : issue.severity === 'warning' ? TriangleAlert : Info
            return (
              <li key={`${issue.key}-${issue.code}-${index}`}>
                <button
                  type="button"
                  onClick={() => scrollToParam(issue.key)}
                  className="flex w-full gap-2 rounded-md p-1.5 text-left hover:bg-raised"
                >
                  <Icon
                    className={cn(
                      'mt-0.5 size-4 shrink-0',
                      issue.severity === 'error'
                        ? 'text-crit'
                        : issue.severity === 'warning'
                          ? 'text-warn'
                          : 'text-info',
                    )}
                  />
                  <span className="min-w-0 space-y-0.5">
                    {issue.name && <span className="block font-medium">{issue.name}</span>}
                    <span className="block">{issue.message}</span>
                    {issue.how_to_fix && (
                      <span className="block text-xs text-muted-foreground">Как исправить: {issue.how_to_fix}</span>
                    )}
                    {issue.blocks && issue.blocks.length > 0 && (
                      <span className="block text-xs text-crit">
                        блокирует: {issue.blocks.map((b) => BLOCK_LABEL[b]).join(', ')}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

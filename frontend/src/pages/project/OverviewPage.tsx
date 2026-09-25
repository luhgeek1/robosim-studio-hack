import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { DataQualityBar, useAudit, useProject, useProjectId } from '@/entities/project'
import { VerdictBadge } from '@/entities/scenario'
import type { AuditEvent } from '@/shared/api/types'
import { formatDateTime, formatRub, formatYears } from '@/shared/lib/format'
import { PageHeader, Section, Stat, StatStrip } from '@/shared/ui/page'
import { LoadingBlock } from '@/shared/ui/states'

const AUDIT_ACTION_LABEL: Record<AuditEvent['action'], string> = {
  create: 'создание',
  update: 'изменение',
  delete: 'удаление',
  import: 'импорт',
  calculate: 'расчёт',
  simulate: 'имитация',
  export: 'выгрузка',
  override: 'переопределение',
}

export function OverviewPage() {
  const projectId = useProjectId()
  const project = useProject(projectId).data!
  const audit = useAudit(projectId)
  const metrics = project.headline_metrics

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title={project.name} />

      {metrics ? (
        <StatStrip columns={3}>
          <Stat
            label="Окупаемость рекомендованного сценария"
            value={formatYears(metrics.payback_years)}
            hint={<VerdictBadge verdict={metrics.verdict} />}
          />
          <Stat label="CAPEX" value={formatRub(metrics.capex_rub)} hint="с НДС" />
          <Stat label="Чистый эффект" value={formatRub(metrics.effect_rub_year)} hint="в год" />
        </StatStrip>
      ) : (
        <p className="text-muted-foreground">
          Расчёта ещё нет. Пройдите шаги ниже — сценарий из рекомендации подбора считается за секунду.
        </p>
      )}

      <div className="grid grid-cols-2 items-start gap-6">
        <Section title="Откуда взяты параметры">
          <DataQualityBar summary={project.data_quality} />
          <Link to="object" className="mt-3 inline-flex items-center gap-1 text-primary hover:underline">
            Уточнить параметры <ArrowRight className="size-3.5" />
          </Link>
        </Section>

        <Section title="Журнал изменений" bodyClassName="p-0">
          {audit.isPending && <LoadingBlock rows={2} className="p-4" />}
          {audit.data && (
            <ul className="max-h-72 divide-y overflow-y-auto text-xs">
              {audit.data.items.slice(0, 20).map((event) => (
                <li key={event.id} className="flex gap-3 px-5 py-2">
                  <span className="num w-28 shrink-0 text-muted-foreground">{formatDateTime(event.at)}</span>
                  <span className="min-w-0">
                    <span className="font-medium">{AUDIT_ACTION_LABEL[event.action] ?? event.action}</span>{' '}
                    <span className="text-muted-foreground">{event.entity.split(':')[0]}</span>
                    {event.note && <span className="text-muted-foreground"> — {event.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  )
}

import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { DataQualityBar, useAudit, useProject, useProjectId } from '@/entities/project'
import { VERDICT_LABEL, VERDICT_TONE, type Verdict } from '@/entities/scenario'
import type { AuditEvent } from '@/shared/api/types'
import { formatDateTime, formatRub, formatYears } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
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

// The overview keeps the site's ink and warm palette: a «reasonable» verdict is ink, not the accent blue.
const VERDICT_DOT: Record<(typeof VERDICT_TONE)[Verdict], string> = {
  ok: 'bg-ok',
  info: 'bg-ink',
  warn: 'bg-warn',
  crit: 'bg-crit',
  muted: 'bg-ink-4',
}

export function OverviewPage() {
  const projectId = useProjectId()
  const project = useProject(projectId).data!
  const audit = useAudit(projectId)
  const metrics = project.headline_metrics
  const verdict = metrics?.verdict && metrics.verdict in VERDICT_LABEL ? (metrics.verdict as Verdict) : null

  return (
    // The panel sits in the middle of the space under the header, however tall the window is.
    <div className="flex flex-1 items-center justify-center pt-4 pb-10">
      <div className="card w-full max-w-6xl p-8 shadow-card">
        <h1 className="h1">{project.name}</h1>

        {metrics ? (
          <div className="mt-7 grid grid-cols-3 divide-x divide-line rounded-xl bg-surface-2 ring-1 ring-line">
            <Figure label="Окупаемость рекомендованного сценария" value={formatYears(metrics.payback_years)}>
              {verdict && (
                <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2">
                  <span className={cn('size-1.5 rounded-full', VERDICT_DOT[VERDICT_TONE[verdict]])} />
                  {VERDICT_LABEL[verdict]}
                </span>
              )}
            </Figure>
            <Figure label="CAPEX" value={formatRub(metrics.capex_rub)}>
              <span className="meta">с НДС</span>
            </Figure>
            <Figure label="Чистый эффект" value={formatRub(metrics.effect_rub_year)}>
              <span className="meta">в год</span>
            </Figure>
          </div>
        ) : (
          <p className="mt-5 text-[14px] text-ink-3">
            Расчёта ещё нет. Пройдите шаги в панели сверху — сценарий из рекомендации подбора считается за секунду.
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 items-start gap-6">
          <Panel title="Откуда взяты параметры">
            <DataQualityBar summary={project.data_quality} />
            <Link
              to="object"
              className="group mt-4 inline-flex items-center gap-1 text-[13.5px] font-medium text-ink transition-colors hover:text-ink-2"
            >
              Уточнить параметры <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Panel>

          <Panel title="Журнал изменений">
            {audit.isPending && <LoadingBlock rows={2} />}
            {audit.data && (
              <ul className="-mx-2 max-h-72 divide-y divide-line overflow-y-auto text-[12.5px]">
                {audit.data.items.slice(0, 20).map((event) => (
                  <li key={event.id} className="flex gap-3 px-2 py-2 first:pt-0">
                    <span className="num w-32 shrink-0 text-ink-3">{formatDateTime(event.at)}</span>
                    <span className="min-w-0">
                      <span className="font-medium">{AUDIT_ACTION_LABEL[event.action] ?? event.action}</span>{' '}
                      <span className="text-ink-3">{event.entity.split(':')[0]}</span>
                      {event.note && <span className="text-ink-3"> — {event.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}

function Figure({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div className="min-w-0 px-6 py-5">
      <div className="truncate text-[13px] text-ink-3">{label}</div>
      <div className="display num mt-2 text-[28px]">{value}</div>
      <div className="mt-2">{children}</div>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-surface-2 px-5 py-5 ring-1 ring-line">
      <h2 className="h3 mb-4">{title}</h2>
      {children}
    </section>
  )
}

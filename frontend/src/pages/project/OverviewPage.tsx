import { ArrowRight, CheckCircle2, CircleDashed, Download, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import {
  DataQualityBar,
  PROJECT_STATUS_LABEL,
  useAudit,
  useProject,
  useProjectId,
  useValidation,
} from '@/entities/project'
import { VerdictBadge, useScenarios } from '@/entities/scenario'
import type { AuditEvent } from '@/shared/api/types'
import { downloadFile } from '@/shared/lib/download'
import { formatDateTime, formatRub, formatYears } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { PageHeader, Section, Stat } from '@/shared/ui/page'
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
  const validation = useValidation(projectId)
  const scenarios = useScenarios(projectId)
  const audit = useAudit(projectId)
  const metrics = project.headline_metrics
  const robotized = scenarios.data?.filter((s) => !s.is_baseline) ?? []
  const calculated = robotized.filter((s) => s.last_calculation)
  const issues = validation.data?.issues ?? []
  const errors = issues.filter((i) => i.severity === 'error').length
  const warnings = issues.filter((i) => i.severity === 'warning').length

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Обзор проекта"
        title={project.name}
        description="Путь оценки: параметры объекта → где деньги → подбор → планировка → сценарии и расчёт → сравнение и риски."
        actions={
          <Button
            variant="outline"
            onClick={() => downloadFile(`/projects/${projectId}/export.json`, `project-${projectId}.json`)}
          >
            <Download /> Выгрузить JSON
          </Button>
        }
      />

      <div className="grid grid-cols-4 gap-3">
        <Stat label="Статус" value={PROJECT_STATUS_LABEL[project.status]} hint={`версия данных ${project.version}`} />
        <Stat
          label="Окупаемость рекомендованного сценария"
          value={metrics ? formatYears(metrics.payback_years) : '—'}
          hint={metrics ? <VerdictBadge verdict={metrics.verdict} /> : 'нет расчёта'}
        />
        <Stat label="CAPEX" value={formatRub(metrics?.capex_rub)} hint="с НДС" />
        <Stat label="Чистый эффект" value={formatRub(metrics?.effect_rub_year)} hint="в год" />
      </div>

      <div className="grid grid-cols-[1.3fr_1fr] gap-6">
        <Section title="Шаги оценки">
          <ol className="divide-y">
            <StepRow
              to="object"
              title="Параметры объекта"
              state={validation.isPending ? 'pending' : errors ? 'error' : warnings ? 'warn' : 'done'}
              detail={
                validation.data
                  ? errors || warnings
                    ? `Ошибок: ${errors}, предупреждений: ${warnings}`
                    : 'Все обязательные параметры заданы'
                  : 'Проверяем…'
              }
            />
            <StepRow to="processes" title="Где деньги" state="done" detail="Спрос, пик и ФОТ по процессам" />
            <StepRow
              to="matching"
              title="Подбор решений"
              state={validation.data?.can_match === false ? 'error' : 'done'}
              detail="Подходит / требует проверки / не подходит — с причинами"
            />
            <StepRow to="layout" title="Планировка" state="done" detail="Маршруты из геометрии идут в цикл робота" />
            <StepRow
              to="scenarios"
              title="Сценарии и расчёт"
              state={calculated.length ? 'done' : robotized.length ? 'warn' : 'todo'}
              detail={
                robotized.length
                  ? `Сценариев роботизации: ${robotized.length}, рассчитано: ${calculated.length}`
                  : 'Создайте сценарий из рекомендации подбора'
              }
            />
            <StepRow
              to="comparison"
              title="Сравнение и вердикт"
              state={calculated.length ? 'done' : 'todo'}
              detail="Как сейчас / покупка / RaaS / лизинг"
            />
            <StepRow
              to="risks"
              title="Риски и обследование"
              state={calculated.length ? 'done' : 'todo'}
              detail="Торнадо, Монте-Карло, что замерить"
            />
          </ol>
        </Section>

        <div className="space-y-6">
          <Section title="Качество данных" description="Откуда взяты параметры объекта">
            <DataQualityBar summary={project.data_quality} />
            <Button asChild variant="link" className="mt-2 px-0">
              <Link to="object">
                Уточнить параметры <ArrowRight />
              </Link>
            </Button>
          </Section>

          <Section title="Журнал изменений">
            {audit.isPending && <LoadingBlock rows={2} />}
            {audit.data && (
              <ul className="max-h-72 space-y-2 overflow-y-auto text-xs">
                {audit.data.items.slice(0, 20).map((event) => (
                  <li key={event.id} className="flex gap-2">
                    <span className="num w-28 shrink-0 text-muted-foreground">{formatDateTime(event.at)}</span>
                    <span className="min-w-0">
                      <span className="font-medium">{AUDIT_ACTION_LABEL[event.action] ?? event.action}</span> ·{' '}
                      {event.entity}
                      {event.note && <span className="text-muted-foreground"> — {event.note}</span>}
                      <div className="text-muted-foreground">{event.actor}</div>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

type StepState = 'done' | 'warn' | 'error' | 'todo' | 'pending'

const STATE_ICON: Record<StepState, ReactNode> = {
  done: <CheckCircle2 className="size-4 text-ok" />,
  warn: <TriangleAlert className="size-4 text-warn" />,
  error: <TriangleAlert className="size-4 text-crit" />,
  todo: <CircleDashed className="size-4 text-muted-foreground" />,
  pending: <CircleDashed className="size-4 animate-pulse text-muted-foreground" />,
}

function StepRow({ to, title, detail, state }: { to: string; title: string; detail: string; state: StepState }) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 py-2.5 hover:text-primary">
        {STATE_ICON[state]}
        <span className="flex-1">
          <span className="font-medium">{title}</span>
          <span className="block text-xs text-muted-foreground">{detail}</span>
        </span>
        <ArrowRight className="size-4 text-muted-foreground" />
      </Link>
    </li>
  )
}

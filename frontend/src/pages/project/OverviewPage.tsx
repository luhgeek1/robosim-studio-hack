import { ArrowRight, CheckCircle2, CircleDashed, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { DataQualityBar, useAudit, useProject, useProjectId, useValidation } from '@/entities/project'
import { VerdictBadge, useScenarios } from '@/entities/scenario'
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

      <div className="grid grid-cols-[1.3fr_1fr] gap-6">
        <Section title="Шаги оценки" bodyClassName="p-0">
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
              detail="Подходит, требует проверки, не подходит — с причинами"
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
              detail="Как сейчас, покупка, RaaS, лизинг"
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
      <Link to={to} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-raised">
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

import { NavLink, Outlet } from 'react-router'
import { DataQualityBar, OBJECT_TYPE_LABEL, useProject, useProjectId, useValidation } from '@/entities/project'
import { useScenarios } from '@/entities/scenario'
import { cn } from '@/shared/lib/utils'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'

type StepState = 'done' | 'warn' | 'todo' | 'soon'
type Step = { to: string; label: string; state: StepState; end?: boolean }

const DOT: Record<StepState, string> = {
  done: 'bg-ok',
  warn: 'bg-warn',
  todo: 'border border-input bg-sidebar',
  soon: 'border border-dashed border-input bg-transparent',
}

/* Состояние шагов считается из тех же данных, что и обзор: рейл — это прогресс оценки, а не просто меню. */
function useSteps(projectId: string): Step[] {
  const validation = useValidation(projectId)
  const scenarios = useScenarios(projectId)
  const issues = validation.data?.issues ?? []
  const errors = issues.some((i) => i.severity === 'error')
  const warnings = issues.some((i) => i.severity === 'warning')
  const robotized = scenarios.data?.filter((s) => !s.is_baseline) ?? []
  const calculated = robotized.some((s) => s.last_calculation)
  const afterCalc: StepState = calculated ? 'done' : 'todo'
  return [
    { to: 'object', label: 'Объект', state: errors ? 'warn' : warnings ? 'warn' : 'done' },
    { to: 'processes', label: 'Где деньги', state: 'done' },
    { to: 'matching', label: 'Подбор решений', state: validation.data?.can_match === false ? 'warn' : 'done' },
    { to: 'layout', label: 'Планировка', state: 'done' },
    { to: 'scenarios', label: 'Сценарии и расчёт', state: calculated ? 'done' : robotized.length ? 'warn' : 'todo' },
    { to: 'comparison', label: 'Сравнение', state: afterCalc },
    { to: 'risks', label: 'Риски', state: afterCalc },
    { to: 'simulation', label: 'Имитация', state: 'soon' },
    { to: 'report', label: 'Отчёт', state: 'soon' },
  ]
}

export function ProjectLayout() {
  const projectId = useProjectId()
  const project = useProject(projectId)
  const steps = useSteps(projectId)

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="sticky top-12 flex h-[calc(100vh-3rem)] w-56 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar">
        <div className="space-y-2 border-b border-sidebar-border px-4 py-4">
          {project.data ? (
            <>
              <div className="text-xs text-muted-foreground">{OBJECT_TYPE_LABEL[project.data.object_type]}</div>
              <div className="line-clamp-3 leading-snug font-medium">{project.data.name}</div>
              <DataQualityBar summary={project.data.data_quality} compact />
            </>
          ) : (
            <div className="h-16" />
          )}
        </div>
        <nav className="px-2 py-3" aria-label="Шаги оценки">
          <NavLink
            to=""
            end
            className={({ isActive }) =>
              cn(
                'mb-2 flex items-center rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:text-foreground',
                isActive && 'bg-sidebar-accent font-medium text-foreground',
              )
            }
          >
            Обзор
          </NavLink>
          <ol className="relative ml-3.75 border-l border-sidebar-border">
            {steps.map((step, index) => (
              <li key={step.to} className="relative">
                <NavLink
                  to={step.to}
                  className={({ isActive }) =>
                    cn(
                      '-ml-px flex items-center gap-3 rounded-r-md py-1.5 pr-2 pl-4 text-muted-foreground transition-colors hover:text-foreground',
                      isActive && 'bg-sidebar-accent font-medium text-foreground',
                      step.state === 'soon' && 'text-muted-foreground/60 hover:text-muted-foreground',
                    )
                  }
                >
                  <span
                    className={cn('absolute -left-1.25 size-2.25 rounded-full ring-4 ring-sidebar', DOT[step.state])}
                    aria-hidden
                  />
                  <span className="num w-3 text-right text-xs text-muted-foreground/60">{index + 1}</span>
                  <span className="flex-1">{step.label}</span>
                  {step.state === 'soon' && (
                    <span className="rounded border border-input px-1 text-[10px] text-muted-foreground/70">скоро</span>
                  )}
                </NavLink>
              </li>
            ))}
          </ol>
        </nav>
      </aside>
      <div className="min-w-0 flex-1 px-8 py-6">
        {project.isPending && <LoadingBlock rows={4} />}
        {project.isError && <ErrorBlock error={project.error} onRetry={() => project.refetch()} />}
        {project.data && <Outlet />}
      </div>
    </div>
  )
}

import {
  Banknote,
  BarChart3,
  ClipboardList,
  FileText,
  GitCompareArrows,
  LayoutDashboard,
  Map,
  PlayCircle,
  ShieldAlert,
  SlidersHorizontal,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { DataQualityBar, OBJECT_TYPE_LABEL, useProject, useProjectId } from '@/entities/project'
import { cn } from '@/shared/lib/utils'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'

type Step = { to: string; label: string; icon: LucideIcon; soon?: boolean; end?: boolean }

const STEPS: Step[] = [
  { to: '', label: 'Обзор', icon: LayoutDashboard, end: true },
  { to: 'object', label: 'Объект', icon: Warehouse },
  { to: 'processes', label: 'Где деньги', icon: Banknote },
  { to: 'matching', label: 'Подбор решений', icon: ClipboardList },
  { to: 'layout', label: 'Планировка', icon: Map },
  { to: 'scenarios', label: 'Сценарии и расчёт', icon: SlidersHorizontal },
  { to: 'comparison', label: 'Сравнение', icon: GitCompareArrows },
  { to: 'risks', label: 'Риски', icon: ShieldAlert },
  { to: 'simulation', label: 'Имитация', icon: PlayCircle, soon: true },
  { to: 'report', label: 'Отчёт', icon: FileText, soon: true },
]

export function ProjectLayout() {
  const projectId = useProjectId()
  const project = useProject(projectId)

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="sticky top-14 flex h-[calc(100vh-3.5rem)] w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r bg-sidebar px-3 py-4">
        <div className="space-y-2 px-2">
          {project.data ? (
            <>
              <div className="text-xs text-muted-foreground">{OBJECT_TYPE_LABEL[project.data.object_type]}</div>
              <div className="line-clamp-3 leading-snug font-medium">{project.data.name}</div>
              <DataQualityBar summary={project.data.data_quality} compact />
              <div className="text-xs text-muted-foreground">версия данных {project.data.version}</div>
            </>
          ) : (
            <div className="h-16" />
          )}
        </div>
        <nav className="flex flex-col gap-0.5" aria-label="Шаги оценки">
          {STEPS.map((step, index) => (
            <NavLink
              key={step.to}
              to={step.to}
              end={step.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground',
                  isActive && 'bg-sidebar-accent font-medium text-foreground',
                  step.soon && 'opacity-60',
                )
              }
            >
              <span className="num w-4 text-right text-xs text-muted-foreground/70">{index === 0 ? '' : index}</span>
              <step.icon className="size-4" />
              <span className="flex-1">{step.label}</span>
              {step.soon && <span className="rounded bg-muted px-1.5 text-[10px] uppercase">скоро</span>}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-2 text-xs text-muted-foreground">
          <BarChart3 className="mb-1 size-4" />
          Каждое число раскрывается до формулы и источника — нажмите на строку расчёта.
        </div>
      </aside>
      <div className="min-w-0 flex-1 p-6">
        {project.isPending && <LoadingBlock rows={4} />}
        {project.isError && <ErrorBlock error={project.error} onRetry={() => project.refetch()} />}
        {project.data && <Outlet />}
      </div>
    </div>
  )
}

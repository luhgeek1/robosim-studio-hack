import { Copy, FolderPlus, MoreHorizontal, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import {
  DataQualityBar,
  OBJECT_TYPE_LABEL,
  PROJECT_STATUS_LABEL,
  useCopyProject,
  useDeleteProject,
  useProjects,
} from '@/entities/project'
import { VerdictBadge } from '@/entities/scenario'
import { CreateProjectDialog } from '@/features/project-create'
import type { Project } from '@/shared/api/types'
import { formatDateTime, formatRub, formatYears } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { PageHeader } from '@/shared/ui/page'
import { EmptyState, ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { ToneBadge } from '@/shared/ui/tone'

export function ProjectsPage() {
  const projects = useProjects()
  const newProject = (
    <Button>
      <FolderPlus /> Новый проект
    </Button>
  )

  return (
    <div className="mx-auto w-full max-w-6xl p-6">
      <PageHeader title="Проекты" actions={<CreateProjectDialog trigger={newProject} />} />
      {projects.isPending && <LoadingBlock rows={4} />}
      {projects.isError && <ErrorBlock error={projects.error} onRetry={() => projects.refetch()} />}
      {projects.data && projects.data.items.length === 0 && (
        <EmptyState
          title="Пока нет проектов"
          description="Начните с демо-склада организатора: параметры уже заполнены, подбор и расчёт займут минуту."
          action={<CreateProjectDialog trigger={newProject} />}
        />
      )}
      {projects.data && projects.data.items.length > 0 && (
        <div className="divide-y overflow-hidden rounded-lg border bg-surface">
          {projects.data.items.map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectRow({ project }: { project: Project }) {
  const navigate = useNavigate()
  const copy = useCopyProject()
  const remove = useDeleteProject()
  const metrics = project.headline_metrics

  return (
    <div className="group relative grid grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.6fr)_auto] items-center gap-6 px-5 py-4 transition-colors hover:bg-raised">
      <div className="min-w-0 space-y-1">
        <Link
          to={`/projects/${project.id}`}
          className="block truncate text-base font-medium after:absolute after:inset-0"
        >
          {project.name}
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{OBJECT_TYPE_LABEL[project.object_type]}</span>
          <span>обновлён {formatDateTime(project.updated_at)}</span>
          {project.is_demo && <ToneBadge tone="info">демо-данные</ToneBadge>}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Данные объекта</span>
          <span>{PROJECT_STATUS_LABEL[project.status]}</span>
        </div>
        <DataQualityBar summary={project.data_quality} compact />
      </div>

      <div className="text-xs">
        {metrics ? (
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Окупаемость" value={formatYears(metrics.payback_years)} />
            <Metric label="CAPEX" value={formatRub(metrics.capex_rub)} />
            <div className="space-y-1">
              <div className="text-muted-foreground">Вердикт</div>
              <VerdictBadge verdict={metrics.verdict} />
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground">
            {project.scenarios_count > 0
              ? `Сценариев: ${project.scenarios_count}, расчёта нет`
              : 'Сценарии ещё не рассчитаны'}
          </span>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="relative z-10" aria-label="Действия с проектом">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={async () => {
              const created = await copy.mutateAsync({ id: project.id, name: `${project.name} (копия)` })
              navigate(`/projects/${created.id}`)
            }}
          >
            <Copy /> Копировать со сценариями
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <ConfirmDialog
            title={`Удалить «${project.name}»?`}
            description="Проект, его сценарии и расчёты будут удалены без возможности восстановления."
            onConfirm={() => remove.mutateAsync(project.id)}
            trigger={
              <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                <Trash2 /> Удалить
              </DropdownMenuItem>
            }
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground">{label}</div>
      <div className="num font-medium">{value}</div>
    </div>
  )
}

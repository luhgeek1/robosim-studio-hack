import { Copy, HeartPulse, MoreHorizontal, Plane, Plus, Trash2, Warehouse } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  OBJECT_TYPE_LABEL,
  PROJECT_STATUS_LABEL,
  useCopyProject,
  useDeleteProject,
  useProjects,
} from '@/entities/project'
import { VerdictBadge } from '@/entities/scenario'
import { CreateProjectDialog } from '@/features/project-create'
import type { Project } from '@/shared/api/types'
import { formatDateTime, formatPct, formatRub, formatYears } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { ConfidenceRing, Pill } from '@/shared/ui/v0'

const ICONS: Record<string, ReactNode> = {
  warehouse: <Warehouse size={18} />,
  airport: <Plane size={18} />,
  hospital: <HeartPulse size={18} />,
}

export function ProjectsPage() {
  const projects = useProjects()
  const newProject = (
    <Button size="sm">
      <Plus /> Новый проект
    </Button>
  )

  return (
    <div className="mx-auto w-full max-w-275 px-6 pt-12 pb-16">
      <div className="mb-8 max-w-180">
        <h1 className="display text-[44px] leading-[1.05] tracking-[-0.035em]">Стоит ли роботизировать ваш объект?</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-2">
          Проект — один объект: параметры, подбор роботов, сценарии, экономика и имитация. Копия проекта сохраняет
          сценарии.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="h3">Проекты</div>
            <CreateProjectDialog trigger={newProject} />
          </div>
          {projects.isPending && <LoadingBlock label="Загружаем проекты…" />}
          {projects.isError && <ErrorBlock error={projects.error} onRetry={() => projects.refetch()} />}
          {projects.data && projects.data.items.length === 0 && (
            <div className="rounded-[12px] border border-dashed border-line px-5 py-10 text-center text-[14px] text-ink-3">
              Проектов пока нет. Создайте первый — демо-склад организатора считается за минуту.
            </div>
          )}
          {projects.data && projects.data.items.length > 0 && (
            <ul className="card divide-y divide-line overflow-hidden">
              {projects.data.items.map((project) => (
                <ProjectRow key={project.id} project={project} />
              ))}
            </ul>
          )}
        </section>

        <aside className="rounded-[12px] bg-surface-2 p-5 text-[13.5px] leading-relaxed text-ink-2">
          <div className="h3 mb-2 text-ink">Как это работает</div>
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>Создайте проект и выберите тип объекта — или возьмите демо-склад организатора.</li>
            <li>Проверьте параметры: подтверждённые взяты из файла, допущения помечены.</li>
            <li>Посмотрите, где деньги, и подберите роботов под ограничения объекта.</li>
            <li>Соберите сценарии, сравните покупку и аренду, проверьте флот имитацией.</li>
          </ol>
        </aside>
      </div>
    </div>
  )
}

function ProjectRow({ project }: { project: Project }) {
  const navigate = useNavigate()
  const copy = useCopyProject()
  const remove = useDeleteProject()
  const metrics = project.headline_metrics
  const score = project.data_quality.score

  return (
    <li className="group relative flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-black/5 text-ink-2">
        {ICONS[project.object_type] ?? <Warehouse size={18} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <Link
            to={`/projects/${project.id}`}
            className="truncate text-[15px] font-semibold after:absolute after:inset-0"
          >
            {project.name}
          </Link>
          {project.is_demo && <Pill>демо-данные</Pill>}
          <Pill tone={project.status === 'calculated' ? 'ok' : 'neutral'}>{PROJECT_STATUS_LABEL[project.status]}</Pill>
        </span>
        <span className="block truncate text-[13px] text-ink-3">
          {OBJECT_TYPE_LABEL[project.object_type]} · обновлён {formatDateTime(project.updated_at)}
        </span>
      </span>
      {metrics ? (
        <span className="hidden items-center gap-5 text-[13px] md:flex">
          <span>
            <span className="num font-medium">{formatYears(metrics.payback_years)}</span>{' '}
            <span className="text-ink-3">окупаемость</span>
          </span>
          <span>
            <span className="num font-medium">{formatRub(metrics.capex_rub)}</span>{' '}
            <span className="text-ink-3">CAPEX</span>
          </span>
          <VerdictBadge verdict={metrics.verdict} />
        </span>
      ) : (
        <span className="hidden text-[13px] text-ink-3 md:inline">
          {project.scenarios_count > 0 ? `Сценариев: ${project.scenarios_count}, расчёта нет` : 'Расчёта ещё нет'}
        </span>
      )}
      <span className="flex items-center gap-2 text-[13px] text-ink-2">
        <ConfidenceRing value={score * 100} size={20} />
        <span className="num">{formatPct(score, { share: true, digits: 0 })}</span>
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="relative z-10 text-ink-4" aria-label="Действия с проектом">
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
    </li>
  )
}

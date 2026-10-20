import {
  ArrowRight,
  ArrowRightLeft,
  Copy,
  HeartPulse,
  MoreHorizontal,
  Plane,
  Plus,
  Trash2,
  Users,
  Warehouse,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { quoted, useWorkspace } from '@/entities/organization'
import {
  OBJECT_TYPE_LABEL,
  PROJECT_STATUS_LABEL,
  useCopyProject,
  useDeleteProject,
  useMoveProject,
  useProjects,
} from '@/entities/project'
import { VerdictBadge } from '@/entities/scenario'
import { useSession } from '@/entities/session'
import { CreateProjectDialog, ProjectStarter } from '@/features/project-create'
import type { Project } from '@/shared/api/types'
import { formatDateTime, formatPct, formatRub, formatYears, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { Stagger } from '@/shared/ui/kinetics'
import { ConfidenceRing } from '@/shared/ui/v0'

const ICONS: Record<string, ReactNode> = {
  warehouse: <Warehouse size={18} />,
  airport: <Plane size={18} />,
  hospital: <HeartPulse size={18} />,
}

export function ProjectsPage() {
  const projects = useProjects()
  const { organization } = useWorkspace()
  const isEmpty = projects.isSuccess && projects.data.items.length === 0
  // «Добавить проект» из меню вкладок ведёт сюда с ?new=1 - модалка создания открывается сразу.
  const [params, setParams] = useSearchParams()
  const creating = params.get('new') === '1'
  const setCreating = (next: boolean) => setParams(next ? { new: '1' } : {}, { replace: true })
  const newProject = (
    <Button size="sm" className={isEmpty ? 'hidden' : undefined}>
      <Plus /> Новый проект
    </Button>
  )

  return (
    <div className="mx-auto w-full max-w-275 px-4 pt-7 sm:px-6 sm:pt-12 pb-16">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="display text-[34px] leading-[1.05] tracking-[-0.035em] sm:text-[44px]">Проекты</h1>
          {/* Чьи это проекты: переключатель рабочих областей - в меню профиля. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 text-[14px] text-ink-3">
            {organization ? (
              <>
                <span>
                  Организация <span className="font-medium text-ink-2">{quoted(organization.name)}</span> · общие для{' '}
                  {organization.members_count}{' '}
                  {pluralRu(organization.members_count, ['участник', 'участника', 'участников'])}
                </span>
                <Link
                  to={`/organizations/${organization.id}`}
                  className="inline-flex items-center gap-1 font-medium text-ink-2 hover:text-ink"
                >
                  <Users size={14} /> Участники
                </Link>
              </>
            ) : (
              <span>Личное пространство - проекты видны только вам</span>
            )}
          </div>
        </div>
        <CreateProjectDialog trigger={newProject} open={creating} onOpenChange={setCreating} />
      </div>

      <section>
        {projects.isPending && <LoadingBlock label="Загружаем проекты…" />}
        {projects.isError && <ErrorBlock error={projects.error} onRetry={() => projects.refetch()} />}
        {isEmpty && <ProjectStarter key={organization?.id ?? 'personal'} />}
        {projects.data && projects.data.items.length > 0 && (
          <Stagger className="grid gap-4 md:grid-cols-2">
            {projects.data.items.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </Stagger>
        )}
      </section>
    </div>
  )
}

function ProjectCard({ project }: { project: Project }) {
  const navigate = useNavigate()
  const { user } = useSession()
  const { organization } = useWorkspace()
  const copy = useCopyProject()
  const remove = useDeleteProject()
  const metrics = project.headline_metrics
  const score = project.data_quality.filled_score
  const canManage = project.organization_id === null || project.owner_id === user?.id || organization?.role === 'owner'

  return (
    <article
      aria-labelledby={`project-${project.id}`}
      className="group relative flex h-full min-w-0 flex-col rounded-xl border border-line bg-popover p-5 transition-colors hover:border-ink-3 sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-ink-2"
            aria-hidden
          >
            {ICONS[project.object_type] ?? <Warehouse size={18} />}
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink-2">{OBJECT_TYPE_LABEL[project.object_type]}</p>
            <p className="mt-0.5 text-[12px] text-ink-3">{PROJECT_STATUS_LABEL[project.status]}</p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative z-10 -mt-1 -mr-1.5 text-ink-3"
              aria-label="Действия с проектом"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-44">
            <DropdownMenuItem
              onSelect={async () => {
                const created = await copy.mutateAsync({ id: project.id, name: `${project.name} (копия)` })
                navigate(`/projects/${created.id}`)
              }}
            >
              <Copy /> Дублировать
            </DropdownMenuItem>
            {canManage && (
              <>
                <MoveTo project={project} />
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
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <h2
        id={`project-${project.id}`}
        className="mt-5 text-[19px] leading-snug font-semibold tracking-[-0.02em] wrap-anywhere sm:text-[21px]"
      >
        <Link
          to={`/projects/${project.id}`}
          className="line-clamp-3 outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:outline-2 focus-visible:after:outline-offset-3 focus-visible:after:outline-ring"
          title={project.name}
        >
          {project.name}
        </Link>
      </h2>
      <p className="mt-2 text-[12px] text-ink-3">Обновлён {formatDateTime(project.updated_at)}</p>
      <div className="mt-5 mb-6">
        {metrics ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Metric value={formatYears(metrics.payback_years)} label="Окупаемость" />
              <Metric value={formatRub(metrics.capex_rub)} label="Вложения" />
            </div>
            <div
              className="mt-4"
              title="Оценка рассчитанного сценария по окупаемости и NPV. Заполненность данных на этот ярлык напрямую не влияет."
            >
              <VerdictBadge verdict={metrics.verdict} />
            </div>
          </>
        ) : (
          <>
            <p className="text-[14px] font-medium">Расчёта пока нет</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
              {project.scenarios_count > 0
                ? `${project.scenarios_count} ${pluralRu(project.scenarios_count, ['сценарий', 'сценария', 'сценариев'])}. Откройте проект, чтобы рассчитать экономику.`
                : 'Проверьте исходные данные и подберите роботов для вашего объекта.'}
            </p>
          </>
        )}
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[12px]">
        <span
          title="Заполненность всех параметров, включая данные примера и допущения. Подтверждение источников показано на странице объекта."
          className="flex items-center gap-2 text-ink-3"
        >
          <ConfidenceRing value={score * 100} size={18} />
          <span>
            <span className="num font-medium text-ink-2">{formatPct(score, { share: true, digits: 0 })}</span>{' '}
            параметров заполнено
          </span>
        </span>
        <span className="flex items-center gap-2 font-medium text-ink-2" aria-hidden>
          Открыть проект <ArrowRight size={15} />
        </span>
      </div>
    </article>
  )
}

/* Перенос между рабочими областями: личный проект - в организацию (его увидят участники) и обратно. */
function MoveTo({ project }: { project: Project }) {
  const { organizations } = useWorkspace()
  const move = useMoveProject()
  const targets = [
    { id: null, name: 'Личное пространство' },
    ...organizations.map((o) => ({ id: o.id as string | null, name: o.name })),
  ].filter((t) => t.id !== (project.organization_id ?? null))
  if (!organizations.length) return null
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <ArrowRightLeft /> Перенести в…
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-52">
        {targets.map((target) => (
          <DropdownMenuItem
            key={target.id ?? 'personal'}
            onSelect={async () => {
              await move.mutateAsync({ id: project.id, organizationId: target.id })
              toast.success(`«${project.name}» перенесён: ${target.name}`)
            }}
          >
            {target.id ? quoted(target.name) : target.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function Metric({ value, label, className }: { value: ReactNode; label: string; className?: string }) {
  return (
    <span className={cn('flex flex-col', className)}>
      <span className="num text-[22px] leading-tight font-semibold tracking-[-0.02em]">{value}</span>
      <span className="mt-1 text-[12px] text-ink-3">{label}</span>
    </span>
  )
}

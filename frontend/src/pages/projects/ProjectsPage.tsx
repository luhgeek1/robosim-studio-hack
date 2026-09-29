import { ArrowRightLeft, Copy, HeartPulse, MoreHorizontal, Plane, Plus, Trash2, Users, Warehouse } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { quoted, useWorkspace } from '@/entities/organization'
import { OBJECT_TYPE_LABEL, useCopyProject, useDeleteProject, useMoveProject, useProjects } from '@/entities/project'
import { VerdictBadge } from '@/entities/scenario'
import { CreateProjectDialog } from '@/features/project-create'
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
  // «Добавить проект» из меню вкладок ведёт сюда с ?new=1 — модалка создания открывается сразу.
  const [params, setParams] = useSearchParams()
  const creating = params.get('new') === '1'
  const setCreating = (next: boolean) => setParams(next ? { new: '1' } : {}, { replace: true })
  const newProject = (
    <Button size="sm">
      <Plus /> Новый проект
    </Button>
  )

  return (
    <div className="mx-auto w-full max-w-275 px-4 pt-7 sm:px-6 sm:pt-12 pb-16">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="display text-[44px] leading-[1.05] tracking-[-0.035em]">Проекты</h1>
          {/* Чьи это проекты: переключатель рабочих областей — в меню профиля. */}
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
              <span>Личное пространство — проекты видны только вам</span>
            )}
          </div>
        </div>
        <CreateProjectDialog trigger={newProject} open={creating} onOpenChange={setCreating} />
      </div>

      <section>
        {projects.isPending && <LoadingBlock label="Загружаем проекты…" />}
        {projects.isError && <ErrorBlock error={projects.error} onRetry={() => projects.refetch()} />}
        {projects.data && projects.data.items.length === 0 && (
          <div className="rounded-[12px] border border-dashed border-line px-5 py-10 text-center text-[14px] text-ink-3">
            {organization
              ? 'В организации пока нет проектов. Создайте первый или перенесите сюда личный — через меню «…» у проекта.'
              : 'Проектов пока нет. Создайте первый — демо-склад организатора считается за минуту.'}
          </div>
        )}
        {projects.data && projects.data.items.length > 0 && (
          <Stagger className="card divide-y divide-line overflow-hidden">
            {projects.data.items.map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))}
          </Stagger>
        )}
      </section>
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
    <div className="group relative flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-black/5 text-ink-2">
        {ICONS[project.object_type] ?? <Warehouse size={18} />}
      </span>
      <span className="min-w-0 flex-1">
        <Link
          to={`/projects/${project.id}`}
          className="block truncate text-[15px] font-semibold after:absolute after:inset-0"
        >
          {project.name}
        </Link>
        <span className="block truncate text-[13px] text-ink-3">
          {OBJECT_TYPE_LABEL[project.object_type]} · обновлён {formatDateTime(project.updated_at)}
        </span>
      </span>
      {metrics ? (
        <span className="hidden items-center text-[13px] md:flex">
          <Metric value={formatYears(metrics.payback_years)} label="окупаемость" className="w-28" />
          <Metric value={formatRub(metrics.capex_rub)} label="CAPEX" className="w-32" />
          <span className="w-32">
            <VerdictBadge verdict={metrics.verdict} />
          </span>
        </span>
      ) : (
        <span className="hidden w-92 text-[13px] text-ink-3 md:inline">
          {project.scenarios_count > 0 ? `Сценариев: ${project.scenarios_count}, расчёта нет` : 'Расчёта ещё нет'}
        </span>
      )}
      <Metric
        value={
          <span className="flex items-center gap-1.5">
            <ConfidenceRing value={score * 100} size={16} />
            {formatPct(score, { share: true, digits: 0 })}
          </span>
        }
        label="данных введено"
        className="w-28"
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="relative z-10 text-ink-4" aria-label="Действия с проектом">
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
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/* Перенос между рабочими областями: личный проект — в организацию (его увидят участники) и обратно. */
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
      <span className="num text-[14px] font-medium">{value}</span>
      <span className="text-[12px] text-ink-3">{label}</span>
    </span>
  )
}

import {
  ArrowRight,
  ArrowRightLeft,
  Copy,
  HeartPulse,
  MoreHorizontal,
  Plane,
  Plus,
  Search,
  Trash2,
  Users,
  Warehouse,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { quoted, useWorkspace } from '@/entities/organization'
import { OBJECT_TYPE_LABEL, useCopyProject, useDeleteProject, useMoveProject, useProjects } from '@/entities/project'
import { VerdictBadge } from '@/entities/scenario'
import { useSession } from '@/entities/session'
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
import { EmptyState, ErrorBlock, LoadingBlock } from '@/shared/ui/states'
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
  const [query, setQuery] = useState('')
  const items = projects.data?.items ?? []
  const scenariosCount = items.reduce((sum, project) => sum + project.scenarios_count, 0)
  const filtered = items.filter((project) =>
    `${project.name} ${OBJECT_TYPE_LABEL[project.object_type]}`
      .toLocaleLowerCase('ru')
      .includes(query.trim().toLocaleLowerCase('ru')),
  )
  // «Добавить проект» из меню вкладок ведёт сюда с ?new=1 — модалка создания открывается сразу.
  const [params, setParams] = useSearchParams()
  const creating = params.get('new') === '1'
  const setCreating = (next: boolean) => setParams(next ? { new: '1' } : {}, { replace: true })
  const newProject = (
    <Button>
      <Plus /> Новый проект
    </Button>
  )

  return (
    <div className="workspace-projects mx-auto w-full max-w-7xl px-4 pt-7 sm:px-6 sm:pt-10 pb-16">
      <div className="workspace-projects-heading flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="workspace-eyebrow">
            Рабочее пространство <span>/</span> {organization ? 'Команда' : 'Личное'}
          </div>
          <h1 className="h1 mt-3">
            Проекты<span className="text-signal">.</span>
          </h1>
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

      {projects.data && (
        <div className="workspace-portfolio-summary">
          <div>
            <strong>{items.length}</strong>
            <span>
              {pluralRu(items.length, ['проект', 'проекта', 'проектов'])}
              <small>в рабочей области</small>
            </span>
          </div>
          <div>
            <strong>{scenariosCount}</strong>
            <span>
              {pluralRu(scenariosCount, ['сценарий', 'сценария', 'сценариев'])}
              <small>для сравнения</small>
            </span>
          </div>
          <div>
            <strong>{items.filter((project) => project.headline_metrics).length}</strong>
            <span>
              с расчётом<small>экономики проекта</small>
            </span>
          </div>
          <Link to="/catalog">
            Подобрать решения <ArrowRight size={16} />
          </Link>
        </div>
      )}

      <section aria-label="Список проектов">
        <div className="workspace-projects-toolbar">
          <h2>
            Все проекты <span>{filtered.length}</span>
          </h2>
          <label className="workspace-project-search">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              aria-label="Поиск проектов"
              placeholder="Найти проект…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        {projects.isPending && <LoadingBlock label="Загружаем проекты…" />}
        {projects.isError && <ErrorBlock error={projects.error} onRetry={() => projects.refetch()} />}
        {projects.data && projects.data.items.length === 0 && (
          <EmptyState
            title="Здесь начнётся ваш первый расчёт"
            description={
              organization
                ? 'В организации пока нет проектов. Создайте первый или перенесите сюда личный — через меню «…» у проекта.'
                : 'Создайте проект с параметрами своего объекта или начните с готового демо-набора.'
            }
          />
        )}
        {projects.data && items.length > 0 && !filtered.length && (
          <EmptyState
            title="Такого проекта пока нет"
            description="Попробуйте другое название или тип объекта."
            action={
              <Button variant="outline" onClick={() => setQuery('')}>
                Сбросить поиск
              </Button>
            }
          />
        )}
        {projects.data && filtered.length > 0 && (
          <Stagger className="workspace-project-list card divide-y divide-line overflow-hidden">
            {filtered.map((project) => (
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
  const { user } = useSession()
  const { organization } = useWorkspace()
  const copy = useCopyProject()
  const remove = useDeleteProject()
  const metrics = project.headline_metrics
  const score = project.data_quality.score
  const canManage = project.organization_id === null || project.owner_id === user?.id || organization?.role === 'owner'

  return (
    <div className="workspace-project-row group relative flex items-start gap-3 px-4 py-5 transition-colors max-md:flex-wrap sm:gap-4 sm:px-5 md:items-center">
      <span className="workspace-project-icon flex size-9 shrink-0 items-center justify-center text-ink-2">
        {ICONS[project.object_type] ?? <Warehouse size={18} />}
      </span>
      <span className="min-w-0 flex-1">
        <Link
          to={`/projects/${project.id}`}
          className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-[-0.02em] after:absolute after:inset-0 group-hover:text-accent-ink"
        >
          {project.name}
        </Link>
        <span className="mt-1 block text-[12px] text-ink-3 md:truncate">
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
          <span className="block text-[13px] font-medium text-ink-2">Ожидает расчёта</span>
          <span className="text-[12px]">
            {project.scenarios_count > 0
              ? `${project.scenarios_count} ${pluralRu(project.scenarios_count, ['сценарий', 'сценария', 'сценариев'])}`
              : 'Добавьте первый сценарий'}
          </span>
        </span>
      )}
      <DataScore score={score} className="hidden w-28 md:flex" />
      {/* На узком экране цифры проекта идут отдельной строкой под названием во всю ширину, а не колонками справа. */}
      <span className="order-last flex basis-full flex-wrap gap-x-6 gap-y-2.5 text-[13px] md:hidden">
        {metrics ? (
          <>
            <Metric value={formatYears(metrics.payback_years)} label="окупаемость" />
            <Metric value={formatRub(metrics.capex_rub)} label="CAPEX" />
          </>
        ) : (
          <span className="basis-full text-ink-3">
            {project.scenarios_count > 0 ? `Сценариев: ${project.scenarios_count}, расчёта нет` : 'Расчёта ещё нет'}
          </span>
        )}
        <DataScore score={score} />
        {metrics && (
          <span className="basis-full">
            <VerdictBadge verdict={metrics.verdict} />
          </span>
        )}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative z-10 -mt-1 -mr-1.5 text-ink-4 md:mt-0 md:mr-0"
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

function DataScore({ score, className }: { score: number; className?: string }) {
  return (
    <Metric
      value={
        <span className="flex items-center gap-1.5">
          <ConfidenceRing value={score * 100} size={16} />
          {formatPct(score, { share: true, digits: 0 })}
        </span>
      }
      label="данных введено"
      className={className}
    />
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

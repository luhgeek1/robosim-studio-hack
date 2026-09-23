import { motion } from 'framer-motion'
import { HeartPulse, LogOut, Plane, Plus, UserRound, Warehouse, X } from 'lucide-react'
import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router'
import { PROJECT_STEPS, useProject } from '@/entities/project'
import { useSession } from '@/entities/session'
import { compareUrl, useCompareSelection } from '@/features/catalog-compare-selection'
import { parseApiProblem } from '@/shared/api/problem'
import type { Role } from '@/shared/api/types'
import { formatPct } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { ConfidenceRing } from '@/shared/ui/v0'
import { Logo } from './Logo'
import { useProjectTabs, type ProjectTab } from './tabs'

const ROLE_LABEL: Record<Role, string> = {
  guest: 'Гость',
  user: 'Пользователь',
  admin: 'Администратор',
  vendor: 'Производитель',
}

function UserMenu() {
  const { status, user, logout } = useSession()
  const navigate = useNavigate()
  if (status === 'restoring') return null
  if (!user) {
    return (
      <Button asChild size="sm">
        <Link to="/login">Войти</Link>
      </Button>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-ink-2">
          <UserRound />
          <span className="hidden max-w-40 truncate xl:inline">{user.name || user.email}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="space-y-0.5">
          <div className="truncate">{user.email}</div>
          <div className="text-xs font-normal text-ink-3">
            {ROLE_LABEL[user.role]}
            {user.organization && ` · ${user.organization}`}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await logout()
            navigate('/login')
          }}
        >
          <LogOut /> Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const OBJECT_ICON = { warehouse: Warehouse, airport: Plane, hospital: HeartPulse } as const

/* Вкладка проекта как в браузере: иконка объекта, название, индекс доверия, крестик. Ведёт на последний
   открытый экран этого проекта. */
function Tab({ tab, active }: { tab: ProjectTab; active: boolean }) {
  const project = useProject(tab.id)
  const navigate = useNavigate()
  const close = useProjectTabs((s) => s.close)
  const gone = project.isError && parseApiProblem(project.error).status === 404
  useEffect(() => {
    if (gone) close(tab.id)
  }, [gone, close, tab.id])
  const score = project.data?.data_quality.score
  const Icon = OBJECT_ICON[project.data?.object_type as keyof typeof OBJECT_ICON] ?? Warehouse
  const onClose = () => {
    const next = close(tab.id)
    if (active) navigate(next ? next.path : '/projects')
  }
  return (
    <div
      className={cn(
        'group relative flex h-9 max-w-64 min-w-36 shrink items-center rounded-[10px] border transition-colors',
        active
          ? 'border-line bg-surface shadow-[0_1px_2px_rgba(20,20,24,0.06)]'
          : 'border-transparent text-ink-3 hover:bg-black/4 hover:text-ink',
      )}
    >
      <Link
        to={tab.path}
        className="flex h-full min-w-0 flex-1 items-center gap-2 pr-1 pl-2.5"
        title={project.data?.name}
      >
        <span
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-md',
            active ? 'bg-black/5 text-ink-2' : 'text-ink-4',
          )}
        >
          <Icon size={14} />
        </span>
        <span className={cn('truncate text-[13px]', active ? 'font-medium text-ink' : 'font-medium')}>
          {project.data?.name ?? '…'}
        </span>
        {active && score !== undefined && (
          <span className="hidden shrink-0 items-center gap-1 text-[12px] text-ink-3 2xl:flex">
            <ConfidenceRing value={score * 100} size={14} />
            <span className="num">{formatPct(score, { share: true, digits: 0 })}</span>
          </span>
        )}
      </Link>
      <button
        type="button"
        onClick={onClose}
        aria-label={`Закрыть вкладку «${project.data?.name ?? 'проект'}»`}
        className={cn(
          'mr-1.5 flex size-5 shrink-0 items-center justify-center rounded-md text-ink-4 transition-opacity hover:bg-black/8 hover:text-ink',
          active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        )}
      >
        <X size={13} />
      </button>
    </div>
  )
}

function ProjectTabs({ activeId }: { activeId?: string }) {
  const tabs = useProjectTabs((s) => s.tabs)
  const visit = useProjectTabs((s) => s.visit)
  const { pathname } = useLocation()
  useEffect(() => {
    if (activeId) visit(activeId, pathname)
  }, [activeId, pathname, visit])
  if (!tabs.length) return <div className="min-w-0 flex-1" />
  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
      role="tablist"
      aria-label="Открытые проекты"
    >
      {tabs.map((tab) => (
        <Tab key={tab.id} tab={tab} active={tab.id === activeId} />
      ))}
      <Link
        to="/projects"
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-ink-4 transition-colors hover:bg-black/4 hover:text-ink"
        title="Открыть другой проект"
        aria-label="Открыть другой проект"
      >
        <Plus size={15} />
      </Link>
    </div>
  )
}

/* Разделы платформы видны всегда: все проекты, каталог и сравнение решений; внутри проекта сравнение сразу
   проверяет совместимость с его объектом. */
function Sections({ projectId }: { projectId?: string }) {
  const { user } = useSession()
  const selection = useCompareSelection()
  const compareTo = `${compareUrl(selection.ids)}${projectId ? `&project=${projectId}` : ''}`
  return (
    <nav className="flex shrink-0 items-center gap-1" aria-label="Разделы">
      {user && (
        <NavLink to="/projects" end className={sectionLink}>
          Проекты
        </NavLink>
      )}
      <NavLink to="/catalog" end className={sectionLink}>
        Каталог
      </NavLink>
      <NavLink to={compareTo} className={({ isActive }) => cn(sectionLink({ isActive }), 'flex items-center gap-1.5')}>
        Сравнение решений
        {selection.items.length > 0 && (
          <span className="num flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-ink px-1 text-[10.5px] text-white">
            {selection.items.length}
          </span>
        )}
      </NavLink>
    </nav>
  )
}

/* Плашка шагов закреплена под шапкой: контент прокручивается под стеклом, шаги всегда под рукой. */
function StepDock({ projectId }: { projectId: string }) {
  return (
    <div className="pointer-events-none sticky top-14 z-30 flex justify-center px-6 pt-3 pb-1">
      <nav
        className="glass pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full p-1.5"
        aria-label="Шаги оценки"
      >
        {PROJECT_STEPS.map((step, i) => (
          <NavLink
            key={step.id}
            to={`/projects/${projectId}/${step.id}`}
            className={({ isActive }) =>
              cn(
                'relative flex h-9 items-center rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors',
                isActive ? 'text-ink' : step.soon ? 'text-ink-4 hover:text-ink-3' : 'text-ink-3 hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="step-pill"
                    className="absolute inset-0 rounded-full bg-white shadow-[0_1px_2px_rgba(20,20,24,0.08),0_4px_12px_-4px_rgba(20,20,24,0.18),inset_0_0_0_1px_rgba(255,255,255,0.9)]"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <span className={cn('num text-[11px]', isActive ? 'text-ink-2' : 'text-ink-4')}>{i + 1}</span>
                  {step.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

const sectionLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    'h-8 rounded-md px-3 text-[13px] leading-8 font-medium',
    isActive ? 'bg-black/6 text-ink' : 'text-ink-3 hover:text-ink',
  )

export function AppShell() {
  const { user } = useSession()
  const match = useMatch('/projects/:projectId/*')
  const projectId = match?.params.projectId
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 h-14 shrink-0 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-360 items-center gap-5 px-6">
          <Logo />
          <div className="h-5 w-px shrink-0 bg-line-2" />
          <Sections projectId={projectId} />
          <div className="h-5 w-px shrink-0 bg-line-2" />
          {user ? <ProjectTabs activeId={projectId} /> : <div className="min-w-0 flex-1" />}
          <div className="shrink-0">
            <UserMenu />
          </div>
        </div>
      </header>
      {projectId && <StepDock projectId={projectId} />}
      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  )
}

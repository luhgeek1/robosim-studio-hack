import { motion } from 'framer-motion'
import { ChevronRight, HeartPulse, LogOut, Plane, UserRound, Warehouse } from 'lucide-react'
import { Link, NavLink, Outlet, useMatch, useNavigate } from 'react-router'
import { PROJECT_STEPS, useProject } from '@/entities/project'
import { useSession } from '@/entities/session'
import { compareUrl, useCompareSelection } from '@/features/catalog-compare-selection'
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

/* Текущий проект — именно кнопка: рамка, иконка объекта, индекс доверия и шеврон; ведёт на обзор проекта. */
function ProjectButton({ projectId }: { projectId: string }) {
  const project = useProject(projectId)
  const score = project.data?.data_quality.score
  const Icon = OBJECT_ICON[project.data?.object_type as keyof typeof OBJECT_ICON] ?? Warehouse
  return (
    <NavLink
      to={`/projects/${projectId}`}
      end
      title="Обзор проекта"
      className={({ isActive }) =>
        cn(
          'group flex h-9 min-w-0 items-center gap-2.5 rounded-[10px] border border-line bg-surface pr-2 pl-2.5 shadow-[0_1px_2px_rgba(20,20,24,0.06)] transition-colors hover:border-line-2 hover:bg-surface-2',
          isActive && 'border-ink/25',
        )
      }
    >
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-black/5 text-ink-2">
        <Icon size={14} />
      </span>
      <span className="max-w-80 truncate text-[13.5px] font-medium">{project.data?.name ?? '…'}</span>
      {score !== undefined && (
        <span className="hidden items-center gap-1 border-l border-line pl-2.5 text-[12px] whitespace-nowrap text-ink-3 xl:flex">
          <ConfidenceRing value={score * 100} size={16} />
          <span className="num font-medium text-ink-2">{formatPct(score, { share: true, digits: 0 })}</span>
        </span>
      )}
      <ChevronRight size={14} className="shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5" />
    </NavLink>
  )
}

/* Разделы платформы видны всегда: все проекты, каталог и сравнение решений; внутри проекта сравнение сразу
   проверяет совместимость с его объектом. */
function Sections({ projectId }: { projectId?: string }) {
  const { user } = useSession()
  const selection = useCompareSelection()
  const compareTo = `${compareUrl(selection.ids)}${projectId ? `&project=${projectId}` : ''}`
  return (
    <nav className="flex items-center gap-1" aria-label="Разделы">
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
  const match = useMatch('/projects/:projectId/*')
  const projectId = match?.params.projectId
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 h-14 shrink-0 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-360 items-center gap-5 px-6">
          <Logo />
          <div className="h-5 w-px bg-line-2" />
          <Sections projectId={projectId} />
          {projectId && (
            <>
              <div className="h-5 w-px bg-line-2" />
              <ProjectButton projectId={projectId} />
            </>
          )}
          <div className="ml-auto">
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

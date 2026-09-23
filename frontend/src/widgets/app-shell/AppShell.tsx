import { motion } from 'framer-motion'
import { FolderOpen, LogOut, UserRound } from 'lucide-react'
import { Link, NavLink, Outlet, useMatch, useNavigate } from 'react-router'
import { PROJECT_STEPS, useProject } from '@/entities/project'
import { useSession } from '@/entities/session'
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

/* Внутри проекта верхняя панель — это и есть навигация: название с индексом доверия и нумерованные шаги. */
function ProjectNav({ projectId }: { projectId: string }) {
  const project = useProject(projectId)
  const score = project.data?.data_quality.score
  return (
    <>
      <div className="h-5 w-px bg-line-2" />
      <Link
        to={`/projects/${projectId}`}
        className="group -mx-1 flex min-w-0 items-center gap-3 rounded-md px-1 py-1 transition-colors hover:bg-black/[0.04]"
        title="Обзор проекта"
      >
        <span className="max-w-48 truncate text-[14px] font-medium">{project.data?.name ?? '…'}</span>
        {score !== undefined && (
          <span className="hidden items-center gap-1.5 whitespace-nowrap text-[12.5px] text-ink-3 2xl:flex">
            <ConfidenceRing value={score * 100} />
            <span>
              доверие <span className="num font-medium text-ink">{formatPct(score, { share: true, digits: 0 })}</span>
            </span>
          </span>
        )}
      </Link>
      <nav className="ml-auto flex shrink-0 items-center gap-0.5" aria-label="Шаги оценки">
        {PROJECT_STEPS.map((step, i) => (
          <NavLink
            key={step.id}
            to={`/projects/${projectId}/${step.id}`}
            className={({ isActive }) =>
              cn(
                'relative h-8 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors',
                isActive ? 'text-ink' : step.soon ? 'text-ink-4' : 'text-ink-3 hover:bg-black/[0.04] hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-md bg-black/[0.06]"
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
      <Button asChild size="sm" variant="ghost" className="text-ink-2">
        <Link to="/projects">
          <FolderOpen /> <span className="hidden 2xl:inline">Проекты</span>
        </Link>
      </Button>
    </>
  )
}

export function AppShell() {
  const { user } = useSession()
  const match = useMatch('/projects/:projectId/*')
  const projectId = match?.params.projectId
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 h-14 shrink-0 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-[1440px] items-center gap-5 px-6">
          <Logo />
          {projectId ? (
            <ProjectNav projectId={projectId} />
          ) : (
            <nav className="flex items-center gap-1" aria-label="Разделы">
              {user && (
                <NavLink
                  to="/projects"
                  className={({ isActive }) =>
                    cn(
                      'h-8 rounded-md px-3 text-[13px] font-medium leading-8',
                      isActive ? 'bg-black/[0.06] text-ink' : 'text-ink-3 hover:text-ink',
                    )
                  }
                >
                  Проекты
                </NavLink>
              )}
              <NavLink
                to="/catalog"
                className={({ isActive }) =>
                  cn(
                    'h-8 rounded-md px-3 text-[13px] font-medium leading-8',
                    isActive ? 'bg-black/[0.06] text-ink' : 'text-ink-3 hover:text-ink',
                  )
                }
              >
                Каталог решений
              </NavLink>
            </nav>
          )}
          <div className={projectId ? '' : 'ml-auto'}>
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  )
}

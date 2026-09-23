import { motion } from 'framer-motion'
import { LogOut, UserRound } from 'lucide-react'
import { useRef } from 'react'
import { Link, NavLink, Outlet, useMatch, useNavigate } from 'react-router'
import { PROJECT_STEPS } from '@/entities/project'
import { useSession } from '@/entities/session'
import type { Role } from '@/shared/api/types'
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
import { HeaderHighlight, ProjectTabs, Sections } from './HeaderNav'
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

/* Плашка шагов закреплена под шапкой: контент прокручивается под стеклом, шаги всегда под рукой.
   Шапка и плашка — fixed + layoutRoot, а место в потоке держат распорки той же высоты: framer умеет мерить
   координаты только для fixed-корней, со sticky подсветка при переходе прилетала снизу на величину прокрутки. */
function StepDock({ projectId }: { projectId: string }) {
  return (
    <motion.div
      layoutRoot
      className="pointer-events-none fixed inset-x-0 top-14 z-30 flex justify-center px-6 pt-3 pb-1"
    >
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
    </motion.div>
  )
}

export function AppShell() {
  const headerRow = useRef<HTMLDivElement>(null)
  const { user } = useSession()
  const match = useMatch('/projects/:projectId/*')
  const projectId = match?.params.projectId
  return (
    <div className="flex min-h-full flex-col">
      <div className="h-14 shrink-0" aria-hidden />
      <motion.header
        layoutRoot
        className="fixed inset-x-0 top-0 z-40 h-14 border-b border-line bg-canvas/85 backdrop-blur-md"
      >
        <div ref={headerRow} className="relative mx-auto flex h-full max-w-360 items-center gap-5 px-6">
          <HeaderHighlight container={headerRow} />
          <Logo />
          <div className="h-5 w-px shrink-0 bg-line-2" />
          <Sections projectId={projectId} />
          <div className="h-5 w-px shrink-0 bg-line-2" />
          {user ? <ProjectTabs activeId={projectId} /> : <div className="min-w-0 flex-1" />}
          <div className="shrink-0">
            <UserMenu />
          </div>
        </div>
      </motion.header>
      {projectId && (
        <>
          <div className="h-16.5 shrink-0" aria-hidden />
          <StepDock projectId={projectId} />
        </>
      )}
      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  )
}

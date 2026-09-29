import { motion } from 'framer-motion'
import { useState } from 'react'
import { NavLink, Outlet, useMatch } from 'react-router'
import { PROJECT_STEPS } from '@/entities/project'
import { useSession } from '@/entities/session'
import { cn } from '@/shared/lib/utils'
import { HeaderHighlight, ProjectTabs, Sections } from './HeaderNav'
import { Logo } from './Logo'
import { Notifications } from './Notifications'
import { WorkspaceMenu } from './WorkspaceMenu'
import { SlideHighlight, SlideMark } from '@/shared/ui/slide-highlight'

/* Плашка шагов закреплена под шапкой: контент прокручивается под стеклом, шаги всегда под рукой.
   Шапка и плашка — fixed, а место в потоке держат распорки той же высоты. */
function StepDock({ projectId }: { projectId: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-30 flex justify-center px-6 pt-3 pb-1">
      <nav
        className="glass pointer-events-auto relative flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full p-1.5"
        aria-label="Шаги оценки"
      >
        <SlideHighlight className="rounded-full bg-white shadow-[0_1px_2px_rgba(20,20,19,0.08),0_4px_12px_-4px_rgba(20,20,19,0.18),inset_0_0_0_1px_rgba(255,255,255,0.9)]" />
        {PROJECT_STEPS.map((step, i) => (
          <NavLink
            key={step.id}
            to={`/projects/${projectId}/${step.id}`}
            className={({ isActive }) =>
              cn(
                'relative flex h-9 items-center rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap text-ink transition-colors',
                !isActive && 'hover:bg-white/50',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <SlideMark />}
                <span className="relative z-10 flex items-center gap-1.5">
                  <span className="num text-[11px] text-ink">{i + 1}</span>
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

export function AppShell() {
  // Callback-ref: эффект подсветки должен стартовать, когда строка шапки уже в DOM (обычный ref у родителя
  // привязывается позже эффектов детей).
  const [headerRow, setHeaderRow] = useState<HTMLDivElement | null>(null)
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
        <div ref={setHeaderRow} className="relative mx-auto flex h-full max-w-360 items-center gap-5 px-6">
          <HeaderHighlight container={headerRow} />
          <Logo />
          <div className="h-5 w-px shrink-0 bg-line-2" />
          <Sections projectId={projectId} />
          <div className="h-5 w-px shrink-0 bg-line-2" />
          {user ? <ProjectTabs activeId={projectId} /> : <div className="min-w-0 flex-1" />}
          <div className="flex shrink-0 items-center gap-1">
            <Notifications />
            <WorkspaceMenu />
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

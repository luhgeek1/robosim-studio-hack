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

/* Плашка шагов закреплена внизу экрана, по центру: шаги всегда под рукой и не спорят с шапкой.
   Место под ней в потоке держит распорка той же высоты. */
function StepDock({ projectId }: { projectId: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-6 pb-8">
      <nav
        // Тёмная «приборная» поверхность (DESIGN.md): на бумажном холсте и светлых карточках плашка не сливается
        // с контентом, а сигнальный цвет остаётся за главным выводом экрана.
        className="pointer-events-auto relative flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-ink/92 p-2 shadow-[0_18px_40px_-12px_rgba(20,20,19,0.45),0_2px_6px_rgba(20,20,19,0.18),inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-white/10 backdrop-blur-xl [scrollbar-width:none]"
        aria-label="Шаги оценки"
      >
        <SlideHighlight className="rounded-full bg-card shadow-[0_1px_2px_rgba(0,0,0,0.25),0_6px_16px_-6px_rgba(0,0,0,0.45)]" />
        {PROJECT_STEPS.map((step, i) => (
          <NavLink
            key={step.id}
            to={`/projects/${projectId}/${step.id}`}
            className={({ isActive }) =>
              cn(
                'relative flex h-11 items-center rounded-full px-4.5 text-[14.5px] font-medium whitespace-nowrap transition-colors',
                isActive ? 'text-ink' : 'text-white/72 hover:bg-white/8 hover:text-white',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <SlideMark />}
                <span className="relative z-10 flex items-center gap-2">
                  <span className={cn('num text-[12px]', isActive ? 'text-ink-3' : 'text-white/40')}>{i + 1}</span>
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
      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>
      {projectId && (
        <>
          <div className="h-28 shrink-0" aria-hidden />
          <StepDock projectId={projectId} />
        </>
      )}
    </div>
  )
}

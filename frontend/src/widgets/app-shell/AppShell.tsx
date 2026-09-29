import { motion } from 'framer-motion'
import { useState, useSyncExternalStore } from 'react'
import { NavLink, Outlet, useMatch } from 'react-router'
import { PROJECT_STEPS } from '@/entities/project'
import { useSession } from '@/entities/session'
import { cn } from '@/shared/lib/utils'
import { HeaderHighlight, ProjectTabs, Sections } from './HeaderNav'
import { Logo } from './Logo'
import { Notifications } from './Notifications'
import { WorkspaceMenu } from './WorkspaceMenu'
import { SlideHighlight, SlideMark } from '@/shared/ui/slide-highlight'

// Плашка прячется, как только страницу прокрутили дальше этого порога; вверху страницы она видна всегда.
const DOCK_HIDE_AFTER_PX = 24

const subscribeScroll = (onChange: () => void) => {
  window.addEventListener('scroll', onChange, { passive: true })
  return () => window.removeEventListener('scroll', onChange)
}
const isScrolledDown = () => window.scrollY > DOCK_HIDE_AFTER_PX

/* Плашка шагов под шапкой. При прокрутке вниз уезжает под шапку и не закрывает контент; навести курсор на её место
   (или перейти в неё с клавиатуры) — выезжает обратно. Зона наведения остаётся на месте плашки, пока та спрятана.
   Шапка и плашка — fixed, а место в потоке держат распорки той же высоты. */
function StepDock({ projectId }: { projectId: string }) {
  const scrolled = useSyncExternalStore(subscribeScroll, isScrolledDown)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const hidden = scrolled && !hovered && !focused
  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-30 flex justify-center px-6">
      <div
        className="pointer-events-auto max-w-full pt-3 pb-2"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false)
        }}
      >
        <nav
          className={cn(
            // Плашка чаще появляется поверх прокрученного контента: без размытия цифры и 3D-карточки лезут сквозь подписи.
            'glass relative flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full p-1.5 backdrop-blur-xl backdrop-saturate-150',
            // Выезжает с замедлением, уезжает с разгоном: так движение читается целиком, а не вспышкой в первом кадре.
            'transition-[translate,opacity] duration-320 ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none',
            // Уход — с короткой задержкой: курсор, проскочивший мимо края, не заставляет плашку дёргаться.
            hidden &&
              'pointer-events-none -translate-y-[calc(100%+1.5rem)] opacity-0 delay-100 duration-220 ease-[cubic-bezier(0.32,0,0.67,0)]',
          )}
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

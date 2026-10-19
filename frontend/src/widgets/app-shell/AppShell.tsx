import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, ChevronDown } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link, Outlet, matchPath, useLocation, useMatch } from 'react-router'
import { useJourney } from '@/entities/project/journey'
import { useSession } from '@/entities/session'
import { cn } from '@/shared/lib/utils'
import { useNarrow } from '@/shared/lib/media'
import { HeaderHighlight, MobileNav, ProjectTabs, Sections } from './HeaderNav'
import { Logo } from './Logo'
import { Notifications } from './Notifications'
import { WorkspaceMenu } from './WorkspaceMenu'
import { GuestSessionNotice } from './GuestSessionNotice'
import { SlideHighlight, SlideMark } from '@/shared/ui/slide-highlight'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu'

// Плашка прячется, как только страницу прокрутили дальше этого порога; вверху страницы она видна всегда.
const DOCK_HIDE_AFTER_PX = 24

const subscribeScroll = (onChange: () => void) => {
  window.addEventListener('scroll', onChange, { passive: true })
  return () => window.removeEventListener('scroll', onChange)
}
const isScrolledDown = () => window.scrollY > DOCK_HIDE_AFTER_PX

// «Рывок вверх» — не меньше 120 px со скоростью от 1,5 px/мс (1500 px/с) за последние 200 мс. Спокойное чтение
// вверх (колесо по щелчку, трекпад без броска) медленнее и плашку не достаёт.
const PULL_WINDOW_MS = 200
const PULL_MIN_PX = 120
const PULL_MIN_SPEED = 1.5

/* Резкий бросок прокрутки вверх достаёт плашку, следующая прокрутка вниз прячет её снова. */
function useScrollPull() {
  const [pulled, setPulled] = useState(false)
  useEffect(() => {
    let samples: { t: number; y: number }[] = [{ t: performance.now(), y: window.scrollY }]
    const onScroll = () => {
      const t = performance.now()
      const y = window.scrollY
      const last = samples[samples.length - 1]
      if (y > last.y) {
        samples = [{ t, y }]
        setPulled(false)
        return
      }
      samples = [...samples.filter((s) => t - s.t <= PULL_WINDOW_MS), { t, y }]
      const first = samples[0]
      const distance = first.y - y
      if (distance >= PULL_MIN_PX && distance / Math.max(t - first.t, 1) >= PULL_MIN_SPEED) setPulled(true)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return pulled
}

/* Плашка шагов под шапкой. При прокрутке вниз уезжает под шапку и не закрывает контент; навести курсор на её место
   (или перейти в неё с клавиатуры, Tab) или резко прокрутить вверх — выезжает обратно. Зона наведения остаётся на месте плашки, пока та спрятана.
   Шапка и плашка — fixed, а место в потоке держат распорки той же высоты. */
function StepDock({ projectId }: { projectId: string }) {
  const narrow = useNarrow()
  const pinned = Boolean(useMatch('/projects/:projectId/simulation')) || narrow
  const scrolled = useSyncExternalStore(subscribeScroll, isScrolledDown)
  const pulled = useScrollPull()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const hidden = !pinned && scrolled && !pulled && !hovered && !focused
  const { pathname } = useLocation()
  const { steps: routeSteps } = useJourney(projectId)
  const steps = routeSteps.map((step) => ({
    ...step,
    to: `/projects/${projectId}/${step.id}`,
    active: Boolean(matchPath({ path: `/projects/${projectId}/${step.id}`, end: false }, pathname)),
  }))
  const nav = useRef<HTMLElement>(null)
  const activeIndex = steps.findIndex((step) => step.active)
  useEffect(() => {
    const el = nav.current
    const active = el?.querySelector<HTMLElement>('a[aria-current="page"]')
    if (el && active)
      el.scrollTo({ left: active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2, behavior: 'smooth' })
  }, [pathname])
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30 flex justify-center px-3 sm:px-6"
      style={{ top: 'calc(3.5rem + var(--workspace-banner, 0px))' }}
    >
      <div
        className="pointer-events-auto max-w-full pt-3 pb-2"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={(e) => setFocused(e.target.matches(':focus-visible'))}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false)
        }}
      >
        <div
          className={cn(
            'glass flex w-[calc(100vw-1.5rem)] items-center gap-1 rounded-full p-1.5 sm:hidden',
            hidden && 'pointer-events-none invisible',
          )}
        >
          <Link
            to={activeIndex > 0 ? steps[activeIndex - 1].to : `/projects/${projectId}`}
            aria-label="Предыдущий шаг"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-black/5"
          >
            <ArrowLeft size={17} />
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Выбрать шаг оценки"
                className="flex h-10 min-w-0 flex-1 items-center justify-between gap-2 rounded-full bg-[#293831] px-3.5 text-[13px] font-medium text-white"
              >
                <span className="truncate">
                  {activeIndex >= 0
                    ? `${String(activeIndex + 1).padStart(2, '0')} · ${steps[activeIndex].label}`
                    : 'Обзор проекта'}
                </span>
                <ChevronDown size={15} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64 max-w-[calc(100vw-2rem)]">
              <DropdownMenuItem asChild>
                <Link to={`/projects/${projectId}`}>Обзор проекта</Link>
              </DropdownMenuItem>
              {steps.map((step, i) => (
                <DropdownMenuItem key={step.id} asChild>
                  <Link to={step.to}>
                    <span className="num text-ink-3">{String(i + 1).padStart(2, '0')}</span>
                    <span className="flex-1">{step.label}</span>
                    {step.active && <Check className="text-ok" />}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {activeIndex < steps.length - 1 ? (
            <Link
              to={steps[activeIndex + 1].to}
              aria-label="Следующий шаг"
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-black/5"
            >
              <ArrowRight size={17} />
            </Link>
          ) : (
            <span className="size-10 shrink-0" />
          )}
        </div>
        <nav
          ref={nav}
          className={cn(
            'workspace-step-dock glass relative hidden max-w-full items-center gap-0.5 overflow-x-auto overscroll-x-contain rounded-full p-1.5 backdrop-blur-xl backdrop-saturate-150 sm:flex transition-[translate,opacity] duration-320 motion-reduce:transition-none',
            hidden && 'pointer-events-none -translate-y-[calc(100%+1.5rem)] opacity-0 delay-100 duration-220',
          )}
          aria-label="Шаги оценки"
        >
          <SlideHighlight className="rounded-full bg-[#293831] shadow-[0_2px_4px_rgba(20,30,23,0.14)]" />
          {steps.map((step, i) => (
            <Link
              key={step.id}
              to={step.to}
              aria-current={step.active ? 'page' : undefined}
              className={cn(
                'relative flex h-9 items-center rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors',
                step.active ? 'text-white' : 'text-ink-3 hover:bg-white/50 hover:text-ink',
              )}
            >
              {step.active && <SlideMark />}
              <span className="relative z-10 flex items-center gap-1.5">
                <span className={cn('num text-[10px]', step.active ? 'text-[#ff956f]' : 'text-ink-4')}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                {step.label}
              </span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}

export function AppShell() {
  const [headerRow, setHeaderRow] = useState<HTMLDivElement | null>(null)
  const { user } = useSession()
  const match = useMatch('/projects/:projectId/*')
  const projectId = match?.params.projectId
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname])
  return (
    <div className="app-workspace flex min-h-full flex-col">
      <a href="#workspace-main" className="workspace-skip">
        Перейти к содержимому
      </a>
      <div className="h-14 shrink-0" aria-hidden />
      <motion.header
        layoutRoot
        className="workspace-header fixed inset-x-0 top-0 z-40 h-14 border-b border-line backdrop-blur-md"
      >
        <div
          ref={setHeaderRow}
          className="relative mx-auto flex h-full max-w-360 items-center gap-x-2 px-3 sm:px-4 lg:gap-x-5 lg:px-6"
        >
          <HeaderHighlight container={headerRow} />
          <div className="lg:hidden">
            <MobileNav projectId={projectId} />
          </div>
          <Logo />
          <div className="hidden h-5 w-px shrink-0 bg-line-2 lg:block" />
          <div className="hidden lg:contents">
            <Sections projectId={projectId} />
          </div>
          {user && (
            <div className="hidden min-w-0 flex-1 lg:flex">
              <ProjectTabs activeId={projectId} />
            </div>
          )}
          <div className={cn('min-w-0 flex-1', user && 'lg:hidden')} />
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
      <GuestSessionNotice />
      <main id="workspace-main" className="flex min-h-0 flex-1 flex-col" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  )
}

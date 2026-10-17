import { motion } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link, Outlet, matchPath, useLocation, useMatch } from 'react-router'
import { DEMO_STEPS, demoStep, demoUrl } from '@/entities/demo/navigation'
import { GuestHeaderActions, GuestProjectTab } from './GuestNavigation'
import { PROJECT_STEPS } from '@/entities/project'
import { useSession } from '@/entities/session'
import { cn } from '@/shared/lib/utils'
import { HeaderHighlight, MobileNav, ProjectTabs, Sections } from './HeaderNav'
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
function StepDock({ projectId, demoKey }: { projectId?: string; demoKey?: string }) {
  // Имитация занимает всё окно: переходы между шагами должны всегда оставаться доступны.
  const pinned = Boolean(useMatch('/projects/:projectId/simulation')) || Boolean(demoKey)
  const scrolled = useSyncExternalStore(subscribeScroll, isScrolledDown)
  const pulled = useScrollPull()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const hidden = !pinned && scrolled && !pulled && !hovered && !focused
  const { pathname, search } = useLocation()
  const activeDemoStep = demoStep(new URLSearchParams(search).get('step'))
  const steps = demoKey
    ? DEMO_STEPS.map((s) => ({ ...s, to: demoUrl(demoKey, s.id), active: s.id === activeDemoStep }))
    : PROJECT_STEPS.map((s) => ({
        ...s,
        to: `/projects/${projectId}/${s.id}`,
        active: Boolean(matchPath({ path: `/projects/${projectId}/${s.id}`, end: false }, pathname)),
      }))
  const nav = useRef<HTMLElement>(null)
  // На узком экране плашка прокручивается вбок — активный шаг держим в видимой части.
  useEffect(() => {
    const el = nav.current
    const active = el?.querySelector<HTMLElement>('a[aria-current="page"]')
    if (!el || !active) return
    el.scrollTo({ left: active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2, behavior: 'smooth' })
  }, [pathname, search])
  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-30 flex justify-center px-3 sm:px-6">
      <div
        className="pointer-events-auto max-w-full pt-3 pb-2"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        // Держит плашку только фокус с клавиатуры: после клика мышью фокус остаётся на ссылке шага, и плашка
        // иначе переставала прятаться при прокрутке.
        onFocus={(e) => setFocused(e.target.matches(':focus-visible'))}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false)
        }}
      >
        <nav
          ref={nav}
          className={cn(
            // Плашка чаще появляется поверх прокрученного контента: без размытия цифры и 3D-карточки лезут сквозь подписи.
            'workspace-step-dock glass relative flex max-w-full items-center gap-0.5 overflow-x-auto overscroll-x-contain rounded-full p-1.5 backdrop-blur-xl backdrop-saturate-150',
            // Выезжает с замедлением, уезжает с разгоном: так движение читается целиком, а не вспышкой в первом кадре.
            'transition-[translate,opacity] duration-320 ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none',
            // Уход — с короткой задержкой: курсор, проскочивший мимо края, не заставляет плашку дёргаться.
            hidden &&
              'pointer-events-none -translate-y-[calc(100%+1.5rem)] opacity-0 delay-100 duration-220 ease-[cubic-bezier(0.32,0,0.67,0)]',
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
  // Callback-ref: эффект подсветки должен стартовать, когда строка шапки уже в DOM (обычный ref у родителя
  // привязывается позже эффектов детей).
  const [headerRow, setHeaderRow] = useState<HTMLDivElement | null>(null)
  const { user } = useSession()
  const guest = useMatch('/demo/:demoKey?')
  const demoKey = guest ? (guest.params.demoKey ?? 'warehouse_demo_01') : undefined
  const match = useMatch('/projects/:projectId/*')
  const projectId = match?.params.projectId
  const { pathname, search } = useLocation()
  const navigationKey = demoKey ? pathname + search : pathname
  // Каждый экран открывается сверху: положение прокрутки предыдущего не переносится на следующий.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [navigationKey])
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
          className="relative mx-auto flex h-full max-w-360 items-center gap-2 px-3 sm:px-4 lg:gap-5 lg:px-6"
        >
          <HeaderHighlight container={headerRow} />
          {!demoKey && (
            <div className="lg:hidden">
              <MobileNav projectId={projectId} />
            </div>
          )}
          <Logo />
          <div className="hidden h-5 w-px shrink-0 bg-line-2 lg:block" />
          <div className="hidden lg:contents">
            <Sections projectId={projectId} demoKey={demoKey} />
            <div className="h-5 w-px shrink-0 bg-line-2" />
          </div>
          {demoKey ? (
            <div className="min-w-0 flex-1">
              <GuestProjectTab demoKey={demoKey} />
            </div>
          ) : user ? (
            <div className="hidden min-w-0 flex-1 lg:flex">
              <ProjectTabs activeId={projectId} />
            </div>
          ) : null}
          {!demoKey && <div className={cn('min-w-0 flex-1', user && 'lg:hidden')} />}
          <div className="flex shrink-0 items-center gap-1">
            {demoKey ? (
              <GuestHeaderActions demoKey={demoKey} />
            ) : (
              <>
                <Notifications />
                <WorkspaceMenu />
              </>
            )}
          </div>
        </div>
      </motion.header>
      {(projectId || demoKey) && (
        <>
          <div className="h-16.5 shrink-0" aria-hidden />
          <StepDock projectId={projectId} demoKey={demoKey} />
        </>
      )}
      <main id="workspace-main" className="flex min-h-0 flex-1 flex-col" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  )
}

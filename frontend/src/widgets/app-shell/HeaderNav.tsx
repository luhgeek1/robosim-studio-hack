import { AnimatePresence, motion, type Transition } from 'framer-motion'
import { Check, HeartPulse, Plane, Plus, Warehouse, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'
import { OBJECT_TYPE_LABEL, useProject, useProjects } from '@/entities/project'
import { useSession } from '@/entities/session'
import { compareUrl, useCompareSelection } from '@/features/catalog-compare-selection'
import { parseApiProblem } from '@/shared/api/problem'
import { formatDateTime, formatPct } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { ConfidenceRing } from '@/shared/ui/v0'
import { useProjectTabs, type ProjectTab } from './tabs'

const OBJECT_ICON = { warehouse: Warehouse, airport: Plane, hospital: HeartPulse } as const
const iconOf = (type: string | undefined) => OBJECT_ICON[type as keyof typeof OBJECT_ICON] ?? Warehouse

const SPRING: Transition = { type: 'spring', stiffness: 520, damping: 42, mass: 0.8 }

/* Метка активного пункта: саму подсветку рисует HeaderHighlight, который находит метку и едет к ней. */
function ActiveMark({ variant }: { variant: 'section' | 'tab' }) {
  return <span data-header-active={variant} className="pointer-events-none absolute inset-0" aria-hidden />
}

/* Одна подсветка на всю шапку: перелетает между разделами и вкладками проектов, меняя форму и цвет на лету.
   Координаты считаются относительно контейнера шапки, а не страницы, поэтому прокрутка контента её не сбивает
   (с общим layoutId framer брал позицию до смены прокрутки, и подсветка прилетала снизу). */
export function HeaderHighlight({ container }: { container: HTMLElement | null }) {
  const { pathname } = useLocation()
  const order = useProjectTabs((s) => s.tabs.map((t) => t.id).join(','))
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number; variant: string } | null>(null)

  useLayoutEffect(() => {
    const root = container
    if (!root) return
    const measure = () => {
      const mark = root.querySelector<HTMLElement>('[data-header-active]')
      if (!mark) return setBox(null)
      const r = mark.getBoundingClientRect()
      const c = root.getBoundingClientRect()
      setBox({
        x: r.left - c.left,
        y: r.top - c.top,
        w: r.width,
        h: r.height,
        variant: mark.dataset.headerActive ?? 'section',
      })
    }
    measure()
    // Вкладка появляется с масштабом — перемеряем, когда анимация входа закончится.
    const settle = window.setTimeout(measure, 320)
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    // Пункты шапки появляются позже неё (раздел «Проекты» — после восстановления сессии): ловим появление метки.
    const mutations = new MutationObserver(measure)
    mutations.observe(root, { subtree: true, childList: true, attributeFilter: ['data-header-active'] })
    root.addEventListener('scroll', measure, true)
    return () => {
      window.clearTimeout(settle)
      observer.disconnect()
      mutations.disconnect()
      root.removeEventListener('scroll', measure, true)
    }
  }, [container, pathname, order])

  const tab = box?.variant === 'tab'
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 rounded-[10px]"
      initial={false}
      animate={
        box
          ? {
              x: box.x,
              y: box.y,
              width: box.w,
              height: box.h,
              opacity: 1,
              backgroundColor: tab ? 'rgba(255,255,255,1)' : 'rgba(0,0,0,0.06)',
              boxShadow: tab
                ? '0 1px 2px rgba(20,20,24,0.06), 0 0 0 1px rgba(231,231,227,1)'
                : '0 0 0 0 rgba(0,0,0,0), 0 0 0 0 rgba(0,0,0,0)',
            }
          : { opacity: 0 }
      }
      transition={SPRING}
    />
  )
}

function SectionLink({ to, end, children }: { to: string; end?: boolean; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'relative flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-medium whitespace-nowrap transition-colors',
          isActive ? 'text-ink' : 'text-ink-3 hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <ActiveMark variant="section" />}
          <span className="relative z-10 flex items-center gap-1.5">{children}</span>
        </>
      )}
    </NavLink>
  )
}

/* Разделы платформы видны всегда; внутри проекта сравнение сразу проверяет совместимость с его объектом. */
export function Sections({ projectId }: { projectId?: string }) {
  const { user } = useSession()
  const selection = useCompareSelection()
  const compareTo = `${compareUrl(selection.ids)}${projectId ? `&project=${projectId}` : ''}`
  return (
    <nav className="flex shrink-0 items-center gap-1" aria-label="Разделы">
      {user && (
        <SectionLink to="/projects" end>
          Проекты
        </SectionLink>
      )}
      <SectionLink to="/catalog" end>
        Каталог
      </SectionLink>
      <SectionLink to={compareTo}>
        Сравнение решений
        <AnimatePresence>
          {selection.items.length > 0 && (
            <motion.span
              key="count"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={SPRING}
              className="num flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-ink px-1 text-[10.5px] text-white"
            >
              {selection.items.length}
            </motion.span>
          )}
        </AnimatePresence>
      </SectionLink>
    </nav>
  )
}

/* Вкладка проекта как в браузере: плавно появляется, уезжает при закрытии, соседние сдвигаются следом. */
function Tab({ tab, active, order }: { tab: ProjectTab; active: boolean; order: string }) {
  const project = useProject(tab.id)
  const navigate = useNavigate()
  const close = useProjectTabs((s) => s.close)
  const gone = project.isError && parseApiProblem(project.error).status === 404
  useEffect(() => {
    if (gone) close(tab.id)
  }, [gone, close, tab.id])
  const score = project.data?.data_quality.score
  const Icon = iconOf(project.data?.object_type)
  const onClose = () => {
    const next = close(tab.id)
    if (active) navigate(next ? next.path : '/projects')
  }
  return (
    <motion.div
      layout="position"
      // Раскладка анимируется только когда меняется набор вкладок; смена маршрута и прокрутки её не трогает.
      layoutDependency={order}
      initial={{ opacity: 0, y: -6, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.16 } }}
      transition={SPRING}
      className={cn(
        'group relative flex h-9 max-w-64 min-w-36 shrink items-center rounded-[10px]',
        !active && 'text-ink-2 hover:text-ink',
      )}
      role="tab"
      aria-selected={active}
    >
      {active ? (
        <ActiveMark variant="tab" />
      ) : (
        <span className="absolute inset-0 rounded-[10px] bg-black/4 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.03)] transition-colors group-hover:bg-black/7" />
      )}
      <Link
        to={tab.path}
        className="relative z-10 flex h-full min-w-0 flex-1 items-center gap-2 pr-1 pl-2.5"
        title={project.data?.name}
      >
        <span
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-md transition-colors',
            active ? 'bg-black/5 text-ink-2' : 'text-ink-3',
          )}
        >
          <Icon size={14} />
        </span>
        <span className={cn('truncate text-[13px] font-medium', active && 'text-ink')}>
          {project.data?.name ?? '…'}
        </span>
        <AnimatePresence initial={false}>
          {active && score !== undefined && (
            <motion.span
              key="score"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={SPRING}
              className="hidden shrink-0 items-center gap-1 overflow-hidden text-[12px] text-ink-3 2xl:flex"
            >
              <ConfidenceRing value={score * 100} size={14} />
              <span className="num">{formatPct(score, { share: true, digits: 0 })}</span>
            </motion.span>
          )}
        </AnimatePresence>
      </Link>
      <button
        type="button"
        onClick={onClose}
        aria-label={`Закрыть вкладку «${project.data?.name ?? 'проект'}»`}
        className={cn(
          'relative z-10 mr-1.5 flex size-5 shrink-0 items-center justify-center rounded-md text-ink-4 transition-[opacity,background-color,color] hover:bg-black/8 hover:text-ink',
          active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        )}
      >
        <X size={13} />
      </button>
    </motion.div>
  )
}

/* «+» открывает список проектов: уже открытые отмечены, клик по любому открывает или переключает вкладку.
   Внизу — создание нового проекта: переход на «Проекты» с открытой модалкой. */
function AddProjectMenu({ openIds }: { openIds: Set<string> }) {
  const [open, setOpen] = useState(false)
  const projects = useProjects()
  const tabs = useProjectTabs((s) => s.tabs)
  const navigate = useNavigate()
  const items = projects.data?.items ?? []
  const go = (id: string) => {
    setOpen(false)
    navigate(tabs.find((t) => t.id === id)?.path ?? `/projects/${id}`)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <motion.button
          layout
          type="button"
          whileTap={{ scale: 0.92 }}
          transition={SPRING}
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-[10px] text-ink-3 transition-colors hover:bg-black/5 hover:text-ink',
            open && 'bg-black/6 text-ink',
          )}
          aria-label="Открыть проект"
        >
          <motion.span animate={{ rotate: open ? 45 : 0 }} transition={SPRING} className="flex">
            <Plus size={16} />
          </motion.span>
        </motion.button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-80 gap-0 overflow-hidden rounded-[14px] p-0 shadow-float"
      >
        <div className="px-4 pt-3.5 pb-2">
          <div className="text-[13.5px] font-semibold">Открыть проект</div>
          <div className="meta">Уже открытые отмечены галочкой</div>
        </div>
        <div className="scroll-thin max-h-72 overflow-y-auto px-1.5 pb-1.5">
          {projects.isPending && <div className="meta px-2.5 py-3">Загружаем проекты…</div>}
          {projects.data && items.length === 0 && <div className="meta px-2.5 py-3">Проектов пока нет</div>}
          {items.map((project, i) => {
            const Icon = iconOf(project.object_type)
            const isOpen = openIds.has(project.id)
            return (
              <motion.button
                key={project.id}
                type="button"
                onClick={() => go(project.id)}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...SPRING, delay: Math.min(i, 8) * 0.025 }}
                className="flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition-colors hover:bg-black/4"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-black/5 text-ink-2">
                  <Icon size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{project.name}</span>
                  <span className="block truncate text-[12px] text-ink-3">
                    {OBJECT_TYPE_LABEL[project.object_type]} · {formatDateTime(project.updated_at)}
                  </span>
                </span>
                {isOpen && <Check size={15} className="shrink-0 text-ok" />}
              </motion.button>
            )
          })}
        </div>
        <div className="border-t border-line bg-surface-2 p-1.5">
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              navigate('/projects?new=1')
            }}
            className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-ink px-3 py-2.5 text-[13.5px] font-medium text-white transition-colors hover:bg-[#2a2a2f]"
          >
            <Plus size={15} /> Добавить проект
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function ProjectTabs({ activeId }: { activeId?: string }) {
  const tabs = useProjectTabs((s) => s.tabs)
  const visit = useProjectTabs((s) => s.visit)
  const { pathname } = useLocation()
  const order = tabs.map((t) => t.id).join(',')
  useEffect(() => {
    if (activeId) visit(activeId, pathname)
  }, [activeId, pathname, visit])
  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]"
      role="tablist"
      aria-label="Открытые проекты"
    >
      <AnimatePresence initial={false} mode="popLayout">
        {tabs.map((tab) => (
          <Tab key={tab.id} tab={tab} active={tab.id === activeId} order={order} />
        ))}
      </AnimatePresence>
      <AddProjectMenu openIds={new Set(tabs.map((t) => t.id))} />
    </div>
  )
}

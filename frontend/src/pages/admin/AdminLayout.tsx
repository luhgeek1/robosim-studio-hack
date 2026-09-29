import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpRight, BarChart3, BookMarked, Boxes, FileClock, Scale, Users } from 'lucide-react'
import { Link, NavLink, useLocation, useOutlet } from 'react-router'
import { useSystemVersion } from '@/entities/reference'
import { useProposalQueue } from '@/entities/vendor'
import { cn } from '@/shared/lib/utils'
import { SPRING } from './motion'
import { SlideHighlight, SlideMark } from '@/shared/ui/slide-highlight'

const TABS = [
  { to: '/admin', label: 'Обзор', icon: BarChart3, end: true },
  { to: '/admin/catalog', label: 'Каталог', icon: Boxes },
  { to: '/admin/proposals', label: 'Заявки', icon: FileClock },
  { to: '/admin/norms', label: 'Нормативы', icon: Scale },
  { to: '/admin/reference', label: 'Справочники', icon: BookMarked },
  { to: '/admin/users', label: 'Пользователи', icon: Users },
]

export function AdminLayout() {
  const { pathname } = useLocation()
  const outlet = useOutlet()
  const version = useSystemVersion()
  const pending = useProposalQueue('pending').data?.total ?? 0

  return (
    <div className="mx-auto w-full max-w-300 px-6 pt-12 pb-20">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <h1 className="display text-[44px] leading-[1.05] tracking-[-0.035em]">Админ-панель</h1>
        {version.data && (
          <div className="flex items-center gap-4 text-[12.5px] text-ink-3">
            <span>
              каталог <span className="num font-medium text-ink">{version.data.catalog_version}</span>
            </span>
            <span>
              нормативы <span className="num font-medium text-ink">{version.data.norm_set_version}</span>
            </span>
          </div>
        )}
      </div>

      <nav className="mb-8 flex items-center justify-between gap-4 border-b border-line" aria-label="Разделы админки">
        <div className="relative flex items-center gap-1">
          <SlideHighlight className="z-10 rounded-full bg-ink" transition={SPRING} />
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  'relative flex h-11 items-center gap-2 px-3 text-[14px] font-medium transition-colors',
                  isActive ? 'text-ink' : 'text-ink-3 hover:text-ink-2',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <tab.icon size={15} className={isActive ? 'text-ink' : 'text-ink-4'} />
                  {tab.label}
                  {tab.to === '/admin/proposals' && pending > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={SPRING}
                      className="num flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-signal px-1 text-[10.5px] text-white"
                      title="Заявок на модерации"
                    >
                      {pending}
                    </motion.span>
                  )}
                  {isActive && <SlideMark className="absolute inset-x-2 -bottom-px h-0.5" />}
                </>
              )}
            </NavLink>
          ))}
        </div>
        <Link
          to="/robots-3d"
          className="flex items-center gap-1 text-[13px] font-medium text-ink-3 transition-colors hover:text-ink"
        >
          3D-модели каталога <ArrowUpRight size={14} />
        </Link>
      </nav>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          {outlet}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

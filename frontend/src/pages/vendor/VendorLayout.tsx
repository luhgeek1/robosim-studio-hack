import { AnimatePresence, motion } from 'framer-motion'
import { Building2, FileClock, LayoutDashboard, Package } from 'lucide-react'
import { NavLink, useLocation, useOutlet } from 'react-router'
import { useSystemVersion } from '@/entities/reference'
import { useVendorOverview } from '@/entities/vendor'
import { parseApiProblem } from '@/shared/api/problem'
import { cn } from '@/shared/lib/utils'
import { SlideHighlight, SlideMark } from '@/shared/ui/slide-highlight'
import { EmptyState, ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { SPRING } from '@/pages/admin/motion'

const TABS = [
  { to: '/vendor', label: 'Обзор', icon: LayoutDashboard, end: true },
  { to: '/vendor/products', label: 'Продукты', icon: Package },
  { to: '/vendor/proposals', label: 'Заявки', icon: FileClock },
]

export function VendorLayout() {
  const { pathname } = useLocation()
  const outlet = useOutlet()
  const overview = useVendorOverview()
  const version = useSystemVersion()

  if (overview.isPending) return <LoadingBlock className="p-8" label="Открываем кабинет…" />
  if (overview.isError) {
    const problem = parseApiProblem(overview.error)
    return (
      <div className="mx-auto w-full max-w-300 px-6 pt-12 pb-20">
        {problem.status === 409 ? (
          <EmptyState
            icon={<Building2 size={22} />}
            title="Учётная запись не привязана к компании"
            description="Кабинет показывает продукты одной компании каталога. Попросите администратора платформы выбрать её в разделе «Пользователи»."
          />
        ) : (
          <ErrorBlock error={overview.error} onRetry={() => overview.refetch()} />
        )}
      </div>
    )
  }

  const { manufacturer } = overview.data
  const pending = overview.data.proposals_by_status.pending ?? 0

  return (
    <div className="mx-auto w-full max-w-300 px-6 pt-12 pb-20">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="hud mb-3 flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-signal" aria-hidden />
            Кабинет производителя · {manufacturer.country ?? 'RU'}
          </div>
          <h1 className="display truncate text-[44px] leading-[1.05] tracking-[-0.035em]">{manufacturer.name}</h1>
        </div>
        {version.data && (
          <div className="text-[12.5px] text-ink-3">
            каталог <span className="num font-medium text-ink">{version.data.catalog_version}</span>
          </div>
        )}
      </div>

      <nav className="mb-8 flex items-center gap-4 border-b border-line" aria-label="Разделы кабинета">
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
                  {tab.to === '/vendor/proposals' && pending > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={SPRING}
                      className="num flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-black/8 px-1 text-[10.5px] text-ink-2"
                      title="На модерации"
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

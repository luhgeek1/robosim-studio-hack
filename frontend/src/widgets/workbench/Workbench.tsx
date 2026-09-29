import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, PanelBottom, PanelLeft, PanelRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'
import { PulseDot } from '@/shared/ui/kinetics'

/* Раздел боковой панели как в VS Code: заголовок моноширинным верхним регистром, сворачивается по клику. */
export function PaneSection({
  title,
  aside,
  children,
  defaultOpen = true,
  className,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={cn('border-b border-line last:border-b-0', className)}>
      <div className="flex h-8 items-center gap-1 pr-2 pl-1.5">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="hud flex min-w-0 flex-1 items-center gap-1 rounded-[6px] py-1 text-left text-ink-2 transition-colors hover:text-ink"
        >
          <ChevronRight size={13} className={cn('shrink-0 transition-transform duration-200', open && 'rotate-90')} />
          <span className="truncate">{title}</span>
        </button>
        {aside && <div className="flex shrink-0 items-center gap-1 text-ink-3">{aside}</div>}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pt-0.5 pb-3.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

export function PaneTitle({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-9 shrink-0 items-center border-b border-line px-3.5 text-[12.5px] font-semibold tracking-[-0.01em]">
      {children}
    </div>
  )
}

export type Panels = { left: boolean; right: boolean; bottom: boolean }

/* Строка состояния внизу рабочей области: статус прогона слева, живые числа и переключатели панелей справа. */
export function StatusBar({
  status,
  live,
  items,
  metrics,
  panels,
  onToggle,
  labels = { left: 'Левая панель', bottom: 'Нижняя панель', right: 'Правая панель' },
  toggles: shown = ['left', 'bottom', 'right'],
}: {
  status: string
  live: boolean
  items: ReactNode[]
  metrics: ReactNode[]
  panels: Panels
  onToggle: (key: keyof Panels) => void
  labels?: Record<keyof Panels, string>
  toggles?: (keyof Panels)[]
}) {
  const toggles: { key: keyof Panels; icon: typeof PanelLeft; label: string }[] = [
    { key: 'left', icon: PanelLeft, label: labels.left },
    { key: 'bottom', icon: PanelBottom, label: labels.bottom },
    { key: 'right', icon: PanelRight, label: labels.right },
  ]
  return (
    <footer className="col-span-full flex h-7 items-center gap-4 bg-ink px-3 font-mono text-[11px] tracking-[0.04em] text-white/70 uppercase">
      <span className="flex items-center gap-2 text-white">
        {live ? <PulseDot /> : <span className="size-1.5 rounded-full bg-white/50" />}
        {status}
      </span>
      {items.map((item, i) => (
        <span key={i} className="hidden truncate md:inline">
          {item}
        </span>
      ))}
      <span className="ml-auto flex items-center gap-4">
        {metrics.map((item, i) => (
          <span key={i} className="num whitespace-nowrap text-white">
            {item}
          </span>
        ))}
        <span className="flex items-center gap-0.5 border-l border-white/15 pl-2">
          {toggles
            .filter(({ key }) => shown.includes(key))
            .map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => onToggle(key)}
                aria-pressed={panels[key]}
                aria-label={label}
                title={label}
                className={cn(
                  'flex size-5 items-center justify-center rounded-[4px] transition-colors hover:bg-white/15',
                  panels[key] ? 'text-white' : 'text-white/40',
                )}
              >
                <Icon size={13} />
              </button>
            ))}
        </span>
      </span>
    </footer>
  )
}

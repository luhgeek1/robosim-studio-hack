import { HeartPulse, PackageOpen, Plane, Warehouse } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { DEMO_PROJECTS, demoUrl } from '@/entities/demo/navigation'
import { useDemoWorkspace } from '@/entities/demo/workspace'
import { useSession } from '@/entities/session'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'

const ICONS = [Warehouse, PackageOpen, HeartPulse, Plane]

export function GuestProjectTabs({ demoKey, inProject }: { demoKey: string; inProject: boolean }) {
  const steps = useDemoWorkspace((s) => s.steps)
  const visit = useDemoWorkspace((s) => s.visit)
  const strip = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = strip.current
    const reveal = () => {
      const active = el?.querySelector<HTMLElement>('[data-selected="true"]')
      if (!el || !active) return
      if (active.offsetLeft < el.scrollLeft) el.scrollLeft = active.offsetLeft
      else if (active.offsetLeft + active.offsetWidth > el.scrollLeft + el.clientWidth)
        el.scrollLeft = active.offsetLeft + active.offsetWidth - el.clientWidth
    }
    reveal()
    const observer = new ResizeObserver(reveal)
    if (el) observer.observe(el)
    return () => observer.disconnect()
  }, [demoKey])
  return (
    <nav
      ref={strip}
      className="relative flex min-w-0 gap-1 overflow-x-auto overscroll-x-contain px-px py-0.5 [scrollbar-width:none]"
      aria-label="Демо-проекты"
    >
      {DEMO_PROJECTS.map((demo, i) => {
        const Icon = ICONS[i]
        const selected = demo.key === demoKey
        return (
          <Link
            key={demo.key}
            to={demoUrl(demo.key, steps[demo.key] ?? 'object')}
            onClick={(event) => {
              if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0)
                visit(demo.key, steps[demo.key] ?? 'object')
            }}
            data-selected={selected}
            aria-current={selected && inProject ? 'page' : undefined}
            className={cn(
              'relative flex h-9 shrink-0 items-center justify-center gap-2 rounded-[10px] px-3 text-[12px] font-medium whitespace-nowrap transition-colors xl:flex-1',
              selected
                ? 'bg-white/10 text-ink ring-1 ring-white/8'
                : 'bg-white/3 text-ink-3 hover:bg-white/6 hover:text-ink',
            )}
          >
            <Icon size={14} className={cn('shrink-0', selected && 'text-[#ff996e]')} />
            {demo.label}
          </Link>
        )
      })}
    </nav>
  )
}

export function GuestHeaderActions({ demoKey }: { demoKey: string }) {
  const { status } = useSession()
  const from = demoUrl(demoKey, 'report')
  return (
    <>
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="hidden text-[#e6ebdf] hover:bg-white/10 hover:text-white sm:inline-flex"
      >
        <Link to={status === 'authenticated' ? '/projects' : '/login'} state={{ from }}>
          {status === 'authenticated' ? 'Мои проекты' : 'Войти'}
        </Link>
      </Button>
      <Button asChild size="sm">
        <Link to={status === 'authenticated' ? '/projects?new=1' : '/login?mode=register'} state={{ from }}>
          Свой проект
        </Link>
      </Button>
    </>
  )
}

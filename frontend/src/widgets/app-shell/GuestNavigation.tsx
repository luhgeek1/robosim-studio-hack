import { Check, ChevronDown, HeartPulse, PackageOpen, Plane, Warehouse } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { DEMO_PROJECTS, demoUrl } from '@/entities/demo/navigation'
import { useDemoWorkspace } from '@/entities/demo/workspace'
import { useSession } from '@/entities/session'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'

const ICONS = [Warehouse, PackageOpen, HeartPulse, Plane]

export function GuestProjectMenu({ demoKey }: { demoKey: string }) {
  const steps = useDemoWorkspace((s) => s.steps)
  const visit = useDemoWorkspace((s) => s.visit)
  const { status } = useSession()
  const current = DEMO_PROJECTS.find((demo) => demo.key === demoKey) ?? DEMO_PROJECTS[0]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Демо-проекты: ${current.label}`}
          className="flex h-10 min-w-0 w-full items-center gap-1.5 rounded-lg bg-white/6 px-2.5 text-[13px] font-medium text-ink"
        >
          <span className="min-w-0 flex-1 truncate text-left">{current.label}</span>
          <ChevronDown size={14} className="shrink-0 text-ink-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64 max-w-[calc(100vw-2rem)]" align="start">
        {DEMO_PROJECTS.map((demo, index) => {
          const Icon = ICONS[index]
          return (
            <DropdownMenuItem key={demo.key} asChild>
              <Link
                to={demoUrl(demo.key, steps[demo.key] ?? 'object')}
                onClick={() => visit(demo.key, steps[demo.key] ?? 'object')}
              >
                <Icon /> <span className="flex-1">{demo.label}</span>
                {demo.key === demoKey && <Check className="text-ok" />}
              </Link>
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/catalog">Каталог решений</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to={status === 'authenticated' ? '/projects' : '/login'}>
            {status === 'authenticated' ? 'Мои проекты' : 'Войти в аккаунт'}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

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

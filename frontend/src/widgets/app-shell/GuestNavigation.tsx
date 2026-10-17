import { Check, ChevronDown, Warehouse } from 'lucide-react'
import { Link } from 'react-router'
import { useDemoList } from '@/entities/demo/api'
import { demoUrl } from '@/entities/demo/navigation'
import { useSession } from '@/entities/session'
import { Button } from '@/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu'

export function GuestProjectTab({ demoKey }: { demoKey: string }) {
  const examples = useDemoList()
  const current = examples.data?.find((d) => d.key === demoKey)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-full min-w-0 max-w-80 overflow-hidden items-center gap-2 rounded-[10px] bg-white/10 px-3 text-[13px] text-ink ring-1 ring-white/8"
          aria-label="Выбрать демо-объект"
        >
          <Warehouse size={15} className="shrink-0 text-[#ff996e]" />
          <span className="truncate">{current?.name ?? 'Демонстрационный проект'}</span>
          <span className="hidden shrink-0 text-[10px] text-ink-3 sm:inline">ДЕМО</span>
          <ChevronDown size={12} className="shrink-0 text-ink-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-[calc(100vw-2rem)] w-80">
        {examples.data?.map((item) => (
          <DropdownMenuItem asChild key={item.key}>
            <Link to={demoUrl(item.key, 'object')}>
              <span className="min-w-0 flex-1">
                <span className="block">{item.name}</span>
                <span className="mt-1 block text-[11px] text-ink-3">
                  {item.object_type === 'warehouse'
                    ? 'Склад'
                    : item.object_type === 'hospital'
                      ? 'Больница'
                      : 'Аэропорт'}
                </span>
              </span>
              {item.key === demoKey && <Check className="size-4" />}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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

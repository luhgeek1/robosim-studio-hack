import { Building2, Check, ChevronDown, ChevronRight, LockKeyhole, LogOut, Plus, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { ROLE_LABEL, initialOf, useWorkspace } from '@/entities/organization'
import { useSession } from '@/entities/session'
import { CreateOrganizationDialog } from '@/features/organization-create'
import { pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'

function Avatar({ letter, shared, size = 'sm' }: { letter: string; shared: boolean; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center font-semibold',
        size === 'sm' ? 'size-6 rounded-[7px] text-[11.5px]' : 'size-8 rounded-[10px] text-sm ring-1 ring-white/10',
        size === 'md'
          ? 'bg-[#ff956e]/15 text-[#ffab88]'
          : shared
            ? 'bg-[#293831] text-white'
            : 'bg-signal/15 text-signal',
      )}
      aria-hidden
    >
      {letter}
    </span>
  )
}

/* Меню профиля с переключателем рабочих областей: личное пространство и организации пользователя.
   Выбор меняет содержимое сайта — список проектов, вкладки и куда создаются новые проекты. */
export function WorkspaceMenu() {
  const { status, user, logout } = useSession()
  const workspace = useWorkspace()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [creating, setCreating] = useState(false)
  if (status === 'restoring') return null
  if (!user) {
    return (
      <Button asChild size="sm">
        <Link to="/login">Войти</Link>
      </Button>
    )
  }

  const current = workspace.organization
  const switchTo = (id: string | null) => {
    workspace.select(id)
    // Открытый проект или страница организации принадлежат прежней области — уходим к её списку проектов.
    if (pathname.startsWith('/projects/') || pathname.startsWith('/organizations/')) navigate('/projects')
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Профиль и рабочие области"
            className="group/profile h-9 gap-2 rounded-xl bg-white/4 pr-2.5 pl-1.5 text-ink-2 transition-colors hover:bg-white/8 data-[state=open]:bg-white/10 data-[state=open]:ring-1 data-[state=open]:ring-white/12"
          >
            <Avatar letter={initialOf(current?.name ?? user.name ?? user.email)} shared={!!current} />
            <span className="hidden max-w-40 truncate text-[13px] font-medium text-ink xl:inline">
              {current?.name ?? (user.name || user.email)}
            </span>
            <ChevronDown className="size-3.5 text-ink-4 transition-transform duration-200 group-data-[state=open]/profile:rotate-180" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={6}
          collisionPadding={12}
          aria-label="Профиль и рабочие области"
          className="w-72 max-w-[calc(100vw-24px)] rounded-2xl p-1.5 shadow-float ring-1 ring-black/6"
        >
          <DropdownMenuLabel className="relative overflow-hidden rounded-[10px] bg-[#222d29] px-3 py-2.5 font-normal">
            <span
              aria-hidden
              className="pointer-events-none absolute -top-10 -right-6 size-28 rounded-full border border-white/5 bg-white/3"
            />
            <div className="relative flex items-center gap-2.5">
              <Avatar letter={initialOf(user.name || user.email)} shared={false} size="md" />
              <div className="min-w-0 flex-1">
                <div
                  className="min-w-0 text-[12.5px] font-semibold wrap-anywhere text-[#f1f4ec] lg:truncate"
                  title={user.name || user.email}
                >
                  {user.name || user.email}
                </div>
                <div className="mt-0.5 min-w-0 text-[11px] wrap-anywhere text-[#b7c4b9] lg:truncate" title={user.email}>
                  {user.email}
                </div>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuLabel className="px-2 pt-2.5 pb-1.5 text-[9.5px] font-medium tracking-[0.1em] text-ink-3 uppercase">
            Рабочая область
          </DropdownMenuLabel>
          <DropdownMenuGroup aria-label="Рабочая область" className="space-y-0.5">
            <WorkspaceItem
              title="Личное пространство"
              subtitle="Проекты видны только вам"
              active={!current}
              onSelect={() => switchTo(null)}
            />
            {workspace.organizations.map((org) => (
              <WorkspaceItem
                key={org.id}
                shared
                title={org.name}
                subtitle={`${ROLE_LABEL[org.role]} · ${org.members_count} ${pluralRu(org.members_count, ['участник', 'участника', 'участников'])}`}
                active={current?.id === org.id}
                onSelect={() => switchTo(org.id)}
              />
            ))}
          </DropdownMenuGroup>
          <DropdownMenuItem
            onSelect={() => setCreating(true)}
            textValue="Создать организацию"
            className="mt-1.5 cursor-pointer gap-2.5 rounded-[10px] border border-dashed border-line px-2 py-1.5 text-[12.5px] text-ink-2 transition-colors"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-3">
              <Plus className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1 font-medium">Создать организацию</span>
            <ChevronRight className="size-3 text-ink-4" />
          </DropdownMenuItem>
          {current && (
            <DropdownMenuItem
              onSelect={() => navigate(`/organizations/${current.id}`)}
              className="mt-0.5 cursor-pointer gap-2.5 rounded-[10px] px-2 py-1.5 text-[12px] text-ink-2 transition-colors"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-3">
                <Users className="size-3.5" />
              </span>
              <span className="flex-1">Участники и приглашения</span>
              <ChevronRight className="size-3 text-ink-4" />
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator className="mx-1 mt-1.5 mb-1" />
          <DropdownMenuItem
            variant="destructive"
            className="cursor-pointer gap-2.5 rounded-[10px] px-2.5 py-2 text-[12px] transition-colors"
            onSelect={async () => {
              await logout()
              navigate('/login')
            }}
          >
            <LogOut className="size-3.5" /> Выйти из аккаунта
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateOrganizationDialog open={creating} onOpenChange={setCreating} />
    </>
  )
}

function WorkspaceItem({
  title,
  subtitle,
  active,
  shared = false,
  onSelect,
}: {
  title: string
  subtitle: string
  active: boolean
  shared?: boolean
  onSelect: () => void
}) {
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      textValue={title}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'cursor-pointer gap-2.5 rounded-[10px] border px-2 py-2 transition-colors',
        active ? 'border-signal/20 bg-signal/5' : 'border-transparent',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-lg',
          active ? 'bg-signal-soft text-signal' : 'bg-surface-2 text-ink-3',
        )}
      >
        {shared ? <Building2 className="size-3.5" /> : <LockKeyhole className="size-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block min-w-0 text-[12px] font-medium wrap-anywhere text-ink lg:truncate" title={title}>
          {title}
        </span>
        <span className="mt-0.5 block min-w-0 text-[10.5px] wrap-anywhere text-ink-3 lg:truncate" title={subtitle}>
          {subtitle}
        </span>
      </span>
      {active && (
        <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-signal/10 text-signal">
          <Check className="size-2.5" />
          <span className="sr-only">Текущая рабочая область</span>
        </span>
      )}
    </DropdownMenuItem>
  )
}

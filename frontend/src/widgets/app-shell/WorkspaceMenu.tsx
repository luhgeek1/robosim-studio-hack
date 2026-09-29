import { Check, ChevronsUpDown, LogOut, Plus, Users } from 'lucide-react'
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
        size === 'sm' ? 'size-6 rounded-[7px] text-[11.5px]' : 'size-8 rounded-[9px] text-[13px]',
        shared ? 'bg-ink text-white' : 'bg-black/6 text-ink-2',
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
          <Button variant="ghost" size="sm" className="h-9 gap-2 pr-2 pl-1.5 text-ink-2">
            <Avatar letter={initialOf(current?.name ?? user.name ?? user.email)} shared={!!current} />
            <span className="hidden max-w-40 truncate text-[13px] font-medium text-ink xl:inline">
              {current?.name ?? (user.name || user.email)}
            </span>
            <ChevronsUpDown className="text-ink-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="space-y-0.5">
            <div className="truncate">{user.name || user.email}</div>
            <div className="truncate text-xs font-normal text-ink-3">{user.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="pb-1 text-[11.5px] font-medium text-ink-3">Рабочая область</DropdownMenuLabel>
          <WorkspaceItem
            letter={initialOf(user.name || user.email)}
            title="Личное пространство"
            subtitle="Проекты видны только вам"
            active={!current}
            onSelect={() => switchTo(null)}
          />
          {workspace.organizations.map((org) => (
            <WorkspaceItem
              key={org.id}
              shared
              letter={initialOf(org.name)}
              title={org.name}
              subtitle={`${ROLE_LABEL[org.role]} · ${org.members_count} ${pluralRu(org.members_count, ['участник', 'участника', 'участников'])}`}
              active={current?.id === org.id}
              onSelect={() => switchTo(org.id)}
            />
          ))}
          <DropdownMenuItem onSelect={() => setCreating(true)} className="text-ink-2">
            <Plus /> Создать организацию
          </DropdownMenuItem>
          {current && (
            <DropdownMenuItem onSelect={() => navigate(`/organizations/${current.id}`)} className="text-ink-2">
              <Users /> Участники и приглашения
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={async () => {
              await logout()
              navigate('/login')
            }}
          >
            <LogOut /> Выйти
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateOrganizationDialog open={creating} onOpenChange={setCreating} />
    </>
  )
}

function WorkspaceItem({
  letter,
  title,
  subtitle,
  active,
  shared = false,
  onSelect,
}: {
  letter: string
  title: string
  subtitle: string
  active: boolean
  shared?: boolean
  onSelect: () => void
}) {
  return (
    <DropdownMenuItem onSelect={onSelect} className="gap-2.5 py-1.5">
      <Avatar letter={letter} shared={shared} size="md" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-ink">{title}</span>
        <span className="block truncate text-[12px] text-ink-3">{subtitle}</span>
      </span>
      {active && <Check className="text-ok" />}
    </DropdownMenuItem>
  )
}

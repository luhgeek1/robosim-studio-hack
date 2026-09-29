import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Search, UserX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ROLE_LABEL, useAdminUsers, useUpdateUser } from '@/entities/admin'
import { useSession } from '@/entities/session'
import { useManufacturers } from '@/entities/vendor'
import type { Role, User } from '@/shared/api/types'
import { formatDateTime, formatNumber } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { EmptyState, ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { Switch } from '@/shared/ui/switch'
import { Segmented } from '@/shared/ui/v0'
import { stagger } from './motion'

const PAGE_SIZE = 20
const ROLES: Role[] = ['user', 'vendor', 'admin']
const ALL = 'all'
const SEARCH_DEBOUNCE_MS = 300

export function UsersTab() {
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [role, setRole] = useState<string>(ALL)
  const [page, setPage] = useState(1)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(search.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [search])

  const users = useAdminUsers({
    q: q || undefined,
    role: role === ALL ? undefined : role,
    page,
    page_size: PAGE_SIZE,
  })
  const total = users.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-80 max-w-full max-sm:w-full">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-4" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Имя или почта"
            className="h-9 rounded-[10px] bg-card pl-9"
            aria-label="Поиск пользователя"
          />
        </div>
        <Segmented
          size="sm"
          value={role}
          onChange={(value) => {
            setRole(value)
            setPage(1)
          }}
          options={[
            { value: ALL, label: 'Все' },
            { value: 'user', label: 'Пользователи' },
            { value: 'vendor', label: 'Вендоры' },
            { value: 'admin', label: 'Администраторы' },
          ]}
        />
      </div>

      {users.isPending && <LoadingBlock label="Загружаем пользователей…" />}
      {users.isError && <ErrorBlock error={users.error} onRetry={() => users.refetch()} />}
      {users.data && users.data.items.length === 0 && (
        <EmptyState icon={<UserX size={22} />} title="Никого не нашли" description="Измените запрос или роль." />
      )}
      {users.data && users.data.items.length > 0 && (
        <>
          <div className="card overflow-hidden">
            {/* Роль и доступ стоят справа от имени: на узком экране строка листается вбок внутри карточки. */}
            <div className="scroll-thin overflow-x-auto overscroll-x-contain">
              <div className="min-w-[740px]">
                <div className="grid grid-cols-[minmax(0,1fr)_220px_150px_96px] items-center gap-4 border-b border-line bg-surface-2 px-5 py-2.5 text-[12px] text-ink-3">
                  <span>Пользователь</span>
                  <span>Роль</span>
                  <span>Последний вход</span>
                  <span className="text-right">Доступ</span>
                </div>
                <ul className="divide-y divide-line">
                  <AnimatePresence initial={false}>
                    {users.data.items.map((user, i) => (
                      <UserRow key={user.id} user={user} index={i} />
                    ))}
                  </AnimatePresence>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-[12.5px] text-ink-3">
            <span className="num">
              {formatNumber((page - 1) * PAGE_SIZE + 1)}–{formatNumber(Math.min(page * PAGE_SIZE, total))} из{' '}
              {formatNumber(total)}
            </span>
            {pages > 1 && (
              <span className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  aria-label="Предыдущая страница"
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={page >= pages}
                  onClick={() => setPage(page + 1)}
                  aria-label="Следующая страница"
                >
                  <ChevronRight />
                </Button>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function initials(user: User) {
  const source = user.name?.trim() || user.email
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function UserRow({ user, index }: { user: User; index: number }) {
  const session = useSession()
  const update = useUpdateUser()
  const self = session.user?.id === user.id
  const active = user.is_active !== false

  const save = (body: { role?: Role; is_active?: boolean; vendor_manufacturer_id?: string | null }, message: string) =>
    update.mutate({ id: user.id, body }, { onSuccess: () => toast.success(message) })

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={stagger(index)}
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_220px_150px_96px] items-center gap-4 px-5 py-3 transition-opacity',
        !active && 'opacity-55',
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full text-[12.5px] font-semibold',
            user.role === 'admin' ? 'bg-ink text-white' : 'bg-black/6 text-ink-2',
          )}
        >
          {initials(user)}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-[14px] font-medium">
            <span className="truncate">{user.name || user.email}</span>
            {self && <span className="shrink-0 text-[11.5px] font-normal text-ink-3">это вы</span>}
          </span>
          <span className="block truncate text-[12.5px] text-ink-3">
            {user.email}
            {user.organization ? ` · ${user.organization}` : ''}
          </span>
        </span>
      </span>
      <span className="min-w-0 space-y-1.5">
        <Select
          value={user.role}
          disabled={self || update.isPending}
          onValueChange={(role) => save({ role: role as Role }, `Роль изменена: ${ROLE_LABEL[role as Role]}`)}
        >
          <SelectTrigger size="sm" className="h-8 w-full rounded-[9px] bg-card" aria-label="Роль">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {ROLE_LABEL[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {user.role === 'vendor' && (
          <VendorCompany
            value={user.vendor_manufacturer_id ?? null}
            disabled={update.isPending}
            onChange={(id, name) =>
              save({ vendor_manufacturer_id: id }, id ? `Вендор привязан: ${name}` : 'Привязка к компании снята')
            }
          />
        )}
      </span>
      <span className="num text-[12.5px] text-ink-3">
        {user.last_login_at ? formatDateTime(user.last_login_at) : 'не входил'}
      </span>
      <span className="flex items-center justify-end gap-2">
        <span className="text-[12px] text-ink-3">{active ? 'открыт' : 'закрыт'}</span>
        <Switch
          checked={active}
          disabled={self || update.isPending}
          onCheckedChange={(checked) =>
            save({ is_active: checked }, checked ? 'Доступ открыт' : 'Доступ закрыт, сессии завершены')
          }
          aria-label={active ? 'Закрыть доступ' : 'Открыть доступ'}
        />
      </span>
    </motion.li>
  )
}

const NO_COMPANY = 'none'

/* Вендор говорит от лица одной компании каталога: кабинет показывает и правит только её продукты. */
function VendorCompany({
  value,
  disabled,
  onChange,
}: {
  value: string | null
  disabled: boolean
  onChange: (id: string | null, name: string) => void
}) {
  const manufacturers = useManufacturers()
  const items = manufacturers.data ?? []
  return (
    <Select
      value={value ?? NO_COMPANY}
      disabled={disabled || manufacturers.isPending}
      onValueChange={(id) =>
        id === NO_COMPANY ? onChange(null, '') : onChange(id, items.find((m) => m.id === id)?.name ?? '')
      }
    >
      <SelectTrigger
        size="sm"
        className={cn('h-8 w-full rounded-[9px] bg-card text-[12.5px]', !value && 'text-crit')}
        aria-label="Компания вендора"
      >
        <SelectValue placeholder="Компания" />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        <SelectItem value={NO_COMPANY}>Не привязан к компании</SelectItem>
        {items.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

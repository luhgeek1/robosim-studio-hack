import { AnimatePresence, motion, type Transition } from 'framer-motion'
import { Bell, BellOff } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import {
  initialOf,
  quoted,
  useAcceptInvitation,
  useDeclineInvitation,
  useIncomingInvitations,
  useWorkspaceStore,
} from '@/entities/organization'
import { useSession } from '@/entities/session'
import type { IncomingInvitation } from '@/shared/api/types'
import { formatDateTime } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { Spinner } from '@/shared/ui/states'

const SPRING: Transition = { type: 'spring', stiffness: 520, damping: 42, mass: 0.8 }

/* Колокольчик в шапке: приглашения в организации с ответом в один клик. Поповер, а не отдельная страница —
   приглашений обычно одно-два, и отвечать на них удобно, не уходя с текущего экрана. */
export function Notifications() {
  const { user } = useSession()
  const [open, setOpen] = useState(false)
  const invitations = useIncomingInvitations()
  if (!user) return null
  const items = invitations.data ?? []
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'relative flex size-8 shrink-0 items-center justify-center rounded-[10px] text-ink-3 transition-colors hover:bg-black/5 hover:text-ink',
            open && 'bg-black/6 text-ink',
          )}
          aria-label={items.length ? `Уведомления: ${items.length}` : 'Уведомления'}
        >
          <Bell size={16} />
          <AnimatePresence>
            {items.length > 0 && (
              <motion.span
                key="count"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={SPRING}
                className="num absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-crit px-1 text-[10px] text-white ring-2 ring-canvas"
              >
                {items.length}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-96 gap-0 overflow-hidden rounded-[14px] p-0 shadow-float">
        <div className="px-4 pt-3.5 pb-2">
          <div className="text-[13.5px] font-semibold">Приглашения</div>
          <div className="meta">В организации с общими проектами</div>
        </div>
        <div className="scroll-thin max-h-96 overflow-y-auto px-1.5 pb-1.5">
          {invitations.isPending && <div className="meta px-2.5 py-3">Загружаем…</div>}
          {invitations.data && items.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <BellOff size={18} className="text-ink-4" />
              <div className="text-[13px] text-ink-3">Новых приглашений нет</div>
            </div>
          )}
          <AnimatePresence initial={false}>
            {items.map((invitation) => (
              <InvitationRow key={invitation.id} invitation={invitation} onOpened={() => setOpen(false)} />
            ))}
          </AnimatePresence>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function InvitationRow({ invitation, onOpened }: { invitation: IncomingInvitation; onOpened: () => void }) {
  const accept = useAcceptInvitation()
  const decline = useDeclineInvitation()
  const select = useWorkspaceStore((s) => s.select)
  const navigate = useNavigate()
  const busy = accept.isPending || decline.isPending
  const onAccept = async () => {
    const organization = await accept.mutateAsync(invitation.id)
    toast.success(`Вы в организации ${quoted(organization.name)}`, {
      description: 'Её проекты — в переключателе рабочих областей в меню профиля.',
      action: {
        label: 'Открыть',
        onClick: () => {
          select(organization.id)
          navigate('/projects')
        },
      },
    })
    onOpened()
  }
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }}
      transition={SPRING}
      className="flex gap-3 rounded-[10px] px-2.5 py-2.5 transition-colors hover:bg-black/3"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-ink text-[13px] font-semibold text-white">
        {initialOf(invitation.organization_name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] leading-snug">
          <span className="font-medium">{invitation.invited_by_name ?? 'Владелец'}</span>
          <span className="text-ink-2"> приглашает в </span>
          <span className="font-medium">{quoted(invitation.organization_name)}</span>
        </div>
        <div className="mt-0.5 truncate text-[12px] text-ink-3">
          {invitation.invited_by_email && `${invitation.invited_by_email} · `}
          {formatDateTime(invitation.created_at)}
        </div>
        <div className="mt-2 flex gap-1.5">
          <Button size="sm" className="h-7 px-3 text-[12.5px]" disabled={busy} onClick={onAccept}>
            {accept.isPending && <Spinner />} Принять
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-3 text-[12.5px]"
            disabled={busy}
            onClick={() => decline.mutate(invitation.id)}
          >
            {decline.isPending && <Spinner />} Отклонить
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

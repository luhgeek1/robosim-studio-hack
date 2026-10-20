import { AnimatePresence, motion, type Transition } from 'framer-motion'
import { Bell, BellCheck, Check, CircleAlert, RefreshCw, X } from 'lucide-react'
import { useId, useState } from 'react'
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
import { formatDateTime, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { Spinner } from '@/shared/ui/states'

const SPRING: Transition = { type: 'spring', stiffness: 520, damping: 42, mass: 0.8 }

export function Notifications() {
  const { user } = useSession()
  const [open, setOpen] = useState(false)
  const headingId = useId()
  const invitations = useIncomingInvitations()
  if (!user || user.role === 'guest') return null
  const items = invitations.data ?? []
  const failed = invitations.isError && items.length === 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'relative flex size-9 shrink-0 items-center justify-center rounded-xl text-ink-3 transition-colors hover:bg-muted/70 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-sm:size-10',
            open && 'bg-muted/70 text-ink',
          )}
          aria-label={
            items.length
              ? 'Уведомления: ' +
                items.length +
                ' ' +
                pluralRu(items.length, ['приглашение', 'приглашения', 'приглашений'])
              : 'Уведомления'
          }
        >
          <Bell className="size-[18px]" aria-hidden="true" />
          <AnimatePresence>
            {items.length > 0 && (
              <motion.span
                key="count"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={SPRING}
                className="num absolute top-0 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal px-1 text-[9px] font-semibold text-white ring-2 ring-canvas"
              >
                {items.length > 99 ? '99+' : items.length}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        collisionPadding={12}
        aria-labelledby={headingId}
        aria-describedby={headingId + '-description'}
        className="max-h-[min(34rem,var(--radix-popover-content-available-height))] w-[25rem] max-w-[calc(100vw-1.5rem)] gap-0 overflow-hidden rounded-2xl bg-surface p-0 shadow-float ring-line/70"
      >
        <header className="flex shrink-0 items-start justify-between gap-2 px-4 pt-4 pb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 id={headingId} className="text-[16px] font-semibold tracking-[-0.015em]">
                Уведомления
              </h2>
              {items.length > 0 && (
                <span className="num rounded-md bg-signal-soft/70 px-1.5 py-0.5 text-[10.5px] font-medium text-signal">
                  {items.length}
                </span>
              )}
            </div>
            <p id={headingId + '-description'} className="mt-0.5 text-[12px] text-ink-3">
              Приглашения в команду
            </p>
          </div>
          <div className="-mt-1 -mr-1 flex shrink-0 gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              title="Обновить уведомления"
              aria-label="Обновить уведомления"
              className="size-8 text-ink-3"
              disabled={invitations.isFetching}
              onClick={() => void invitations.refetch()}
            >
              <RefreshCw className={cn('size-3.5', invitations.isFetching && 'animate-spin')} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Закрыть уведомления"
              className="size-8 text-ink-3"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
        </header>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
          {invitations.isPending && (
            <div role="status" className="flex items-center justify-center gap-2 py-10 text-[12.5px] text-ink-3">
              <Spinner className="size-4" />
              Загружаем приглашения…
            </div>
          )}
          {failed && (
            <div role="alert" className="flex flex-col items-center px-3 py-7 text-center">
              <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-crit-soft/60 text-crit">
                <CircleAlert className="size-5" />
              </span>
              <h3 className="text-[13px] font-medium">Не удалось загрузить уведомления</h3>
              <p className="mt-1 max-w-60 text-[12px] leading-relaxed text-ink-3">
                Попробуйте обновить список чуть позже.
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-4 h-8 px-3"
                disabled={invitations.isFetching}
                onClick={() => void invitations.refetch()}
              >
                <RefreshCw className="size-3.5" />
                Повторить
              </Button>
            </div>
          )}
          {!invitations.isPending && !invitations.isError && items.length === 0 && (
            <div className="flex flex-col items-center px-4 py-9 text-center">
              <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-ink-3">
                <BellCheck className="size-6" strokeWidth={1.5} />
              </span>
              <h3 className="text-[13.5px] font-medium">Новых приглашений нет</h3>
              <p className="mt-1.5 max-w-64 text-[12px] leading-relaxed text-ink-3">
                Когда вас пригласят в команду, приглашение появится здесь.
              </p>
            </div>
          )}
          {invitations.isError && items.length > 0 && (
            <p
              role="status"
              className="mb-3 rounded-lg bg-warn-soft/50 px-3 py-2 text-[11.5px] leading-relaxed text-ink-3"
            >
              Не удалось обновить список. Показаны последние загруженные приглашения.
            </p>
          )}
          <ul aria-label="Приглашения" className="space-y-2.5">
            <AnimatePresence initial={false}>
              {items.map((invitation) => (
                <InvitationRow key={invitation.id} invitation={invitation} onOpened={() => setOpen(false)} />
              ))}
            </AnimatePresence>
          </ul>
        </div>
        <footer className="shrink-0 border-t border-line/60 bg-surface-2/60 px-4 py-3 text-[11px] leading-relaxed wrap-anywhere text-ink-3">
          Приглашения для <span className="font-medium text-ink-2">{user.email}</span>
        </footer>
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
    if (invitation.requires_email_link) {
      toast('Откройте ссылку из письма', {
        description: 'Приглашение нужно подтвердить по ссылке, отправленной на вашу почту.',
      })
      return
    }
    const organization = await accept.mutateAsync(invitation.id).catch(() => null)
    if (!organization) return
    toast.success('Приглашение принято', {
      description: 'Вы в команде ' + quoted(organization.name) + '.',
      action: {
        label: 'К проектам',
        onClick: () => {
          select(organization.id)
          navigate('/projects')
        },
      },
    })
    onOpened()
  }
  const onDecline = async () => {
    const declined = await decline.mutateAsync(invitation.id).then(
      () => true,
      () => false,
    )
    if (declined) toast('Приглашение отклонено', { description: invitation.organization_name })
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }}
      transition={SPRING}
      aria-busy={busy}
      className="overflow-hidden rounded-xl bg-surface-2"
    >
      <div className="p-3.5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#293831] text-[16px] font-semibold text-white">
            {initialOf(invitation.organization_name)}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] leading-snug font-semibold wrap-anywhere">{invitation.organization_name}</h3>
            <p className="mt-1 text-[12px] leading-relaxed wrap-anywhere text-ink-2">
              Приглашает {invitation.invited_by_name || invitation.invited_by_email || 'владелец организации'}
            </p>
            {invitation.invited_by_name && invitation.invited_by_email && (
              <p className="mt-0.5 text-[11px] wrap-anywhere text-ink-3">{invitation.invited_by_email}</p>
            )}
            <time dateTime={invitation.created_at} className="mt-1 block text-[10.5px] text-ink-3">
              {formatDateTime(invitation.created_at)}
            </time>
          </div>
        </div>
        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <Button className="h-9 gap-1.5 px-2 text-[12.5px] shadow-none" disabled={busy} onClick={onAccept}>
            {accept.isPending ? <Spinner className="size-3.5" /> : <Check className="size-3.5" />}
            {invitation.requires_email_link ? 'Ссылка в письме' : 'Принять'}
          </Button>
          <Button
            variant="ghost"
            className="h-9 bg-surface px-2 text-[12.5px] text-ink-3 hover:bg-muted"
            disabled={busy}
            onClick={onDecline}
          >
            {decline.isPending && <Spinner className="size-3.5" />}Отклонить
          </Button>
        </div>
      </div>
    </motion.li>
  )
}

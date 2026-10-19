import {
  ArrowUpRight,
  Clock3,
  Crown,
  FolderOpen,
  Mail,
  Settings2,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import {
  ROLE_LABEL,
  initialOf,
  quoted,
  useDeleteOrganization,
  useInvite,
  useOrganization,
  useRemoveMember,
  useRenameOrganization,
  useRevokeInvitation,
  useWorkspaceStore,
} from '@/entities/organization'
import { useSession } from '@/entities/session'
import type { OrganizationDetail, OrganizationInvitation, OrganizationMember } from '@/shared/api/types'
import { formatDate, formatDateTime, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm'
import { InfoHint } from '@/shared/ui/info-hint'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'

export function OrganizationPage() {
  const { organizationId = '' } = useParams()
  const organization = useOrganization(organizationId)
  return (
    <div className="mx-auto w-full max-w-270 px-4 pt-7 pb-16 sm:px-6 sm:pt-10">
      {organization.isPending && <LoadingBlock label="Загружаем организацию…" />}
      {organization.isError && <ErrorBlock error={organization.error} onRetry={() => organization.refetch()} />}
      {organization.data && <Organization key={organization.data.id} org={organization.data} />}
    </div>
  )
}

function Organization({ org }: { org: OrganizationDetail }) {
  const { user } = useSession()
  const navigate = useNavigate()
  const select = useWorkspaceStore((s) => s.select)
  const isOwner = org.role === 'owner'
  const tabClassName =
    'h-12 flex-none gap-2 rounded-none border-0 px-0 text-[13px] text-ink-3 data-[state=active]:text-ink data-[state=active]:after:opacity-100 group-data-[variant=line]/tabs-list:after:bottom-0'

  return (
    <>
      <header className="mb-7 flex flex-wrap items-center justify-between gap-x-6 gap-y-5">
        <div className="flex min-w-0 max-w-full items-center gap-3.5 sm:gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#293831] text-[22px] font-semibold text-white sm:size-14 sm:text-[25px]">
            {initialOf(org.name)}
          </span>
          <div className="min-w-0">
            <p className="mb-1 text-[12px] text-ink-3">Организация</p>
            <h1 className="text-[27px] leading-tight font-semibold tracking-[-0.035em] wrap-anywhere sm:text-[34px]">
              {org.name}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ink-3">
              <span>{ROLE_LABEL[org.role]}</span>
              <span aria-hidden="true" className="text-ink-4">
                ·
              </span>
              <span>
                {org.members_count} {pluralRu(org.members_count, ['участник', 'участника', 'участников'])}
              </span>
              <span aria-hidden="true" className="text-ink-4">
                ·
              </span>
              <span>
                {org.projects_count} {pluralRu(org.projects_count, ['проект', 'проекта', 'проектов'])}
              </span>
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          className="h-10 gap-2 bg-surface px-4 shadow-none hover:bg-muted max-sm:w-full"
          onClick={() => {
            select(org.id)
            navigate('/projects')
          }}
        >
          <FolderOpen className="size-4" /> Открыть проекты <ArrowUpRight className="ml-1 size-3.5 text-ink-3" />
        </Button>
      </header>

      <Tabs defaultValue="team" className="gap-5">
        <TabsList
          variant="line"
          aria-label="Разделы организации"
          className="w-full justify-start gap-6 border-b border-line p-0 group-data-horizontal/tabs:h-12"
        >
          <TabsTrigger value="team" className={tabClassName}>
            <Users className="size-4" /> Команда
          </TabsTrigger>
          <TabsTrigger value="settings" className={tabClassName}>
            <Settings2 className="size-4" /> Настройки
          </TabsTrigger>
        </TabsList>
        <TabsContent value="team">
          <div
            className={cn(
              'grid items-start gap-5',
              isOwner && 'md:grid-cols-[minmax(0,1fr)_18rem] lg:grid-cols-[minmax(0,1fr)_19rem]',
            )}
          >
            {isOwner && (
              <aside className="md:col-start-2 md:row-start-1">
                <InviteForm org={org} />
              </aside>
            )}
            <div className={cn('min-w-0 space-y-5', isOwner && 'md:col-start-1 md:row-start-1')}>
              <Panel
                title="Участники"
                count={org.members.length}
                hint="Все участники могут видеть и редактировать проекты организации. Управлять составом команды может владелец."
              >
                <ul className="divide-y divide-line/60">
                  {org.members.map((member) => (
                    <MemberRow
                      key={member.user_id}
                      member={member}
                      orgId={org.id}
                      me={member.user_id === user?.id}
                      canRemove={isOwner && member.user_id !== user?.id}
                    />
                  ))}
                </ul>
              </Panel>

              <Panel
                title="Ожидают ответа"
                count={org.invitations.length}
                hint="Приглашение появится в уведомлениях у пользователя с этим email. Если аккаунта ещё нет, оно будет доступно после регистрации."
              >
                {org.invitations.length ? (
                  <ul className="divide-y divide-line/60">
                    {org.invitations.map((invitation) => (
                      <PendingRow key={invitation.id} invitation={invitation} orgId={org.id} canRevoke={isOwner} />
                    ))}
                  </ul>
                ) : (
                  <div className="flex items-center gap-3 px-5 py-6">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-4">
                      <Mail className="size-4" />
                    </span>
                    <div>
                      <p className="text-[13px] font-medium text-ink-2">Открытых приглашений нет</p>
                      <p className="mt-0.5 text-[12px] text-ink-3">
                        Здесь будут коллеги, которые ещё не присоединились.
                      </p>
                    </div>
                  </div>
                )}
              </Panel>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="settings">
          <OrganizationSettings org={org} userId={user?.id} />
        </TabsContent>
      </Tabs>
    </>
  )
}

function Panel({
  title,
  count,
  hint,
  children,
}: {
  title: string
  count?: number
  hint?: string
  children: ReactNode
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl bg-surface ring-1 ring-line/60">
      <div className="flex items-center gap-2 border-b border-line/60 px-4 py-4 sm:px-5">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        {count !== undefined && (
          <span className="num min-w-5 rounded-md bg-surface-2 px-1.5 py-0.5 text-center text-[11px] font-medium text-ink-3">
            {count}
          </span>
        )}
        {hint && (
          <InfoHint title={title} size="sm" showCloseButton={false} className="-my-2 -ml-1">
            {hint}
          </InfoHint>
        )}
      </div>
      {children}
    </section>
  )
}

function MemberRow({
  member,
  orgId,
  me,
  canRemove,
}: {
  member: OrganizationMember
  orgId: string
  me: boolean
  canRemove: boolean
}) {
  return (
    <li className="flex min-w-0 items-start gap-3 px-4 py-4 sm:px-5">
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold',
          member.role === 'owner' ? 'bg-[#e7ece6] text-[#293831]' : 'bg-muted/60 text-ink-2',
        )}
      >
        {initialOf(member.name || member.email)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="min-w-0 text-[13.5px] font-medium wrap-anywhere">{member.name || member.email}</p>
          {me && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-ink-3">Вы</span>}
        </div>
        <p className="mt-0.5 text-[12px] wrap-anywhere text-ink-3">{member.email}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
          <span className={cn('inline-flex items-center gap-1', member.role === 'owner' && 'text-ink-2')}>
            {member.role === 'owner' && <Crown className="size-3 text-warn" />}
            {ROLE_LABEL[member.role]}
          </span>
          <span>С {formatDate(member.joined_at)}</span>
        </div>
      </div>
      {canRemove && <RemoveMember orgId={orgId} userId={member.user_id} name={member.name || member.email} />}
    </li>
  )
}

function PendingRow({
  invitation,
  orgId,
  canRevoke,
}: {
  invitation: OrganizationInvitation
  orgId: string
  canRevoke: boolean
}) {
  return (
    <li className="flex min-w-0 items-start gap-3 px-4 py-4 sm:px-5">
      <span className="hidden size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-3 sm:flex">
        <Mail className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium wrap-anywhere">{invitation.email}</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed wrap-anywhere text-ink-3">
          {invitation.invited_by_name && <span>{invitation.invited_by_name} · </span>}
          <time dateTime={invitation.created_at}>{formatDateTime(invitation.created_at)}</time>
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1 text-[11px] text-ink-3">
            <Clock3 className="size-3" />
            {invitation.invitee_registered ? 'Ждём ответа' : 'Ждёт регистрации'}
          </span>
          {canRevoke && <RevokeInvitation orgId={orgId} invitation={invitation} />}
        </div>
      </div>
    </li>
  )
}

function InviteForm({ org }: { org: OrganizationDetail }) {
  const emailId = useId()
  const [email, setEmail] = useState('')
  const invite = useInvite(org.id)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const invitation = await invite.mutateAsync(email.trim()).catch(() => null)
    if (!invitation) return
    setEmail('')
    toast.success('Приглашение создано', {
      description:
        invitation.email +
        (invitation.invitee_registered
          ? ' — приглашение появилось в уведомлениях.'
          : ' — приглашение будет доступно после регистрации.'),
    })
  }
  return (
    <section aria-labelledby={emailId + '-heading'} className="rounded-2xl bg-surface p-5 ring-1 ring-line/60">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-signal-soft/70 text-signal">
          <UserPlus className="size-4.5" />
        </span>
        <h2 id={emailId + '-heading'} className="text-[16px] font-semibold tracking-[-0.02em]">
          Пригласить коллегу
        </h2>
      </div>
      <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
        Совместная работа над всеми проектами организации.
      </p>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <div className="space-y-2">
          <Label htmlFor={emailId} className="text-[12px]">
            Email коллеги
          </Label>
          <Input
            id={emailId}
            type="email"
            required
            autoComplete="email"
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="colleague@company.ru"
            disabled={invite.isPending}
            className="h-11 bg-surface-2/50 px-3 text-[13px] shadow-none"
          />
        </div>
        <Button
          type="submit"
          disabled={invite.isPending || !email.trim()}
          className="h-10 w-full gap-2 shadow-none disabled:bg-muted disabled:text-ink-4 disabled:opacity-100"
        >
          {invite.isPending ? <Spinner /> : <UserPlus className="size-4" />}
          {invite.isPending ? 'Приглашаем…' : 'Пригласить'}
        </Button>
      </form>
      <p className="mt-4 text-[11.5px] leading-relaxed text-ink-3">
        Приглашение появится в уведомлениях РобоМеры. Если аккаунта ещё нет — после регистрации.
      </p>
    </section>
  )
}

function RemoveMember({ orgId, userId, name }: { orgId: string; userId: string; name: string }) {
  const remove = useRemoveMember(orgId)
  return (
    <ConfirmDialog
      title={'Исключить ' + name + '?'}
      description="Участник потеряет доступ к проектам организации. Созданные им проекты останутся в организации."
      confirmText="Исключить"
      onConfirm={async () => {
        const removed = await remove.mutateAsync(userId).then(
          () => true,
          () => false,
        )
        if (removed) toast.success('Участник исключён', { description: name })
      }}
      trigger={
        <Button
          variant="ghost"
          size="icon"
          disabled={remove.isPending}
          className="shrink-0 text-ink-4 hover:bg-crit-soft/50 hover:text-crit"
          title="Исключить из команды"
          aria-label={'Исключить ' + name}
        >
          <UserMinus className="size-4" />
        </Button>
      }
    />
  )
}

function RevokeInvitation({ orgId, invitation }: { orgId: string; invitation: OrganizationInvitation }) {
  const revoke = useRevokeInvitation(orgId)
  const onRevoke = async () => {
    const revoked = await revoke.mutateAsync(invitation.id).then(
      () => true,
      () => false,
    )
    if (revoked) toast.success('Приглашение отозвано', { description: invitation.email })
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-mr-2 h-7 gap-1 px-2 text-[11.5px] text-ink-3 hover:bg-crit-soft/50 hover:text-crit"
      aria-label={'Отозвать приглашение для ' + invitation.email}
      disabled={revoke.isPending}
      onClick={onRevoke}
    >
      {revoke.isPending ? <Spinner className="size-3" /> : <X className="size-3" />} Отозвать
    </Button>
  )
}

function OrganizationSettings({ org, userId }: { org: OrganizationDetail; userId?: string }) {
  const navigate = useNavigate()
  const select = useWorkspaceStore((s) => s.select)
  const rename = useRenameOrganization(org.id)
  const remove = useDeleteOrganization()
  const leave = useRemoveMember(org.id)
  const [name, setName] = useState(org.name)
  const nameId = useId()
  const toPersonal = () => {
    select(null)
    navigate('/projects')
  }
  if (org.role !== 'owner') {
    return (
      <Panel title="Участие в организации">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0 max-w-lg">
            <p className="text-[13px] font-medium">Доступ к общим проектам</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
              После выхода проекты организации станут недоступны. Вернуться можно по новому приглашению владельца.
            </p>
          </div>
          <ConfirmDialog
            title={'Выйти из ' + quoted(org.name) + '?'}
            description="Вернуться можно только по новому приглашению владельца."
            confirmText="Выйти"
            onConfirm={async () => {
              if (!userId) return
              const left = await leave.mutateAsync(userId).then(
                () => true,
                () => false,
              )
              if (left) {
                toPersonal()
                toast.success('Вы вышли из организации')
              }
            }}
            trigger={
              <Button variant="outline" className="h-10 px-4" disabled={leave.isPending}>
                Выйти из организации
              </Button>
            }
          />
        </div>
      </Panel>
    )
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const renamed = await rename.mutateAsync(name.trim()).catch(() => null)
    if (renamed) toast.success('Название организации сохранено', { description: renamed.name })
  }
  return (
    <div className="space-y-5">
      <Panel title="Название организации">
        <form onSubmit={submit} className="p-5">
          <Label htmlFor={nameId} className="text-[12.5px]">
            Название для вашей команды
          </Label>
          <div className="mt-2 flex max-w-xl flex-wrap gap-2">
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              required
              disabled={rename.isPending}
              className="h-10 min-w-0 flex-1 bg-surface-2/50 px-3 max-sm:basis-full"
            />
            <Button
              type="submit"
              className="h-10 px-4 shadow-none disabled:bg-muted disabled:text-ink-4 disabled:opacity-100 max-sm:w-full"
              disabled={rename.isPending || !name.trim() || name.trim() === org.name}
            >
              {rename.isPending && <Spinner />}
              {rename.isPending ? 'Сохраняем…' : 'Сохранить'}
            </Button>
          </div>
          <p className="mt-2 text-[12px] text-ink-3">Это название видят все участники организации.</p>
        </form>
      </Panel>
      <section className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 rounded-2xl bg-surface px-5 py-5 ring-1 ring-line/60">
        <div className="min-w-0 flex-1 max-sm:basis-full">
          <h2 className="text-[14px] font-semibold">Удаление организации</h2>
          <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-ink-3">
            {org.projects_count > 0 ? (
              <>
                Вместе с организацией будут удалены {org.projects_count}{' '}
                {pluralRu(org.projects_count, ['проект', 'проекта', 'проектов'])} с расчётами и отчётами.
              </>
            ) : (
              'Организация будет удалена без возможности восстановления.'
            )}
          </p>
        </div>
        <ConfirmDialog
          title={'Удалить ' + quoted(org.name) + '?'}
          description="Организация, её проекты, сценарии, расчёты и отчёты будут удалены без возможности восстановления."
          onConfirm={async () => {
            const removed = await remove.mutateAsync(org.id).then(
              () => true,
              () => false,
            )
            if (removed) {
              toPersonal()
              toast.success('Организация удалена')
            }
          }}
          trigger={
            <Button variant="destructive" className="h-10 gap-2 px-4 max-sm:w-full" disabled={remove.isPending}>
              <Trash2 className="size-3.5" />
              Удалить организацию
            </Button>
          }
        />
      </section>
    </div>
  )
}

import { ArrowRight, Clock, Mail, UserMinus, X } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
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
import type { OrganizationDetail } from '@/shared/api/types'
import { formatDate, formatDateTime, pluralRu } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm'
import { Input } from '@/shared/ui/input'
import { ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { Pill } from '@/shared/ui/v0'

export function OrganizationPage() {
  const { organizationId = '' } = useParams()
  const organization = useOrganization(organizationId)
  return (
    <div className="mx-auto w-full max-w-215 px-4 pt-7 sm:px-6 sm:pt-12 pb-16">
      {organization.isPending && <LoadingBlock label="Загружаем организацию…" />}
      {organization.isError && <ErrorBlock error={organization.error} onRetry={() => organization.refetch()} />}
      {organization.data && <Organization org={organization.data} />}
    </div>
  )
}

function Organization({ org }: { org: OrganizationDetail }) {
  const { user } = useSession()
  const navigate = useNavigate()
  const select = useWorkspaceStore((s) => s.select)
  const isOwner = org.role === 'owner'
  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-[14px] bg-ink text-[22px] font-semibold text-white">
            {initialOf(org.name)}
          </span>
          <div className="min-w-0">
            <h1 className="display truncate text-[36px] leading-[1.1] tracking-[-0.03em]">{org.name}</h1>
            <div className="mt-1 text-[14px] text-ink-3">
              {ROLE_LABEL[org.role]} · {org.members_count}{' '}
              {pluralRu(org.members_count, ['участник', 'участника', 'участников'])} · {org.projects_count}{' '}
              {pluralRu(org.projects_count, ['общий проект', 'общих проекта', 'общих проектов'])}
            </div>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => {
            select(org.id)
            navigate('/projects')
          }}
        >
          Проекты организации <ArrowRight />
        </Button>
      </div>

      {isOwner && <InviteForm org={org} />}

      <Card title="Участники" hint="Видят и редактируют все проекты организации">
        <ul className="divide-y divide-line">
          {org.members.map((member) => {
            const me = member.user_id === user?.id
            return (
              <li key={member.user_id} className="flex items-center gap-3 px-5 py-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-black/6 text-[13px] font-semibold text-ink-2">
                  {initialOf(member.name || member.email)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">
                    {member.name}
                    {me && <span className="font-normal text-ink-3"> · вы</span>}
                  </span>
                  <span className="block truncate text-[12.5px] text-ink-3">
                    {member.email} · с {formatDate(member.joined_at)}
                  </span>
                </span>
                <Pill tone={member.role === 'owner' ? 'accent' : 'neutral'}>{ROLE_LABEL[member.role]}</Pill>
                {isOwner && !me ? (
                  <RemoveMember orgId={org.id} userId={member.user_id} name={member.name || member.email} />
                ) : (
                  <span className="size-8" />
                )}
              </li>
            )
          })}
        </ul>
      </Card>

      {org.invitations.length > 0 && (
        <Card title="Ждут ответа" hint="Приглашённые видят приглашение в колокольчике рядом с профилем">
          <ul className="divide-y divide-line">
            {org.invitations.map((invitation) => (
              <li key={invitation.id} className="flex items-center gap-3 px-5 py-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-line-2 text-ink-4">
                  <Mail size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{invitation.email}</span>
                  <span className="block truncate text-[12.5px] text-ink-3">
                    {invitation.invited_by_name && `пригласил(а) ${invitation.invited_by_name} · `}
                    {formatDateTime(invitation.created_at)}
                  </span>
                </span>
                {invitation.invitee_registered ? (
                  <Pill>
                    <Clock /> Ждём ответа
                  </Pill>
                ) : (
                  <Pill tone="warn">Ещё не зарегистрирован</Pill>
                )}
                {isOwner ? (
                  <RevokeInvitation orgId={org.id} invitationId={invitation.id} />
                ) : (
                  <span className="size-8" />
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <DangerZone org={org} userId={user?.id} />
    </>
  )
}

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2.5 flex items-baseline justify-between gap-4 px-1">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {hint && <span className="meta hidden sm:inline">{hint}</span>}
      </div>
      <div className="card overflow-hidden">{children}</div>
    </section>
  )
}

function InviteForm({ org }: { org: OrganizationDetail }) {
  const [email, setEmail] = useState('')
  const invite = useInvite(org.id)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const invitation = await invite.mutateAsync(email.trim())
    setEmail('')
    toast.success(`Приглашение отправлено: ${invitation.email}`, {
      description: invitation.invitee_registered
        ? 'Пользователь увидит его в уведомлениях.'
        : 'Адрес ещё не зарегистрирован — приглашение появится после регистрации.',
    })
  }
  return (
    <Card title="Пригласить по email">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2 px-5 py-4">
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="colleague@company.ru"
          className="min-w-60 flex-1"
          aria-label="Email приглашённого"
        />
        <Button type="submit" disabled={invite.isPending || !email.trim()}>
          {invite.isPending && <Spinner />} Пригласить
        </Button>
        <p className="meta w-full">
          Приглашённый станет участником и увидит все проекты организации. Если адреса ещё нет в РобоМере, приглашение
          дождётся регистрации.
        </p>
      </form>
    </Card>
  )
}

function RemoveMember({ orgId, userId, name }: { orgId: string; userId: string; name: string }) {
  const remove = useRemoveMember(orgId)
  return (
    <ConfirmDialog
      title={`Исключить ${name}?`}
      description="Участник потеряет доступ к проектам организации. Созданные им проекты останутся в организации."
      confirmText="Исключить"
      onConfirm={() => remove.mutateAsync(userId)}
      trigger={
        <Button variant="ghost" size="icon" className="text-ink-4 hover:text-crit" aria-label={`Исключить ${name}`}>
          <UserMinus />
        </Button>
      }
    />
  )
}

function RevokeInvitation({ orgId, invitationId }: { orgId: string; invitationId: string }) {
  const revoke = useRevokeInvitation(orgId)
  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-ink-4 hover:text-crit"
      aria-label="Отозвать приглашение"
      disabled={revoke.isPending}
      onClick={() => revoke.mutate(invitationId)}
    >
      <X />
    </Button>
  )
}

function DangerZone({ org, userId }: { org: OrganizationDetail; userId?: string }) {
  const navigate = useNavigate()
  const select = useWorkspaceStore((s) => s.select)
  const rename = useRenameOrganization(org.id)
  const remove = useDeleteOrganization()
  const leave = useRemoveMember(org.id)
  const [name, setName] = useState(org.name)
  const toPersonal = () => {
    select(null)
    navigate('/projects')
  }
  if (org.role !== 'owner') {
    return (
      <Card title="Участие">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <span className="text-[13.5px] text-ink-2">Выйдя, вы потеряете доступ к общим проектам организации.</span>
          <ConfirmDialog
            title={`Выйти из ${quoted(org.name)}?`}
            description="Вернуться можно только по новому приглашению владельца."
            confirmText="Выйти"
            onConfirm={async () => {
              if (userId) await leave.mutateAsync(userId)
              toPersonal()
            }}
            trigger={
              <Button variant="outline" size="sm">
                Выйти из организации
              </Button>
            }
          />
        </div>
      </Card>
    )
  }
  return (
    <Card title="Настройки">
      <form
        className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-4"
        onSubmit={async (e) => {
          e.preventDefault()
          await rename.mutateAsync(name.trim())
          toast.success('Название сохранено')
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          className="min-w-60 flex-1"
          aria-label="Название организации"
        />
        <Button type="submit" variant="outline" disabled={rename.isPending || !name.trim() || name.trim() === org.name}>
          {rename.isPending && <Spinner />} Переименовать
        </Button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <span className="text-[13.5px] text-ink-2">
          Удаление необратимо: вместе с организацией удалятся {org.projects_count}{' '}
          {pluralRu(org.projects_count, ['проект', 'проекта', 'проектов'])} с расчётами и отчётами.
        </span>
        <ConfirmDialog
          title={`Удалить ${quoted(org.name)}?`}
          description="Организация, её проекты, сценарии, расчёты и отчёты будут удалены без возможности восстановления."
          onConfirm={async () => {
            await remove.mutateAsync(org.id)
            toPersonal()
          }}
          trigger={
            <Button variant="destructive" size="sm">
              Удалить организацию
            </Button>
          }
        />
      </div>
    </Card>
  )
}

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Mail, UsersRound } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { organizationApi } from '@/entities/organization/api'
import { useWorkspaceStore } from '@/entities/organization/workspace'
import { useSession } from '@/entities/session'
import { useLinkToken } from '@/features/auth/use-link-token'
import { apiPublic } from '@/shared/api/client'
import { qk } from '@/shared/api/keys'
import { problemText } from '@/shared/api/problem'
import type { Res } from '@/shared/api/types'
import { Button } from '@/shared/ui/button'
import { ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'

export function InvitationPage() {
  const { invitationId = '' } = useParams()
  return <InvitationDetails key={invitationId} id={invitationId} />
}

function InvitationDetails({ id }: { id: string }) {
  const { token, clear } = useLinkToken(`invitation:${id}`)
  const { user, status } = useSession()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const preview = useQuery({
    queryKey: ['invitation-preview', id],
    queryFn: () =>
      apiPublic
        .post<Res<'/api/v1/auth/invitations/{invitation_id}/preview', 'post'>>(`/auth/invitations/${id}/preview`, {
          token,
        })
        .then((r) => r.data),
    enabled: !!id && !!token,
    retry: false,
  })
  const accept = async () => {
    setBusy(true)
    setError(null)
    try {
      const organization = await organizationApi.accept(id, token)
      clear()
      await queryClient.invalidateQueries({ queryKey: qk.organizations.list })
      await queryClient.invalidateQueries({ queryKey: qk.organizations.invitations })
      useWorkspaceStore.getState().select(organization.id)
      navigate(`/organizations/${organization.id}`, { replace: true })
    } catch (e) {
      setError(problemText(e))
    } finally {
      setBusy(false)
    }
  }
  const login = `/login?return_to=${encodeURIComponent(`/invitations/${id}`)}`
  const signedIn = user && user.role !== 'guest'
  const matching = signedIn && preview.data?.email.toLowerCase() === user.email.toLowerCase()
  return (
    <section aria-labelledby="invitation-title" className="mx-auto w-full max-w-132 px-4 py-10 sm:py-16">
      <div className="card overflow-hidden shadow-card">
        <div className="p-5 sm:p-7">
          <div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
            <UsersRound className="size-5" aria-hidden />
          </div>
          <h1 id="invitation-title" className="text-2xl leading-tight font-semibold tracking-[-0.03em]">
            Приглашение в команду
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-3">
            Общие проекты, расчёты и решения в одном пространстве.
          </p>
        </div>
        <div className="px-5 pb-5 sm:px-7 sm:pb-7">
          {!token ? (
            <p role="alert" className="rounded-xl bg-surface-2 p-4 text-sm leading-relaxed text-ink-2">
              Откройте полную ссылку из письма. Если приглашение уже неактуально, попросите владельца отправить новое.
            </p>
          ) : preview.isPending ? (
            <LoadingBlock label="Проверяем приглашение…" />
          ) : preview.isError ? (
            <ErrorBlock error={preview.error} onRetry={() => void preview.refetch()} />
          ) : (
            preview.data && (
              <>
                <div className="border-t border-line pt-5">
                  <p className="text-xs text-ink-3">Команда</p>
                  <h2 className="mt-1 text-xl leading-snug font-semibold tracking-[-0.02em] wrap-anywhere">
                    {preview.data.organization_name}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-ink-2">
                    {preview.data.invited_by_name || 'Владелец организации'} приглашает вас к совместной работе.
                  </p>
                  <div className="mt-5 flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
                    <Mail className="size-4 shrink-0 text-ink-3" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-xs text-ink-3">Приглашение для</p>
                      <p className="mt-0.5 text-sm font-medium wrap-anywhere">{preview.data.email}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-5">
                  {status === 'restoring' ? (
                    <LoadingBlock label="Восстанавливаем вход…" />
                  ) : !signedIn ? (
                    <>
                      <p className="mb-4 text-[13px] leading-relaxed text-ink-3">
                        Войдите или зарегистрируйтесь с указанной почтой.
                      </p>
                      <Button asChild className="h-10 w-full justify-between px-4">
                        <Link to={login}>
                          Войти или создать аккаунт <ArrowRight aria-hidden />
                        </Link>
                      </Button>
                    </>
                  ) : matching ? (
                    <>
                      <p className="mb-4 text-[13px] leading-relaxed text-ink-3">
                        Вступление даст доступ к проектам команды. Личные проекты останутся в вашем пространстве.
                      </p>
                      <Button className="h-10 w-full px-4" disabled={busy} onClick={() => void accept()}>
                        {busy ? <Spinner /> : <UsersRound aria-hidden />} Принять приглашение
                      </Button>
                    </>
                  ) : (
                    <>
                      <p
                        role="alert"
                        className="mb-4 rounded-xl bg-warn-soft px-4 py-3 text-[13px] leading-relaxed text-warn wrap-anywhere"
                      >
                        Вы вошли как <span className="font-medium">{user.email}</span>. Смените аккаунт на почту из
                        приглашения.
                      </p>
                      <Button className="h-10 w-full justify-between px-4" variant="outline" asChild>
                        <Link to={`${login}&reauth=1`}>
                          Войти с другой почтой <ArrowRight aria-hidden />
                        </Link>
                      </Button>
                    </>
                  )}
                </div>
              </>
            )
          )}
          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-crit-soft px-4 py-3 text-sm leading-relaxed text-crit">
              {error}
            </p>
          )}
        </div>
      </div>
      <Link
        className="mx-auto mt-5 flex w-fit items-center gap-2 rounded-md px-2 py-1 text-[13px] text-ink-3 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        to="/projects"
      >
        <ArrowLeft className="size-3.5" aria-hidden /> К проектам
      </Link>
    </section>
  )
}

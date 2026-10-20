import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
    <section className="mx-auto w-full max-w-xl px-6 py-12 sm:py-20">
      <h1 className="h1 mb-6">Приглашение в команду</h1>
      {!token ? (
        <p role="alert">
          Откройте полную ссылку из письма. Если приглашение уже неактуально, попросите владельца отправить новое.
        </p>
      ) : preview.isPending ? (
        <LoadingBlock label="Проверяем приглашение…" />
      ) : preview.isError ? (
        <ErrorBlock error={preview.error} onRetry={() => void preview.refetch()} />
      ) : (
        preview.data && (
          <>
            <p className="mb-2 text-xl font-semibold wrap-anywhere">{preview.data.organization_name}</p>
            <p className="mb-6 leading-relaxed text-ink-2">
              {preview.data.invited_by_name || 'Владелец организации'} приглашает вас работать с общими проектами.
              Приглашение для <strong className="wrap-anywhere">{preview.data.email}</strong>.
            </p>
            {status === 'restoring' ? (
              <LoadingBlock label="Восстанавливаем вход…" />
            ) : !signedIn ? (
              <>
                <p className="mb-4 text-sm text-ink-3">
                  Войдите или создайте аккаунт с этой почтой. Затем вы вернётесь к приглашению.
                </p>
                <Button asChild>
                  <Link to={login}>Войти или зарегистрироваться</Link>
                </Button>
              </>
            ) : matching ? (
              <>
                <p className="mb-4 text-sm text-ink-3">
                  Вступление даст доступ к проектам команды. Личные проекты останутся в вашем пространстве.
                </p>
                <Button disabled={busy} onClick={() => void accept()}>
                  {busy && <Spinner />} Принять приглашение
                </Button>
              </>
            ) : (
              <>
                <p role="alert" className="mb-4 text-sm">
                  Вы вошли как {user.email}. Для приглашения нужен аккаунт {preview.data.email}.
                </p>
                <Button variant="outline" asChild>
                  <Link to={`${login}&reauth=1`}>Войти с другой почтой</Link>
                </Button>
              </>
            )}
          </>
        )
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-crit">
          {error}
        </p>
      )}
      <Link className="mt-6 block text-sm underline underline-offset-4" to="/projects">
        К проектам
      </Link>
    </section>
  )
}

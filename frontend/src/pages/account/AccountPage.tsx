import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useSession } from '@/entities/session'
import { authApi, type ProviderId } from '@/features/auth/api'
import { authErrorText, PROVIDER_NAMES } from '@/features/auth/links'
import { ProviderIcon } from '@/features/auth/ProviderIcon'
import { problemText } from '@/shared/api/problem'
import { formatDateTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'

export function AccountPage() {
  const { user, logout } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const security = useQuery({ queryKey: ['auth', 'security', user?.id], queryFn: authApi.security })
  const providers = useQuery({ queryKey: ['auth', 'providers'], queryFn: authApi.providers })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(
    authErrorText(new URLSearchParams(location.search).get('auth_error')),
  )
  const [message, setMessage] = useState<string | null>(null)
  const run = async (id: string, action: () => Promise<unknown>, done?: string, endsSessions = false) => {
    setBusy(id)
    setError(null)
    setMessage(null)
    try {
      await action()
      if (endsSessions) {
        toast.success(done || 'Изменения сохранены. Войдите заново.')
        await logout()
        navigate('/login?return_to=%2Faccount', { replace: true })
      } else {
        setMessage(done || null)
        await security.refetch()
      }
    } catch (e) {
      setError(problemText(e))
    } finally {
      setBusy(null)
    }
  }
  const connect = (id: ProviderId) =>
    run(`connect-${id}`, async () => {
      window.location.assign(await authApi.start(id, '/account', true))
    })
  const data = security.data
  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-10 sm:py-14">
      <h1 className="h1">Аккаунт и безопасность</h1>
      <p className="mt-2 text-ink-3 wrap-anywhere">{user?.email}</p>
      {security.isPending && <LoadingBlock className="mt-8" label="Загружаем настройки…" />}
      {security.isError && (
        <ErrorBlock className="mt-8" error={security.error} onRetry={() => void security.refetch()} />
      )}
      {error && (
        <p role="alert" className="mt-6 text-sm text-crit">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-6 text-sm text-ok">
          {message}
        </p>
      )}
      {data && (
        <>
          <section className="mt-10 space-y-4 border-t border-line pt-7">
            <h2 className="h2">Эл. почта</h2>
            {data.email_verified ? (
              <p className="text-sm text-ok">Адрес подтверждён</p>
            ) : (
              <>
                <p className="max-w-prose text-sm leading-relaxed text-ink-2">
                  Подтвердите почту, чтобы создавать команды, получать приглашения и подключать сервисы входа. Личные
                  проекты доступны уже сейчас.
                </p>
                <Button
                  variant="outline"
                  disabled={!!busy}
                  onClick={() =>
                    void run(
                      'verify',
                      authApi.requestVerification,
                      'Письмо запрошено. Проверьте почту и папку «Спам». Повторная отправка доступна через минуту.',
                    )
                  }
                >
                  {busy === 'verify' && <Spinner />} Отправить письмо подтверждения
                </Button>
              </>
            )}
          </section>
          <section className="mt-10 border-t border-line pt-7">
            <h2 className="h2 mb-3">Способы входа</h2>
            <p className="mb-5 text-sm leading-relaxed text-ink-2">
              Несколько сервисов могут вести в один аккаунт. Подключайте их здесь после входа; одинаковая почта в разных
              сервисах сама по себе не объединяет аккаунты.
            </p>
            <div className="divide-y divide-line">
              {(providers.data ?? []).map((p) => {
                const connected = data.identities.some((i) => i.provider === p.id)
                return (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div className="flex items-center gap-3">
                      <ProviderIcon provider={p.id} />
                      <div>
                        <p className="font-medium">{p.name}</p>
                        <p className="mt-1 text-sm text-ink-3">
                          {connected ? 'Подключён' : p.enabled ? 'Не подключён' : 'Пока недоступен'}
                        </p>
                      </div>
                    </div>
                    {connected ? (
                      <Button
                        variant="outline"
                        disabled={!!busy}
                        onClick={() =>
                          void run(
                            `unlink-${p.id}`,
                            () => authApi.unlink(p.id),
                            'Сервис отключён. Войдите другим способом.',
                            true,
                          )
                        }
                      >
                        Отключить
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        disabled={!!busy || !p.enabled || !data.email_verified}
                        onClick={() => void connect(p.id)}
                      >
                        {busy === `connect-${p.id}` && <Spinner />} Подключить
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
            {providers.isError && <ErrorBlock error={providers.error} onRetry={() => void providers.refetch()} />}
            <Link
              className="mt-4 inline-block text-sm underline underline-offset-4"
              to="/login?reauth=1&return_to=%2Faccount"
            >
              Подтвердить вход заново
            </Link>
            <p className="mt-3 text-xs leading-relaxed text-ink-3">
              Для подключения и отключения сервиса нужен недавний вход. Отключение сервиса завершает все сессии.
              Последний способ входа отключить нельзя.
            </p>
          </section>
          <section className="mt-10 border-t border-line pt-7">
            <h2 className="h2 mb-3">{data.has_password ? 'Изменить пароль' : 'Добавить пароль'}</h2>
            <p className="mb-5 text-sm text-ink-2">После сохранения все сессии завершатся. Войдите с новым паролем.</p>
            <PasswordForm
              hasPassword={data.has_password}
              busy={!!busy}
              onSubmit={(password, current) =>
                run('password', () => authApi.password(password, current), 'Пароль сохранён. Войдите заново.', true)
              }
            />
          </section>
          <section className="mt-10 border-t border-line pt-7">
            <h2 className="h2 mb-3">Активные сессии</h2>
            <p className="mb-2 text-sm text-ink-2">
              Завершение сессии сразу закрывает её доступ. Показаны до 50 последних активных сессий.
            </p>
            <ul className="divide-y divide-line">
              {data.sessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {s.method === 'password'
                        ? 'По паролю'
                        : (PROVIDER_NAMES[s.method as ProviderId] ?? 'Гостевой вход')}{' '}
                      · {s.client === 'web' ? 'браузер' : 'приложение'}
                      {s.current && <span className="ml-2 text-sm text-ok">Текущая</span>}
                    </p>
                    <p className="mt-1 text-sm text-ink-3">Вход {formatDateTime(s.created_at)}</p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={!!busy}
                    onClick={() =>
                      void run(
                        `revoke-${s.id}`,
                        () => authApi.revoke(s.id),
                        s.current ? 'Сессия завершена' : 'Доступ этой сессии закрыт',
                        s.current,
                      )
                    }
                  >
                    Завершить
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </section>
  )
}

function PasswordForm({
  hasPassword,
  busy,
  onSubmit,
}: {
  hasPassword: boolean
  busy: boolean
  onSubmit: (password: string, current: string | null) => Promise<void>
}) {
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (password !== confirmation) {
      setError('Пароли не совпадают')
      return
    }
    void onSubmit(password, hasPassword ? current : null)
  }
  return (
    <form onSubmit={submit} className="max-w-md space-y-3">
      {hasPassword && (
        <>
          <Label htmlFor="current-password">Текущий пароль</Label>
          <Input
            className="h-11 text-base!"
            id="current-password"
            type="password"
            required
            maxLength={128}
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </>
      )}
      <Label htmlFor="account-password">Новый пароль (не короче 8 символов)</Label>
      <Input
        className="h-11 text-base!"
        id="account-password"
        type="password"
        required
        minLength={8}
        maxLength={128}
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Label htmlFor="account-confirm">Повторите новый пароль</Label>
      <Input
        className="h-11 text-base!"
        id="account-confirm"
        type="password"
        required
        autoComplete="new-password"
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-sm text-crit">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        Сохранить пароль
      </Button>
    </form>
  )
}

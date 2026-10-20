import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { authApi } from '@/features/auth/api'
import { useLinkToken } from '@/features/auth/use-link-token'
import { problemText } from '@/shared/api/problem'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Spinner } from '@/shared/ui/states'

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-lg px-6 py-12 sm:py-20">
      <h1 className="h1 mb-6">{title}</h1>
      {children}
    </section>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await authApi.forgot(email)
      setSent(true)
    } catch (e) {
      setError(problemText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Frame title="Восстановление доступа">
      {sent ? (
        <p role="status" className="leading-relaxed">
          Если для этого адреса настроен вход по паролю, придёт письмо со ссылкой. Проверьте почту и папку «Спам».
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-ink-2">
            Укажите почту своего аккаунта. Срок действия ссылки будет указан в письме.
          </p>
          <Label htmlFor="recovery-email">Эл. почта</Label>
          <Input
            id="recovery-email"
            className="h-11 text-base!"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm text-crit">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy && <Spinner />} Отправить ссылку
          </Button>
        </form>
      )}
      <p className="mt-6 text-sm text-ink-3">
        Если входили через Яндекс ID, Google или VK ID, восстановите доступ в этом сервисе.
      </p>
      <Link className="mt-6 inline-block text-sm underline underline-offset-4" to="/login?reauth=1">
        Вернуться ко входу
      </Link>
    </Frame>
  )
}

export function VerifyEmailPage() {
  const { token, clear } = useLinkToken('verify-email')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const verify = async () => {
    setBusy(true)
    setError(null)
    try {
      await authApi.verify(token)
      clear()
      setDone(true)
    } catch (e) {
      setError(problemText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Frame title={done ? 'Почта подтверждена' : 'Подтверждение почты'}>
      {done ? (
        <p role="status">Теперь можно создавать команды, приглашать коллег и подключать сервисы входа.</p>
      ) : token ? (
        <>
          <p className="mb-6 leading-relaxed text-ink-2">
            Подтвердите адрес, если это вы создавали аккаунт или запрашивали письмо в РобоМере.
          </p>
          <Button disabled={busy} onClick={() => void verify()}>
            {busy && <Spinner />} Подтвердить почту
          </Button>
        </>
      ) : (
        <p role="alert">В ссылке нет кода подтверждения. Запросите новое письмо в аккаунте.</p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-crit">
          {error}
        </p>
      )}
      <a className="mt-6 inline-block text-sm underline underline-offset-4" href="/account">
        Открыть аккаунт
      </a>
    </Frame>
  )
}

export function ResetPasswordPage() {
  const { token, clear } = useLinkToken('reset-password')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (password !== confirmation) {
      setError('Пароли не совпадают')
      return
    }
    setBusy(true)
    try {
      await authApi.reset(token, password)
      clear()
      setDone(true)
    } catch (e) {
      setError(problemText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Frame title={done ? 'Пароль изменён' : 'Новый пароль'}>
      {done ? (
        <p role="status">Все прежние сессии завершены. Войдите с новым паролем.</p>
      ) : token ? (
        <form onSubmit={submit} className="space-y-4">
          <Label htmlFor="reset-password">Пароль (не короче 8 символов)</Label>
          <Input
            id="reset-password"
            className="h-11 text-base!"
            type="password"
            minLength={8}
            maxLength={128}
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Label htmlFor="reset-confirm">Повторите пароль</Label>
          <Input
            id="reset-confirm"
            className="h-11 text-base!"
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
            {busy && <Spinner />} Сохранить пароль
          </Button>
        </form>
      ) : (
        <p role="alert">
          Откройте ссылку из письма или{' '}
          <Link className="underline" to="/forgot-password">
            запросите новую
          </Link>
          .
        </p>
      )}
      <Link className="mt-6 inline-block text-sm underline underline-offset-4" to="/login?reauth=1">
        Войти
      </Link>
    </Frame>
  )
}

import { useState, type FormEvent, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { ProviderButtons } from '@/features/auth/ProviderButtons'
import { accountReturnPath, authErrorText, safeReturnPath } from '@/features/auth/links'
import { sessionHome, useSession } from '@/entities/session'
import { problemText } from '@/shared/api/problem'
import type { User } from '@/shared/api/types'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Spinner } from '@/shared/ui/states'
import { DeliveryScene } from './DeliveryScene'

// Demo accounts are part of the submission (ТЗ: демо-учётки для жюри); the password is set by RS_DEMO_PASSWORD on the backend.
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD ?? 'Demo12345!'
const DEMO_ACCOUNTS = [
  { email: 'user@robomera.demo', label: 'Пользователь', hint: 'проекты и расчёты' },
  { email: 'admin@robomera.demo', label: 'Администратор', hint: 'каталог и нормативы' },
  { email: 'vendor@robomera.demo', label: 'Производитель', hint: 'карточки роботов' },
]

type Mode = 'login' | 'register'
const FIELD = 'h-11 rounded-[10px] bg-card px-3 text-base md:text-sm'
const FADE = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, delay: 0.1 },
}

export function LoginPage() {
  const { status, user, login, register } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const requestedReturn = accountReturnPath(params.get('return_to'))
  const authErrorKey = params.get('auth_error')
  const authError = authErrorText(authErrorKey)
  const reauth = params.get('reauth') === '1'
  const back = location.state as { from?: string; userId?: string | null; keepGuest?: boolean } | null
  // Возвращаем на прежнюю страницу только её владельца: другой учётке прошлый проект чужой.
  // Возврат туда, откуда отправили на вход; иначе админ — в админ-панель, производитель — в кабинет, остальные — в проекты.
  const previousReturn = accountReturnPath(back?.from)
  const target = (me: User) =>
    previousReturn && (back?.keepGuest || !back?.userId || back?.userId === me.id)
      ? previousReturn
      : (requestedReturn ?? sessionHome(me).path)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [email, setEmail] = useState(reauth ? (user?.email ?? '') : '')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [mode, setMode] = useState<Mode>(() =>
    new URLSearchParams(location.search).get('mode') === 'register' ? 'register' : 'login',
  )

  if (status === 'authenticated' && user && user.role !== 'guest' && !reauth)
    return (
      <Navigate
        to={authError ? `/account?auth_error=${encodeURIComponent(authErrorKey || 'login_failed')}` : target(user)}
        replace
      />
    )

  const run = async (action: () => Promise<User>) => {
    setPending(true)
    setError(null)
    try {
      navigate(target(await action()), { replace: true })
    } catch (e) {
      setError(problemText(e))
    } finally {
      setPending(false)
    }
  }

  const switchMode = (next: Mode) => {
    setError(null)
    setMode(next)
  }

  const onLogin = (e: FormEvent) => {
    e.preventDefault()
    void run(() => login({ email, password }))
  }

  const onRegister = (e: FormEvent) => {
    e.preventDefault()
    void run(() => register({ email, password, name, organization: null }))
  }

  return (
    <div className="flex w-full flex-1 flex-col lg:flex-row">
      <section
        className="relative hidden min-h-90 flex-col items-center justify-center overflow-hidden bg-surface-2 px-6 py-10 lg:flex lg:w-1/2 lg:px-8"
        style={{
          backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
      >
        <h2 className="display max-w-130 text-center text-[32px] leading-[1.05] tracking-[-0.03em]">
          Стоит ли роботизировать ваш объект?
        </h2>
        <div className="mt-16 w-full max-w-190">
          <DeliveryScene />
        </div>
      </section>

      <section
        aria-labelledby="login-title"
        className="flex flex-col items-center justify-center bg-canvas px-5 py-6 lg:w-1/2 lg:px-8"
      >
        <div className="w-full max-w-96">
          <h1 id="login-title" className="mb-1 text-[28px] leading-tight font-bold tracking-tight">
            {mode === 'login' ? 'Вход' : 'Создать аккаунт'}
          </h1>
          <p className="mb-4 text-sm text-ink-3">
            {user?.role === 'guest'
              ? 'Войдите, чтобы сохранить гостевые проекты.'
              : mode === 'login'
                ? 'Продолжите работу с проектами.'
                : 'Создайте учётную запись для своих проектов.'}
          </p>
          {user?.role === 'guest' && (
            <Link
              className="mb-3 inline-block text-xs underline underline-offset-4"
              to={safeReturnPath(back?.from) ?? '/demo'}
            >
              Продолжить без регистрации
            </Link>
          )}
          {authError && (
            <p role="alert" className="mb-4 text-sm text-crit">
              {authError}
            </p>
          )}
          {mode === 'login' && (
            <>
              <motion.form {...FADE} onSubmit={onLogin} className="space-y-3">
                <Field
                  id="email"
                  label="Эл. почта"
                  action={
                    <ModeLink onClick={() => switchMode('register')} disabled={pending}>
                      Создать аккаунт
                    </ModeLink>
                  }
                >
                  <Input
                    className={FIELD}
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="name@company.ru"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field
                  id="password"
                  label="Пароль"
                  action={
                    <Link
                      to="/forgot-password"
                      className="-my-1 py-1 text-xs underline underline-offset-4 hover:text-ink"
                    >
                      Не помню пароль
                    </Link>
                  }
                >
                  <Input
                    className={FIELD}
                    maxLength={128}
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                {error && (
                  <p role="alert" className="text-sm text-crit">
                    {error}
                  </p>
                )}
                <Button type="submit" className="h-11 w-full" disabled={pending}>
                  {pending && <Spinner />} Войти
                </Button>
              </motion.form>
            </>
          )}
          {mode === 'register' && (
            <>
              <motion.form {...FADE} onSubmit={onRegister} className="space-y-3">
                <Field id="r-name" label="Имя">
                  <Input
                    className={FIELD}
                    id="r-name"
                    autoComplete="name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Иван Петров"
                  />
                </Field>
                <Field
                  id="r-email"
                  label="Эл. почта"
                  action={
                    <ModeLink onClick={() => switchMode('login')} disabled={pending}>
                      Уже есть аккаунт? Войти
                    </ModeLink>
                  }
                >
                  <Input
                    className={FIELD}
                    id="r-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="name@company.ru"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field id="r-password" label="Пароль (не короче 8 символов)">
                  <Input
                    className={FIELD}
                    id="r-password"
                    maxLength={128}
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                {error && (
                  <p role="alert" className="text-sm text-crit">
                    {error}
                  </p>
                )}
                <Button type="submit" className="h-11 w-full" disabled={pending}>
                  {pending && <Spinner />} Зарегистрироваться
                </Button>
              </motion.form>
            </>
          )}

          <ProviderButtons
            returnTo={previousReturn ?? requestedReturn ?? '/app'}
            keepGuest={user?.role === 'guest'}
            disabled={pending}
          />
          {mode === 'login' && (
            <details open className="group/demo mt-5 border-t border-line pt-3">
              <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 rounded text-xs font-medium text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                <span>Демо-аккаунты</span>
                <ChevronDown
                  className="size-3.5 transition-transform group-open/demo:rotate-180 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </summary>
              <div className="space-y-1">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    disabled={pending}
                    onClick={() => void run(() => login({ email: account.email, password: DEMO_PASSWORD }))}
                    className="group flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 text-left transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 sm:min-h-9"
                  >
                    <span className="text-[13px] font-medium">{account.label}</span>
                    <span className="flex items-center gap-2 text-right text-xs text-ink-3">
                      {account.hint}
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </button>
                ))}
              </div>
            </details>
          )}
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-3">
            <Link to="/catalog" className="underline underline-offset-4 hover:text-ink">
              Каталог без входа
            </Link>
            <a href="/privacy/" className="underline underline-offset-4 hover:text-ink">
              Конфиденциальность
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}

function Field({
  id,
  label,
  action,
  children,
}: {
  id: string
  label: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-[13px]">
          {label}
        </Label>
        {action}
      </div>
      {children}
    </div>
  )
}

function ModeLink({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="-my-1 py-1 text-xs underline underline-offset-4 hover:text-ink disabled:opacity-50"
    >
      {children}
    </button>
  )
}

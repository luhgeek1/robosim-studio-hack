import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { problemText } from '@/api/problem'
import { useSession } from '@/api/sessionContext'
import { Button, Field, Segmented, inputCls } from '@/components/ui'

// Demo accounts are part of the submission (ТЗ: демо-учётки для жюри); the password is RS_DEMO_PASSWORD on the backend.
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD ?? 'Demo12345!'
const DEMO_ACCOUNTS = [
  { email: 'user@roboscope.demo', label: 'Пользователь', hint: 'проекты и расчёты' },
  { email: 'admin@roboscope.demo', label: 'Администратор', hint: 'каталог и нормативы' },
  { email: 'vendor@roboscope.demo', label: 'Производитель', hint: 'свои продукты' },
]

export function LoginScreen() {
  const { status, login, register } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/projects'
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  if (status === 'authenticated') return <Navigate to={from} replace />

  const run = async (action: () => Promise<unknown>) => {
    setPending(true)
    setError(null)
    try {
      await action()
      navigate(from, { replace: true })
    } catch (e) {
      setError(problemText(e))
    } finally {
      setPending(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(() => (mode === 'login' ? login({ email, password }) : register({ email, password, name })))
  }

  return (
    <div className="mx-auto grid w-full max-w-[1100px] grid-cols-1 gap-10 px-6 pt-14 pb-16 lg:grid-cols-[1.15fr_1fr]">
      <div>
        <h1 className="display text-[48px] leading-[1.04] tracking-[-0.035em]">Стоит ли роботизировать ваш объект?</h1>
        <p className="mt-5 max-w-[560px] text-[16.5px] leading-relaxed text-ink-2">
          Независимая оценка за несколько минут: какие роботы подходят именно вашему объекту, сколько их нужно на самом
          деле — по имитации на вашей планировке, а не по паспорту, — и когда вложения окупятся.
        </p>
        <div className="mt-8">
          <div className="meta mb-2">Демо-доступ для жюри</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                disabled={pending}
                onClick={() => void run(() => login({ email: account.email, password: DEMO_PASSWORD }))}
                className="card px-4 py-3 text-left transition-colors hover:border-line-2 hover:bg-surface-2 disabled:opacity-50"
              >
                <span className="block text-[14px] font-medium">{account.label}</span>
                <span className="block text-[12.5px] text-ink-3">{account.hint}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="card self-start p-6">
        <Segmented
          layoutId="auth-mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'login', label: 'Вход' },
            { value: 'register', label: 'Регистрация' },
          ]}
        />
        <div className="mt-5 space-y-4">
          {mode === 'register' && (
            <Field label="Имя">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Иван Петров"
                className={inputCls}
              />
            </Field>
          )}
          <Field label="Эл. почта">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.ru"
              className={inputCls}
            />
          </Field>
          <Field label="Пароль" hint={mode === 'register' ? 'Не короче 8 символов' : undefined}>
            <input
              type="password"
              required
              minLength={mode === 'register' ? 8 : undefined}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
        {error && <p className="mt-3 text-[13px] text-crit">{error}</p>}
        <Button type="submit" variant="primary" size="lg" className="mt-5 w-full" disabled={pending}>
          {pending ? 'Входим…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
        </Button>
        <p className="mt-4 text-center text-[12.5px] text-ink-3">Каталог решений доступен без входа.</p>
      </form>
    </div>
  )
}

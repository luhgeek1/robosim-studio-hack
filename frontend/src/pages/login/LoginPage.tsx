import { useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { useSession } from '@/entities/session'
import { problemText } from '@/shared/api/problem'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Spinner } from '@/shared/ui/states'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'

// Demo accounts are part of the submission (ТЗ: демо-учётки для жюри); the password is set by RS_DEMO_PASSWORD on the backend.
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD ?? 'Demo12345!'
const DEMO_ACCOUNTS = [
  { email: 'user@roboscope.demo', label: 'Пользователь', hint: 'проекты и расчёты' },
  { email: 'admin@roboscope.demo', label: 'Администратор', hint: 'каталог и нормативы' },
  { email: 'vendor@roboscope.demo', label: 'Производитель', hint: 'свои продукты' },
]

const STEPS = ['Объект', 'Где деньги', 'Подбор', 'Планировка', 'Расчёт', 'Сравнение', 'Риски']

export function LoginPage() {
  const { status, login, register } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/projects'
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [organization, setOrganization] = useState('')

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

  const onLogin = (e: FormEvent) => {
    e.preventDefault()
    void run(() => login({ email, password }))
  }

  const onRegister = (e: FormEvent) => {
    e.preventDefault()
    void run(() => register({ email, password, name, organization: organization || null }))
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10">
      <div className="grid w-full max-w-5xl gap-10 md:grid-cols-[1.2fr_minmax(0,380px)] md:items-center">
        <div className="space-y-7">
          <h1 className="max-w-lg text-[34px] leading-[1.1] font-semibold tracking-tight">
            Сколько роботов нужно объекту и когда они окупятся
          </h1>
          <p className="max-w-lg text-base text-muted-foreground">
            Каталог решений, подбор под параметры склада, аэропорта или больницы, количество роботов из времени цикла на
            планировке и экономика «как сейчас / покупка / RaaS / лизинг». У каждого числа есть формула и источник.
          </p>
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {STEPS.map((step, i) => (
              <li key={step} className="flex items-center gap-2">
                <span className="num text-muted-foreground/60">{i + 1}</span>
                {step}
                {i < STEPS.length - 1 && <span className="ml-1 h-px w-4 bg-border" aria-hidden />}
              </li>
            ))}
          </ol>
          <div className="space-y-2 pt-2">
            <div className="text-xs text-muted-foreground">Демо-доступ для жюри</div>
            <div className="grid gap-2 sm:grid-cols-3">
              {DEMO_ACCOUNTS.map((account) => (
                <Button
                  key={account.email}
                  variant="outline"
                  className="h-auto flex-col items-start gap-0.5 py-2 text-left"
                  disabled={pending}
                  onClick={() => void run(() => login({ email: account.email, password: DEMO_PASSWORD }))}
                >
                  <span>{account.label}</span>
                  <span className="text-xs font-normal text-muted-foreground">{account.hint}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-surface p-5">
          <Tabs defaultValue="login">
            <TabsList className="mb-4 w-full">
              <TabsTrigger value="login">Вход</TabsTrigger>
              <TabsTrigger value="register">Регистрация</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={onLogin} className="space-y-3">
                <Field id="email" label="Эл. почта">
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="name@company.ru"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field id="password" label="Пароль">
                  <Input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                {error && <p className="text-sm text-crit">{error}</p>}
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending && <Spinner />} Войти
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="register">
              <form onSubmit={onRegister} className="space-y-3">
                <Field id="r-name" label="Имя">
                  <Input
                    id="r-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Иван Петров"
                  />
                </Field>
                <Field id="r-org" label="Организация (необязательно)">
                  <Input
                    id="r-org"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder="ООО «Логистика»"
                  />
                </Field>
                <Field id="r-email" label="Эл. почта">
                  <Input
                    id="r-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field id="r-password" label="Пароль (не короче 8 символов)">
                  <Input
                    id="r-password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                {error && <p className="text-sm text-crit">{error}</p>}
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending && <Spinner />} Зарегистрироваться
                </Button>
              </form>
            </TabsContent>
          </Tabs>
          <p className="mt-4 text-xs text-muted-foreground">Каталог решений открыт без входа.</p>
        </div>
      </div>
    </div>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}

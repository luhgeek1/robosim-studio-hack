import { useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { useSession } from '@/entities/session'
import { problemText } from '@/shared/api/problem'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
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
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="grid w-full max-w-4xl gap-6 md:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col justify-center space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight">Экспресс-оценка роботизации объекта</h1>
          <p className="text-base text-muted-foreground">
            Подбор решений из каталога под параметры склада, аэропорта или больницы, количество роботов из времени цикла
            на планировке, экономика «как сейчас / покупка / RaaS / лизинг» — и у каждого числа есть формула и источник.
          </p>
          <div className="space-y-2">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Демо-доступ</div>
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

        <Card>
          <CardHeader>
            <CardTitle>Вход в платформу</CardTitle>
            <CardDescription>Каталог решений доступен без входа.</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
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

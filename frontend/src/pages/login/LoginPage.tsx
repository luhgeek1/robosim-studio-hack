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
    <div className="mx-auto w-full max-w-275 px-6 pt-12 pb-16">
      <div className="mb-10 max-w-180">
        <h1 className="display text-[44px] leading-[1.05] tracking-[-0.035em]">Стоит ли роботизировать ваш объект?</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-2">
          Загрузите данные склада, аэропорта или больницы — RoboScope приведёт их к единой модели, подберёт роботов из
          каталога, посчитает количество и экономику и проверит конфигурацию имитацией. У каждого числа есть формула и
          источник.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">
        <section>
          <div className="h3 mb-3">Демо-доступ для жюри</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                disabled={pending}
                onClick={() => void run(() => login({ email: account.email, password: DEMO_PASSWORD }))}
                className="card flex flex-col items-start gap-0.5 px-4 py-3 text-left transition-colors hover:border-line-2 hover:bg-surface-2 disabled:opacity-50"
              >
                <span className="text-[14px] font-medium">{account.label}</span>
                <span className="meta">{account.hint}</span>
              </button>
            ))}
          </div>
          <div className="mt-6 rounded-[12px] bg-surface-2 p-5 text-[13.5px] leading-relaxed text-ink-2">
            <div className="h3 mb-2 text-ink">Как это работает</div>
            <ol className="list-decimal space-y-1.5 pl-4">
              <li>Создайте проект и выберите тип объекта — или возьмите демо-склад организатора.</li>
              <li>Проверьте параметры: подтверждённые взяты из файла, допущения помечены.</li>
              <li>Посмотрите, где деньги, и подберите роботов под ограничения объекта.</li>
              <li>Соберите сценарии, сравните покупку и аренду, проверьте флот имитацией.</li>
            </ol>
          </div>
        </section>

        <aside className="card p-5">
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
          <p className="meta mt-4">Каталог решений открыт без входа.</p>
        </aside>
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

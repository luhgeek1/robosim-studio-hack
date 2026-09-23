import { useState, type FormEvent, type ReactNode } from 'react'
import { LayoutGroup, motion, type Transition } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useSession } from '@/entities/session'
import { cn } from '@/shared/lib/utils'
import { problemText } from '@/shared/api/problem'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Spinner } from '@/shared/ui/states'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { DeliveryScene } from './DeliveryScene'

// Demo accounts are part of the submission (ТЗ: демо-учётки для жюри); the password is set by RS_DEMO_PASSWORD on the backend.
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD ?? 'Demo12345!'
const DEMO_ACCOUNTS = [
  { email: 'user@roboscope.demo', label: 'Пользователь', hint: 'проекты и расчёты' },
  { email: 'admin@roboscope.demo', label: 'Администратор', hint: 'каталог и нормативы' },
  { email: 'vendor@roboscope.demo', label: 'Производитель', hint: 'свои продукты' },
]

type Mode = 'login' | 'register'
const SWAP: Transition = { type: 'spring', stiffness: 170, damping: 26, mass: 1 }
const FADE = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, delay: 0.1 },
}

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
  const [mode, setMode] = useState<Mode>('login')

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
    void run(() => register({ email, password, name, organization: organization || null }))
  }

  return (
    <LayoutGroup>
      <div
        className={cn(
          'mx-auto flex w-full max-w-310 flex-1 flex-col-reverse gap-4 px-4 py-4 lg:gap-5 lg:px-6 lg:py-6',
          mode === 'login' ? 'lg:flex-row' : 'lg:flex-row-reverse',
        )}
      >
        <motion.section
          layout
          transition={SWAP}
          className="card relative flex min-h-105 flex-1 flex-col overflow-hidden bg-surface-2 lg:min-h-150"
          style={{
            backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)',
            backgroundSize: '18px 18px',
          }}
        >
          <div className="relative px-8 pt-8 lg:px-10 lg:pt-10">
            <h1 className="display max-w-140 text-[34px] leading-[1.05] tracking-[-0.035em] lg:text-[40px]">
              Стоит ли роботизировать ваш объект?
            </h1>
            <p className="mt-3 max-w-130 text-[15px] leading-relaxed text-ink-2">
              RoboScope подберёт роботов из каталога, посчитает количество и экономику и проверит конфигурацию
              имитацией. У каждого числа есть формула и источник.
            </p>
          </div>
          <div className="relative min-h-0 flex-1 px-4 pb-4">
            <DeliveryScene />
          </div>
        </motion.section>

        <motion.aside
          layout
          transition={SWAP}
          className="card flex w-full shrink-0 flex-col justify-center p-6 lg:w-105 lg:p-8"
        >
          <div className="h2 mb-1">{mode === 'login' ? 'Вход' : 'Регистрация'}</div>
          <p className="meta mb-5">
            {mode === 'login' ? 'Продолжите работу с проектами.' : 'Создайте учётную запись для своих проектов.'}
          </p>
          <Tabs value={mode} onValueChange={(v) => switchMode(v as Mode)}>
            <TabsList className="mb-4 w-full">
              <TabsTrigger value="login">Вход</TabsTrigger>
              <TabsTrigger value="register">Регистрация</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <motion.form {...FADE} onSubmit={onLogin} className="space-y-3">
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
              </motion.form>
            </TabsContent>
            <TabsContent value="register">
              <motion.form {...FADE} onSubmit={onRegister} className="space-y-3">
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
                    placeholder="name@company.ru"
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
              </motion.form>
            </TabsContent>
          </Tabs>

          {mode === 'login' && (
            <div className="hairline mt-6 pt-5">
              <div className="h3 mb-2 text-[14px]">Демо-доступ для жюри</div>
              <div className="space-y-1.5">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    disabled={pending}
                    onClick={() => void run(() => login({ email: account.email, password: DEMO_PASSWORD }))}
                    className="group flex w-full items-center justify-between gap-3 rounded-[10px] border border-line px-3 py-2 text-left transition-colors hover:border-line-2 hover:bg-surface-2 disabled:opacity-50"
                  >
                    <span className="text-[13.5px] font-medium">{account.label}</span>
                    <span className="meta flex items-center gap-1">
                      {account.hint}
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="meta mt-4">
            <Link to="/catalog" className="underline-offset-2 hover:text-ink hover:underline">
              Каталог решений
            </Link>{' '}
            открыт без входа.
          </p>
        </motion.aside>
      </div>
    </LayoutGroup>
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

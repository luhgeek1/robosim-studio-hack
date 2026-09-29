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
  { email: 'user@robomera.demo', label: 'Пользователь', hint: 'проекты и расчёты' },
  { email: 'admin@robomera.demo', label: 'Администратор', hint: 'каталог, нормативы и пользователи' },
  { email: 'vendor@robomera.demo', label: 'Производитель', hint: 'каталог и расчёты' },
]

type Mode = 'login' | 'register'
const SWAP: Transition = { type: 'spring', stiffness: 170, damping: 26, mass: 1 }
// Auth fields are the only thing on this half, so they are larger and more contrasted than the in-app inputs.
const FIELD = 'h-12 rounded-[10px] bg-card px-4 text-[15px]! shadow-[0_1px_2px_rgba(20,20,24,0.04)]'
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
        className={cn('flex w-full flex-1 flex-col-reverse', mode === 'login' ? 'lg:flex-row' : 'lg:flex-row-reverse')}
      >
        <motion.section
          layout
          transition={SWAP}
          className="relative flex min-h-90 flex-col items-center justify-center overflow-hidden bg-surface-2 px-6 py-10 lg:w-1/2 lg:px-8"
          style={{
            backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)',
            backgroundSize: '18px 18px',
          }}
        >
          <h1 className="display max-w-150 text-center text-[32px] leading-[1.05] tracking-[-0.035em] lg:text-[40px]">
            Стоит ли роботизировать ваш объект?
          </h1>
          <div className="mt-16 w-full max-w-190 lg:mt-28">
            <DeliveryScene />
          </div>
        </motion.section>

        <motion.aside
          layout
          transition={SWAP}
          className="flex flex-col items-center justify-center bg-canvas px-6 py-8 lg:w-1/2 lg:px-12"
        >
          <div className="w-full max-w-110">
            <div className="h1 mb-2">{mode === 'login' ? 'Вход' : 'Регистрация'}</div>
            <p className="mb-6 text-[15px] text-ink-3">
              {mode === 'login' ? 'Продолжите работу с проектами.' : 'Создайте учётную запись для своих проектов.'}
            </p>
            <Tabs value={mode} onValueChange={(v) => switchMode(v as Mode)}>
              <TabsList className="mb-5 h-11! w-full">
                <TabsTrigger value="login">Вход</TabsTrigger>
                <TabsTrigger value="register">Регистрация</TabsTrigger>
              </TabsList>
              <TabsContent value="login">
                <motion.form {...FADE} onSubmit={onLogin} className="space-y-4">
                  <Field id="email" label="Эл. почта">
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
                  <Field id="password" label="Пароль">
                    <Input
                      className={FIELD}
                      id="password"
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </Field>
                  {error && <p className="text-sm text-crit">{error}</p>}
                  <Button type="submit" className="mt-2 h-12 w-full text-[15px]" disabled={pending}>
                    {pending && <Spinner />} Войти
                  </Button>
                </motion.form>
              </TabsContent>
              <TabsContent value="register">
                <motion.form {...FADE} onSubmit={onRegister} className="space-y-4">
                  <Field id="r-name" label="Имя">
                    <Input
                      className={FIELD}
                      id="r-name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Иван Петров"
                    />
                  </Field>
                  <Field id="r-org" label="Организация (необязательно)">
                    <Input
                      className={FIELD}
                      id="r-org"
                      value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                      placeholder="ООО «Логистика»"
                    />
                  </Field>
                  <Field id="r-email" label="Эл. почта">
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
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </Field>
                  {error && <p className="text-sm text-crit">{error}</p>}
                  <Button type="submit" className="mt-2 h-12 w-full text-[15px]" disabled={pending}>
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
                      className="group flex w-full items-center justify-between gap-3 rounded-[10px] border border-line bg-card px-4 py-2.5 text-left transition-colors hover:border-line-2 hover:bg-surface-2 disabled:opacity-50"
                    >
                      <span className="text-[14px] font-medium">{account.label}</span>
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
          </div>
        </motion.aside>
      </div>
    </LayoutGroup>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-[14px]">
        {label}
      </Label>
      {children}
    </div>
  )
}

import { ArrowRight, Boxes, Check, Hospital, Plane, Warehouse } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useDemo, useDemoList, type DemoSnapshot } from '@/entities/demo/api'
import { DEMO_PROJECTS } from '@/entities/demo/navigation'
import { useJourneyStore } from '@/entities/project/journey'
import { useSession } from '@/entities/session'
import { CreateProjectDialog } from '@/features/project-create'
import { api } from '@/shared/api/client'
import type { Project } from '@/shared/api/types'
import { formatNumber, formatRub, formatYears, pluralRu } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'

const ICONS = [Warehouse, Boxes, Hospital, Plane]
const DESTINATION: Record<string, string> = {
  decision: 'comparison',
  evidence: 'matching',
  matching: 'matching',
  simulation: 'simulation',
  report: 'report',
}

export function DemoPage() {
  const { status, user, startGuest } = useSession()
  const { demoKey } = useParams()
  const [params] = useSearchParams()
  const list = useDemoList()
  const [error, setError] = useState<unknown>(null)
  const starting = useRef(false)
  const [ownOpen, setOwnOpen] = useState(params.get('new') === '1')
  useEffect(() => {
    if (status === 'restoring' || user || starting.current || error) return
    starting.current = true
    startGuest()
      .catch(setError)
      .finally(() => {
        starting.current = false
      })
  }, [status, user, startGuest, error])
  if (error) return <ErrorBlock error={error} onRetry={() => setError(null)} />
  if (status === 'restoring' || !user) return <LoadingBlock className="p-8" label="Открываем гостевое пространство…" />
  if (demoKey)
    return <OpenExample key={`${user.id}:${demoKey}`} demoKey={demoKey} userId={user.id} step={params.get('step')} />
  return (
    <div className="mx-auto w-full max-w-300 px-4 pt-10 pb-16 sm:px-6 sm:pt-16">
      <div className="max-w-200">
        <p className="hud mb-5 text-ink-3">РОБОМЕРА / ПОПРОБОВАТЬ БЕЗ РЕГИСТРАЦИИ</p>
        <h1 className="display text-[clamp(2rem,5vw,3.5rem)] leading-[1.06]">
          От объекта до решения.
          <br />
          <span className="text-ink-3">Пройдите путь сами.</span>
        </h1>
        <p className="mt-5 max-w-170 text-base leading-relaxed text-ink-3">
          Готовый объект, подобранные роботы, экономика и проверка в имитации. Это ваша личная копия: исследуйте её,
          меняйте параметры и скачивайте отчёт.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-4">
          <Button asChild size="lg">
            <Link to="/demo/warehouse_demo_01">
              Начать со склада <ArrowRight />
            </Link>
          </Button>
          <span className="text-sm text-ink-3">5 шагов · все инструменты доступны</span>
        </div>
      </div>
      <div className="my-10 flex flex-wrap gap-x-6 gap-y-3 border-y border-line py-5 text-sm text-ink-3">
        {[
          'Модель объекта и 3D-роботы',
          'Покупка, RaaS и лизинг',
          'Реальная имитация → расчёт',
          'Отчёт PDF и Excel',
        ].map((label) => (
          <span className="flex items-center gap-2" key={label}>
            <Check size={15} className="text-ok" />
            {label}
          </span>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h2 className="h2">Выберите объект</h2>
        <span className="text-sm text-ink-3">Исходные данные и допущения раскрыты внутри</span>
      </div>
      {list.error && <ErrorBlock error={list.error} onRetry={() => list.refetch()} />}
      <div className="grid gap-4 sm:grid-cols-2">
        {DEMO_PROJECTS.map((demo, i) => {
          const details = list.data?.find((item) => item.key === demo.key)
          const Icon = ICONS[i]
          const headline = details?.headline
          return (
            <Link
              key={demo.key}
              to={`/demo/${demo.key}`}
              className="group card relative overflow-hidden p-6 transition-colors hover:bg-surface-2 sm:p-7"
            >
              <div className="mb-6 flex items-start justify-between">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-ink-2">
                  <Icon size={30} strokeWidth={1.3} />
                </div>
                <span className="hud text-ink-3">{i === 0 ? 'НАЧНИТЕ ЗДЕСЬ' : `0${i + 1} / ПРИМЕР`}</span>
              </div>
              <h3 className="h2">{details?.name ?? demo.label}</h3>
              <p className="mt-2 min-h-12 text-sm leading-relaxed text-ink-3">
                {details?.description ?? 'Подготовленный объект с независимой копией параметров и расчётов.'}
              </p>
              {headline?.robots_total != null && (
                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-4 text-sm">
                  <span>
                    <strong className="num text-lg">{formatNumber(headline.robots_total)}</strong>{' '}
                    {pluralRu(headline.robots_total, ['робот', 'робота', 'роботов'])}
                  </span>
                  {headline.capex_rub != null && <span>{formatRub(headline.capex_rub)} вложений</span>}
                  {headline.payback_years != null && <span>{formatYears(headline.payback_years)} до окупаемости</span>}
                </div>
              )}
              <span className="mt-6 flex items-center justify-between text-sm font-medium">
                Открыть и исследовать{' '}
                <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          )
        })}
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-5 rounded-2xl bg-surface-2 p-6">
        <div>
          <h2 className="h3">Хотите начать с чистого листа?</h2>
          <p className="mt-1 max-w-160 text-sm text-ink-3">
            Введите свои тестовые параметры или загрузите Excel. Для конфиденциальных данных сначала создайте аккаунт.
          </p>
        </div>
        <CreateProjectDialog
          initialMode="blank"
          open={ownOpen}
          onOpenChange={setOwnOpen}
          trigger={<Button variant="outline">Создать свой проект</Button>}
        />
      </div>
      <p className="mt-6 text-sm text-ink-3">
        Гостевые проекты хранятся 24 часа. «Сохранить в аккаунт» перенесёт ваши правки и результаты после регистрации
        или входа.
      </p>
      <details id="demo-limits" className="mt-4 text-xs leading-relaxed text-ink-3">
        <summary className="cursor-pointer">Лимиты гостевого пространства</summary>
        <p className="mt-2">
          До 10 проектов, 30 сценариев и 100 фоновых задач. Две задачи одновременно, до 12 запусков в минуту. Файлы до 5
          МБ, суммарно до 100 МБ. Имитация до 24 часов, 500 роботов и 500 000 операций; ручной перебор до 20 вариантов.
          Монте-Карло до 1000 прогонов. Полные инструменты доступны в пределах этих лимитов.
        </p>
      </details>
    </div>
  )
}

function OpenExample({ demoKey, userId, step }: { demoKey: string; userId: string; step: string | null }) {
  const demo = useDemo(demoKey)
  const navigate = useNavigate()
  const open = useJourneyStore((s) => s.open)
  const [error, setError] = useState<unknown>(null)
  const opening = useRef(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!demo.data || 'status' in demo.data || opening.current) return
    const snapshot: DemoSnapshot = demo.data
    opening.current = true
    const storageKey = `robomera-demo-open:${userId}:${demoKey}`
    let requestId = localStorage.getItem(storageKey)
    if (!requestId) {
      requestId = crypto.randomUUID()
      localStorage.setItem(storageKey, requestId)
    }
    api
      .post<{ project: Project }>(`/demo/projects/${encodeURIComponent(demoKey)}/open`, {
        request_id: requestId,
        revision: snapshot.revision,
      })
      .then(({ data }) => {
        open(data.project.id, demoKey)
        navigate(`/projects/${data.project.id}/${DESTINATION[step ?? ''] ?? 'object'}`, { replace: true })
      })
      .catch((reason: unknown) => {
        setError(reason)
        opening.current = false
      })
  }, [demo.data, demoKey, userId, navigate, open, step, attempt])
  return (
    <div className="mx-auto w-full max-w-160 px-6 py-16">
      <Link to="/demo" className="text-sm text-ink-3 hover:underline">
        ← Все примеры
      </Link>
      <h1 className="h1 mt-8">Готовим вашу копию</h1>
      <p className="mt-3 text-ink-3">
        Подбор, сравнение вариантов и проверка парка будут уже на месте. Дальше вы сможете менять условия
        самостоятельно.
      </p>
      {demo.error || error ? (
        <ErrorBlock
          className="mt-6"
          error={demo.error ?? error}
          onRetry={() => {
            setError(null)
            setAttempt((v) => v + 1)
            void demo.refetch()
          }}
        />
      ) : (
        <div className="mt-8 flex items-center gap-3 text-sm" role="status">
          <Spinner />
          {demo.data && 'status' in demo.data ? demo.data.stage : 'Копируем расчёты и результаты проверки…'}
        </div>
      )}
    </div>
  )
}

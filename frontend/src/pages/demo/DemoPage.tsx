import { ArrowRight, Boxes, Hospital, Plane, Plus, Warehouse } from 'lucide-react'
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
  const [ownOpen, setOwnOpen] = useState(params.get('new') === '1')
  const [error, setError] = useState<unknown>(null)
  const starting = useRef(false)
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
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Демо без регистрации</h1>
          <p className="mt-1 text-sm text-muted-foreground">Готовые расчёты — в вашей личной копии.</p>
        </div>
        <Button asChild className="h-9 px-3">
          <Link to="/demo/warehouse_demo_01">
            Начать со склада <ArrowRight />
          </Link>
        </Button>
      </header>

      <section className="mt-6" aria-labelledby="demo-examples-title">
        <h2 id="demo-examples-title" className="mb-3 text-sm font-medium">
          Выберите объект
        </h2>
        {list.error && <ErrorBlock className="mb-3" error={list.error} onRetry={() => void list.refetch()} />}
        <ul className="grid auto-cols-[minmax(15rem,1fr)] grid-flow-col snap-x snap-mandatory gap-3 overflow-x-auto px-0.5 pt-0.5 pb-3 lg:auto-cols-auto lg:grid-flow-row lg:grid-cols-4 lg:overflow-visible lg:pb-0">
          {DEMO_PROJECTS.map((demo, i) => {
            const details = list.data?.find((item) => item.key === demo.key)
            const headline = details?.headline
            const Icon = ICONS[i]
            return (
              <li key={demo.key} className="min-w-0 snap-start">
                <Link
                  to={`/demo/${demo.key}`}
                  aria-labelledby={`demo-title-${demo.key}`}
                  className="group flex aspect-square flex-col rounded-xl border border-line bg-popover p-4 transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`flex size-9 items-center justify-center rounded-[10px] ${i === 0 ? 'bg-signal-soft text-[#b84021]' : 'border border-line bg-raised/40 text-ink-2'}`}
                    >
                      <Icon size={21} strokeWidth={1.6} aria-hidden />
                    </span>
                    {i === 0 ? (
                      <span className="rounded bg-signal-soft px-2 py-1 text-[10px] leading-none text-[#a63c22]">
                        Для старта
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-ink-4" aria-hidden>
                        0{i + 1}
                      </span>
                    )}
                  </div>
                  <h3
                    id={`demo-title-${demo.key}`}
                    className="mt-3 min-h-10 text-sm leading-5 font-semibold tracking-tight"
                  >
                    {details?.name ?? demo.label}
                  </h3>
                  <dl className="mt-3 space-y-1 text-xs">
                    <div className="flex items-baseline justify-between gap-2">
                      <dt className="text-[11px] text-muted-foreground">Парк</dt>
                      <dd className="num font-medium">
                        {headline?.robots_total != null ? (
                          <>
                            {formatNumber(headline.robots_total)}{' '}
                            {pluralRu(headline.robots_total, ['робот', 'робота', 'роботов'])}
                          </>
                        ) : (
                          '—'
                        )}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <dt className="text-[11px] text-muted-foreground">Вложения</dt>
                      <dd className="num font-medium">{formatRub(headline?.capex_rub)}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <dt className="text-[11px] text-muted-foreground">Окупаемость</dt>
                      <dd className="num font-medium">{headline ? formatYears(headline.payback_years) : '—'}</dd>
                    </div>
                  </dl>
                  <span className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3 text-xs font-medium text-ink-2">
                    Открыть пример
                    <ArrowRight
                      size={15}
                      className="text-ink-3 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
        <details className="mt-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Об объектах и исходных данных</summary>
          <div className="mt-3 space-y-3 border-t border-line pt-3">
            {DEMO_PROJECTS.map((demo) => {
              const details = list.data?.find((item) => item.key === demo.key)
              return (
                <div key={demo.key}>
                  <h3 className="mb-1 font-medium text-foreground">{details?.name ?? demo.label}</h3>
                  <p className="leading-relaxed">
                    {details?.description ?? 'Готовый объект с независимой копией параметров и расчётов.'}
                  </p>
                  {details?.scope && <p className="mt-1 leading-relaxed">{details.scope}</p>}
                </div>
              )
            })}
          </div>
        </details>
      </section>

      <section
        className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-popover p-4"
        aria-labelledby="demo-own-project-title"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-raised/40">
          <Plus size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="demo-own-project-title" className="text-sm font-medium">
            Свой объект
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Параметры вручную или из файла</p>
        </div>
        <CreateProjectDialog
          initialMode="blank"
          open={ownOpen}
          onOpenChange={setOwnOpen}
          trigger={
            <Button variant="outline" className="h-9 max-sm:w-full">
              Создать свой проект <ArrowRight />
            </Button>
          }
        />
      </section>
      <details id="demo-limits" className="mt-3 text-xs leading-relaxed text-muted-foreground">
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

import { ArrowRight, Boxes, FileCheck2, Hospital, Plane, Play, Plus, SlidersHorizontal, Warehouse } from 'lucide-react'
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
const CATEGORIES = ['Складская логистика', 'Фулфилмент', 'Медицина', 'Аэропорт']
const STEPS = [
  { label: 'Объект', detail: 'Исходные параметры' },
  { label: 'Роботы', detail: 'Подбор и 3D-модели' },
  { label: 'Экономика', detail: 'Покупка, RaaS, лизинг' },
  { label: 'Имитация', detail: 'Проверка в работе' },
  { label: 'Решение', detail: 'Отчёт PDF и Excel' },
]
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
    <div className="mx-auto w-full max-w-282 px-4 pt-6 pb-8 sm:px-6 sm:pt-7">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center sm:gap-8">
        <div>
          <p className="mb-3 flex items-center gap-2 font-mono text-[9px] font-medium tracking-[0.07em] text-ink-3">
            <span className="size-1.5 rounded-full bg-signal" aria-hidden />
            ДЕМО-ПРОСТРАНСТВО <span className="text-ink-4">/</span> БЕЗ РЕГИСТРАЦИИ
          </p>
          <h1 className="text-[clamp(1.625rem,2.6vw,2.125rem)] leading-[1.16] font-semibold tracking-[-0.045em]">
            От объекта до решения.
            <span className="block font-normal text-ink-3">Пройдите путь сами.</span>
          </h1>
          <p className="mt-3 max-w-140 text-[13px] leading-relaxed text-ink-3">
            Выберите готовый объект, меняйте параметры и проверяйте результат. Роботы, экономика и имитация уже собраны
            в вашей личной копии.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 sm:flex-col sm:gap-2.5">
          <Button asChild className="h-9 px-4">
            <Link to="/demo/warehouse_demo_01">
              Начать со склада <ArrowRight />
            </Link>
          </Button>
          <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
            <SlidersHorizontal size={13} aria-hidden /> Все инструменты доступны
          </span>
        </div>
      </header>
      <ol
        className="my-5 grid grid-cols-5 rounded-xl border border-line bg-surface-2 px-2 py-3 sm:my-6 sm:px-4"
        aria-label="Путь от объекта до решения"
      >
        {STEPS.map((step, i) => (
          <li key={step.label} className="flex min-w-0 flex-col items-center gap-1 sm:flex-row sm:gap-2 lg:gap-3">
            <span className={`font-mono text-[10px] ${i === 0 ? 'text-signal' : 'text-ink-4'}`}>0{i + 1}</span>
            <div>
              <span className="block text-[10px] font-medium sm:text-xs">{step.label}</span>
              <span className="mt-0.5 hidden text-[10px] text-ink-3 lg:block">{step.detail}</span>
            </div>
            {i < STEPS.length - 1 && (
              <ArrowRight size={13} className="mr-4 ml-auto hidden shrink-0 text-ink-4 lg:block" aria-hidden />
            )}
          </li>
        ))}
      </ol>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
          Выберите объект
          <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] font-normal text-ink-3">
            0{DEMO_PROJECTS.length}
          </span>
        </h2>
        <span className="text-[11px] text-ink-3">Готовые расчёты · можно менять всё</span>
      </div>
      {list.error && <ErrorBlock error={list.error} onRetry={() => list.refetch()} />}
      <div className="grid gap-3 sm:grid-cols-2">
        {DEMO_PROJECTS.map((demo, i) => {
          const details = list.data?.find((item) => item.key === demo.key)
          const Icon = ICONS[i]
          const headline = details?.headline
          return (
            <Link
              key={demo.key}
              to={`/demo/${demo.key}`}
              className={`group flex min-w-0 flex-col rounded-xl border px-4 pt-4 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:shadow-card focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring sm:px-5 ${i === 0 ? 'border-signal/40 bg-linear-to-br from-[#fff6ee] to-surface hover:border-signal' : 'border-line bg-surface hover:border-line-2'}`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex size-9 shrink-0 items-center justify-center rounded-[10px] ${i === 0 ? 'bg-signal-soft text-[#b84021]' : 'border border-line bg-surface-2 text-ink-2'}`}
                >
                  <Icon size={21} strokeWidth={1.6} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="mb-1 block text-[10px] leading-none text-ink-3">{CATEGORIES[i]}</span>
                  <h3 className="text-[15px] leading-snug font-semibold tracking-tight">
                    {details?.name ?? demo.label}
                  </h3>
                </div>
                {i === 0 ? (
                  <span className="hidden self-start rounded bg-signal-soft px-1.5 py-1 text-[9px] leading-none font-medium text-[#a63c22] lg:block">
                    Начните здесь
                  </span>
                ) : (
                  <span className="self-start font-mono text-[10px] text-ink-4">0{i + 1}</span>
                )}
              </div>
              <p className="mt-3 mb-3.5 flex-1 text-xs leading-relaxed text-ink-3">
                {details?.description ?? 'Подготовленный объект с независимой копией параметров и расчётов.'}
              </p>
              {headline?.robots_total != null && (
                <dl className="mb-3.5 grid grid-cols-[0.9fr_1fr_1fr] gap-2 sm:gap-3">
                  <div>
                    <dt className="mb-1 text-[10px] text-ink-3">Парк роботов</dt>
                    <dd className="num text-sm font-medium">
                      {formatNumber(headline.robots_total)}{' '}
                      <span className="text-[11px] font-normal">
                        {pluralRu(headline.robots_total, ['робот', 'робота', 'роботов'])}
                      </span>
                    </dd>
                  </div>
                  {headline.capex_rub != null && (
                    <div>
                      <dt className="mb-1 text-[10px] text-ink-3">Вложения</dt>
                      <dd className="num text-sm font-medium">{formatRub(headline.capex_rub)}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="mb-1 text-[10px] text-ink-3">Окупаемость</dt>
                    <dd
                      className={
                        headline.payback_years != null ? 'num text-sm font-medium' : 'text-xs leading-5 text-ink-3'
                      }
                    >
                      {headline.payback_years != null ? formatYears(headline.payback_years) : 'Не достигается'}
                    </dd>
                  </div>
                </dl>
              )}
              <span
                className={`flex min-h-10 items-center justify-between gap-3 border-t border-line text-[11px] font-medium ${i === 0 ? 'text-[#b84021]' : 'text-ink-2'}`}
              >
                <span className="flex items-center gap-1.5">
                  <Play size={12} aria-hidden /> Открыть и исследовать
                </span>
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden />
              </span>
            </Link>
          )
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line-2 px-4 py-3.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line text-ink-2">
          <Plus size={18} aria-hidden />
        </span>
        <div className="flex-1 basis-[calc(100%-3rem)] sm:basis-0">
          <h2 className="text-xs font-semibold">Или начните со своего объекта</h2>
          <p className="mt-1 text-[11px] text-ink-3">
            Введите тестовые параметры или загрузите Excel. Для конфиденциальных данных создайте аккаунт.
          </p>
        </div>
        <CreateProjectDialog
          initialMode="blank"
          open={ownOpen}
          onOpenChange={setOwnOpen}
          trigger={
            <Button variant="outline" size="sm" className="w-full sm:w-auto">
              Создать свой проект <ArrowRight />
            </Button>
          }
        />
      </div>
      <footer className="mt-4 flex flex-wrap justify-between gap-x-4 gap-y-1.5 text-[10px] text-ink-3">
        <p className="flex items-center gap-1.5">
          <FileCheck2 size={14} aria-hidden /> Исходные данные и допущения раскрыты в каждом проекте.
        </p>
        <p>Копия хранится 24 часа. Сохраните её в аккаунт, чтобы продолжить позже.</p>
      </footer>
      <details id="demo-limits" className="mt-2.5 text-[10px] leading-relaxed text-ink-3">
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

import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { DEMO_PROJECTS } from '@/entities/demo/navigation'
import { projectApi } from '@/entities/project/api'
import { useSession } from '@/entities/session'
import { CreateProjectDialog } from '@/features/project-create'
import { Button } from '@/shared/ui/button'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'

const DESTINATION: Record<string, string> = {
  decision: 'matching',
  evidence: 'matching',
  simulation: 'simulation',
  report: 'report',
}

export function DemoPage() {
  const { status, user, startGuest } = useSession()
  const { demoKey } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<unknown>(null)
  const starting = useRef(false)
  const creating = useRef(false)
  const [ownOpen, setOwnOpen] = useState(params.get('new') === '1')
  useEffect(() => {
    if (status === 'restoring' || user || starting.current) return
    starting.current = true
    startGuest()
      .catch(setError)
      .finally(() => {
        starting.current = false
      })
  }, [status, user, startGuest])
  useEffect(() => {
    if (!demoKey || !user || creating.current) return
    const demo = DEMO_PROJECTS.find((item) => item.key === demoKey)
    if (!demo) return
    creating.current = true
    projectApi
      .create({ name: demo.label, object_type: demo.objectType, init: { mode: 'demo', demo_key: demo.key } })
      .then((project) =>
        navigate(`/projects/${project.id}/${DESTINATION[params.get('step') ?? ''] ?? 'object'}`, { replace: true }),
      )
      .catch(setError)
  }, [demoKey, user, params, navigate])
  if (error) return <ErrorBlock error={error} onRetry={() => window.location.reload()} />
  if (status === 'restoring' || !user || (demoKey && DEMO_PROJECTS.some((item) => item.key === demoKey))) {
    return <LoadingBlock className="p-8" label="Готовим ваше пространство…" />
  }
  return (
    <div className="mx-auto w-full max-w-275 space-y-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="display text-4xl">Попробуйте РобоМеру без регистрации</h1>
        <p className="mt-3 max-w-3xl text-ink-3">
          Откройте готовый объект или создайте свой. Параметры, подбор, планировка, экономика, сценарии, сравнение,
          риски, имитация в 2D и 3D и отчёты доступны в обычном интерфейсе.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {DEMO_PROJECTS.map((demo) => (
          <Link className="card block p-5 hover:bg-surface-2" key={demo.key} to={`/demo/${demo.key}`}>
            <span className="font-semibold">{demo.label}</span>
            <span className="mt-2 block text-sm text-ink-3">Открыть независимую копию →</span>
          </Link>
        ))}
      </div>
      <CreateProjectDialog
        initialMode="blank"
        open={ownOpen}
        onOpenChange={setOwnOpen}
        trigger={<Button>Создать свой проект</Button>}
      />
      <p className="text-sm text-ink-3">
        Excel, CSV и JSON до 5 МБ или ручной ввод. Временные данные удаляются через 24 часа. Регистрация понадобится для
        сохранения надолго и совместной работы.
      </p>
      <details id="demo-limits" className="card p-4 text-sm text-ink-3">
        <summary className="cursor-pointer font-medium text-ink">Лимиты гостевого пространства</summary>
        <p className="mt-3">
          До 10 проектов, 30 сценариев, 100 фоновых задач и 100 МБ файлов за сессию. Одновременно выполняются две
          задачи; можно запускать до 12 расчётов в минуту. До 10 новых сессий в час с одного IP.
        </p>
        <p className="mt-2">
          Имитация — до 24 часов, 100 роботов и 100 000 операций. Монте-Карло — до 1000 прогонов. Планировка — до 3000
          узлов и 6000 проездов; заданный вручную диапазон перебора — до 20 вариантов. Генератор: площадь до 200 000 м²,
          ёмкость до 100 000 паллетомест; для более крупных объектов уменьшите параметры.
        </p>
        <p className="mt-2">
          Файлы — до 5 МБ. Excel: до 20 листов, 10 000 строк, 100 столбцов и 100 000 ячеек суммарно; распакованный объём
          до 25 МБ. CSV и JSON — до 10 000 строк или полей.
        </p>
      </details>
      <Button asChild variant="outline">
        <Link to="/projects">Мои временные проекты</Link>
      </Button>
    </div>
  )
}

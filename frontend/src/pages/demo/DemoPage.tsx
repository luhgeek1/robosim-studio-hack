import { Building2, ChevronDown, HeartPulse, Plane, Warehouse } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useDemo, useDemoList, type DemoSnapshot } from '@/entities/demo/api'
import { useWorkspace } from '@/entities/organization'
import { OBJECT_TYPE_LABEL, useCreateProject } from '@/entities/project'
import { useJourneyStore } from '@/entities/project/journey'
import { useObjectTypes } from '@/entities/reference'
import { useSession } from '@/entities/session'
import { ProjectChoice } from '@/features/project-create'
import { api } from '@/shared/api/client'
import type { ObjectTypeKey, Project } from '@/shared/api/types'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'

const OBJECT_TYPE_ICON = { warehouse: Warehouse, airport: Plane, hospital: HeartPulse, custom: Building2 }
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
  return <DemoSetup key={`${user.id}:${params.get('new')}`} initialBlank={params.get('new') === '1'} />
}

function DemoSetup({ initialBlank }: { initialBlank: boolean }) {
  const navigate = useNavigate()
  const objectTypes = useObjectTypes()
  const examples = useDemoList()
  const create = useCreateProject()
  const workspace = useWorkspace()
  const [objectType, setObjectType] = useState<ObjectTypeKey>('warehouse')
  const [selection, setSelection] = useState<string | null>(initialBlank ? 'blank' : null)
  const [name, setName] = useState('')
  const selected = objectTypes.data?.find((type) => type.key === objectType)
  const demos = selected?.demo_projects ?? []
  const demo = demos.find((item) => item.key === selection) ?? demos[0]
  const blank = selection === 'blank' || demos.length === 0
  const details = examples.data?.find((item) => item.key === demo?.key)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected || create.isPending) return
    if (!blank && demo) {
      navigate(`/demo/${demo.key}`)
      return
    }
    try {
      const project = await create.mutateAsync({
        name: name.trim() || `Новый объект: ${OBJECT_TYPE_LABEL[objectType]}`,
        object_type: objectType,
        init: { mode: 'blank' },
        organization_id: workspace.id,
      })
      navigate(`/projects/${project.id}`)
    } catch {
      // The mutation error is shown beside the form so its inputs remain available.
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6 sm:py-8">
      <form
        onSubmit={submit}
        className="overflow-hidden rounded-xl bg-popover text-popover-foreground ring-1 ring-foreground/10"
        aria-labelledby="demo-setup-title"
      >
        <header className="space-y-2 border-b px-4 py-4 sm:px-5">
          <h1 id="demo-setup-title" className="text-base leading-none font-medium">
            Новый проект оценки
          </h1>
          <p className="text-sm text-muted-foreground">Выберите объект и начальные данные.</p>
        </header>
        <div className="space-y-5 px-4 py-5 sm:px-5">
          {objectTypes.error ? (
            <ErrorBlock error={objectTypes.error} onRetry={() => void objectTypes.refetch()} />
          ) : !objectTypes.data ? (
            <LoadingBlock label="Загружаем объекты…" />
          ) : (
            <>
              <fieldset className="min-w-0 space-y-2" disabled={create.isPending}>
                <legend className="mb-2 text-sm font-medium">Тип объекта</legend>
                <div className="grid grid-cols-3 gap-2">
                  {objectTypes.data.map((type) => {
                    const Icon = OBJECT_TYPE_ICON[type.key]
                    return (
                      <ProjectChoice
                        key={type.key}
                        name="object-type"
                        value={type.key}
                        active={type.key === objectType}
                        compact
                        onChange={() => {
                          setObjectType(type.key)
                          setSelection(blank ? 'blank' : null)
                          create.reset()
                        }}
                      >
                        <Icon className="size-5 shrink-0" aria-hidden="true" />
                        <span className="font-medium leading-snug sm:hidden">
                          {type.key === 'hospital' ? 'Медицина' : type.name}
                        </span>
                        <span className="hidden font-medium leading-snug sm:block">{type.name}</span>
                      </ProjectChoice>
                    )
                  })}
                </div>
              </fieldset>
              <fieldset className="min-w-0 space-y-2" disabled={create.isPending}>
                <legend className="mb-2 text-sm font-medium">Начальные данные</legend>
                <div className="grid gap-2">
                  {demos.map((item) => (
                    <ProjectChoice
                      key={item.key}
                      name="initial-data"
                      value={item.key}
                      active={!blank && item.key === demo?.key}
                      onChange={() => {
                        setSelection(item.key)
                        create.reset()
                      }}
                    >
                      <span className="font-medium">
                        {examples.data?.find((example) => example.key === item.key)?.name ?? item.name}
                      </span>
                    </ProjectChoice>
                  ))}
                  <ProjectChoice
                    name="initial-data"
                    value="blank"
                    active={blank}
                    onChange={() => {
                      setSelection('blank')
                      create.reset()
                    }}
                  >
                    <span className="font-medium">Пустой проект</span>
                  </ProjectChoice>
                </div>
                {!blank && demo && (
                  <details key={demo.key} className="group rounded-md bg-muted/40 px-3">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium [&::-webkit-details-marker]:hidden">
                      Описание набора
                      <ChevronDown
                        className="size-4 shrink-0 transition-transform group-open:rotate-180"
                        aria-hidden="true"
                      />
                    </summary>
                    <p className="pb-3 text-xs leading-relaxed text-muted-foreground">
                      {details?.description ?? demo.description}
                    </p>
                  </details>
                )}
              </fieldset>
              {blank && (
                <div className="space-y-2">
                  <Label htmlFor="demo-project-name">Название</Label>
                  <Input
                    id="demo-project-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Например: РЦ Подмосковье"
                    maxLength={200}
                    className="h-11"
                    disabled={create.isPending}
                  />
                </div>
              )}
              {create.error && <ErrorBlock error={create.error} />}
            </>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t px-4 py-3 sm:px-5">
          <Button asChild variant="outline" className="h-11 px-4">
            <Link to="/">Отмена</Link>
          </Button>
          <Button type="submit" className="h-11 px-5 max-sm:flex-1" disabled={!selected || create.isPending}>
            {create.isPending && <Spinner />}
            {blank ? 'Создать проект' : 'Открыть демо'}
          </Button>
        </footer>
      </form>
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

import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Building2, ChevronDown, HeartPulse, Plane, Warehouse } from 'lucide-react'
import { useNavigate } from 'react-router'
import { quoted, useWorkspace } from '@/entities/organization'
import { OBJECT_TYPE_LABEL, useCreateProject } from '@/entities/project'
import { useObjectTypes } from '@/entities/reference'
import type { ObjectTypeKey } from '@/shared/api/types'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Spinner } from '@/shared/ui/states'
import { ProjectChoice as Choice } from './ProjectChoice'

type InitMode = 'demo' | 'blank'

const OBJECT_TYPE_ICON = { warehouse: Warehouse, airport: Plane, hospital: HeartPulse, custom: Building2 }

export function CreateProjectDialog({
  trigger,
  initialMode = 'demo',
  open: controlledOpen,
  onOpenChange,
}: {
  trigger: ReactNode
  initialMode?: InitMode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [ownOpen, setOwnOpen] = useState(false)
  const open = controlledOpen ?? ownOpen
  const setOpen = (next: boolean) => {
    setOwnOpen(next)
    onOpenChange?.(next)
  }
  const navigate = useNavigate()
  const objectTypes = useObjectTypes()
  const create = useCreateProject()
  const workspace = useWorkspace()
  const [objectType, setObjectType] = useState<ObjectTypeKey>('warehouse')
  const [preferredMode, setMode] = useState<InitMode>(initialMode)
  const [name, setName] = useState('')
  const [demoKey, setDemoKey] = useState<string | null>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)

  const selected = objectTypes.data?.find((t) => t.key === objectType)
  const demos = selected?.demo_projects ?? []
  const demo = demos.find((d) => d.key === demoKey) ?? demos[0]

  const mode: InitMode = demo ? preferredMode : 'blank'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const project = await create.mutateAsync({
      name: name.trim() || (mode === 'demo' && demo ? demo.name : `Новый объект: ${OBJECT_TYPE_LABEL[objectType]}`),
      object_type: objectType,
      init: mode === 'demo' && demo ? { mode: 'demo', demo_key: demo.key } : { mode: 'blank' },
      organization_id: workspace.id,
    })
    setOpen(false)
    navigate(`/projects/${project.id}`)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 max-sm:top-auto max-sm:bottom-0 max-sm:max-h-[calc(100dvh-0.5rem)] max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-xl"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          titleRef.current?.focus()
        }}
      >
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <DialogHeader className="shrink-0 border-b px-4 py-4 pr-14 sm:px-5 sm:pr-14">
            <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">
              Новый проект оценки
            </DialogTitle>
            <DialogDescription>
              Выберите объект и начальные данные. Всё можно изменить позже.
              {workspace.organization && (
                <> Проект появится в организации {quoted(workspace.organization.name)} — его увидят все участники.</>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5">
            <fieldset className="min-w-0 space-y-2">
              <legend className="mb-2 text-sm font-medium">Тип объекта</legend>
              <div className="grid grid-cols-3 gap-2">
                {(objectTypes.data ?? []).map((t) => {
                  const Icon = OBJECT_TYPE_ICON[t.key]
                  return (
                    <Choice
                      key={t.key}
                      name="object-type"
                      value={t.key}
                      active={t.key === objectType}
                      onChange={() => setObjectType(t.key)}
                      compact
                    >
                      <Icon className="size-5 shrink-0" aria-hidden="true" />
                      <span className="font-medium leading-snug sm:hidden">
                        {t.key === 'hospital' ? 'Медицина' : t.name}
                      </span>
                      <span className="hidden font-medium leading-snug sm:block">{t.name}</span>
                    </Choice>
                  )
                })}
              </div>
              {selected && (
                <p className="text-xs leading-relaxed text-muted-foreground">Расчёт, планировка и имитация</p>
              )}
            </fieldset>

            <fieldset className="min-w-0 space-y-2">
              <legend className="mb-2 text-sm font-medium">Начальные данные</legend>
              <div className="grid grid-cols-1 gap-2">
                {demos.map((d) => (
                  <Choice
                    key={d.key}
                    name="initial-data"
                    value={d.key}
                    active={mode === 'demo' && d.key === demo?.key}
                    onChange={() => {
                      setDemoKey(d.key)
                      setMode('demo')
                    }}
                  >
                    <span className="font-medium">{d.name}</span>
                  </Choice>
                ))}
                {demos.length === 0 && (
                  <Choice name="initial-data" value="demo" active={false} disabled onChange={() => setMode('demo')}>
                    <span className="font-medium">Демо-объект</span>
                    <span className="text-xs text-muted-foreground">Для этого типа нет демо-набора</span>
                  </Choice>
                )}
                <Choice name="initial-data" value="blank" active={mode === 'blank'} onChange={() => setMode('blank')}>
                  <span className="font-medium">Пустой проект</span>
                </Choice>
              </div>
              {mode === 'demo' && demo ? (
                <details key={demo.key} className="group rounded-md bg-muted/40 px-3">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium [&::-webkit-details-marker]:hidden">
                    Описание набора
                    <ChevronDown
                      className="size-4 shrink-0 transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <p className="pb-3 text-xs leading-relaxed text-muted-foreground">{demo.description}</p>
                </details>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Начните со значений по умолчанию, заполните параметры вручную или импортируйте Excel, CSV или JSON.
                </p>
              )}
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="project-name">Название</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: РЦ Подмосковье"
                maxLength={200}
                className="h-11"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Можно оставить пустым — подставим{' '}
                {mode === 'demo' ? 'название демо-объекта' : 'название по типу объекта'}.
              </p>
            </div>
          </div>

          <DialogFooter className="m-0 shrink-0 flex-row rounded-none bg-popover px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
            <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            {/* Пока типы объектов не загрузились, демо-набор неизвестен — не даём создать пустой проект вместо демо. */}
            <Button type="submit" className="h-11 px-5 max-sm:flex-1" disabled={create.isPending || !objectTypes.data}>
              {create.isPending && <Spinner />} Создать проект
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

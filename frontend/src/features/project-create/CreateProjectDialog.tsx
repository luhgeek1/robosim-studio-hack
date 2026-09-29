import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { OBJECT_TYPE_LABEL, useCreateProject } from '@/entities/project'
import { useObjectTypes } from '@/entities/reference'
import type { ObjectTypeKey } from '@/shared/api/types'
import { cn } from '@/shared/lib/utils'
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

type InitMode = 'demo' | 'blank'

export function CreateProjectDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger: ReactNode
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
  const [objectType, setObjectType] = useState<ObjectTypeKey>('warehouse')
  const [preferredMode, setMode] = useState<InitMode>('demo')
  const [name, setName] = useState('')

  const selected = objectTypes.data?.find((t) => t.key === objectType)
  const demo = selected?.demo_projects?.[0]

  const mode: InitMode = demo ? preferredMode : 'blank'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const project = await create.mutateAsync({
      name: name.trim() || (mode === 'demo' && demo ? demo.name : `Новый объект: ${OBJECT_TYPE_LABEL[objectType]}`),
      object_type: objectType,
      init: mode === 'demo' && demo ? { mode: 'demo', demo_key: demo.key } : { mode: 'blank' },
    })
    setOpen(false)
    navigate(`/projects/${project.id}`)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Новый проект оценки</DialogTitle>
            <DialogDescription>
              Выберите тип объекта и чем заполнить параметры. Всё можно поменять позже.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>Тип объекта</Label>
            <div className="grid grid-cols-3 gap-2">
              {(objectTypes.data ?? []).map((t) => (
                <Choice key={t.key} active={t.key === objectType} onClick={() => setObjectType(t.key)}>
                  <span className="font-medium">{t.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {t.depth === 'full' ? 'расчёт, планировка, имитация' : 'параметры, подбор, экономика'}
                  </span>
                </Choice>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Начальные данные</Label>
            <div className="grid grid-cols-2 gap-2">
              <Choice active={mode === 'demo'} disabled={!demo} onClick={() => setMode('demo')}>
                <span className="font-medium">Демо-объект организатора</span>
                <span className="text-xs text-muted-foreground">
                  {demo?.description ?? 'Для этого типа нет демо-набора'}
                </span>
              </Choice>
              <Choice active={mode === 'blank'} onClick={() => setMode('blank')}>
                <span className="font-medium">Пустой проект</span>
                <span className="text-xs text-muted-foreground">
                  Значения по умолчанию из справочника с источниками; дальше — ввод или импорт Excel
                </span>
              </Choice>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-name">Название</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={mode === 'demo' && demo ? demo.name : 'Например: РЦ Подмосковье, 20 000 м²'}
              maxLength={200}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            {/* Пока типы объектов не загрузились, демо-набор неизвестен — не даём создать пустой проект вместо демо. */}
            <Button type="submit" disabled={create.isPending || !objectTypes.data}>
              {create.isPending && <Spinner />} Создать
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Choice({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-1 rounded-md border bg-raised/40 p-3 text-left transition-colors hover:border-primary/50 disabled:opacity-50',
        active && 'border-primary bg-accent/60',
      )}
    >
      {children}
    </button>
  )
}

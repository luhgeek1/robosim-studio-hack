import { ArrowRight, Building2, Check, HeartPulse, Plane, Warehouse } from 'lucide-react'
import { useId, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { quoted } from '@/entities/organization'
import { problemText } from '@/shared/api/problem'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { useProjectDraft } from './useProjectDraft'

const OBJECT_DETAILS = {
  warehouse: { icon: Warehouse, hint: 'Паллеты, отбор заказов, уборка', placeholder: 'Например: РЦ Подмосковье' },
  hospital: { icon: HeartPulse, hint: 'Питание, бельё, медикаменты', placeholder: 'Например: Городская больница' },
  airport: { icon: Plane, hint: 'Багаж, тележки, уборка', placeholder: 'Например: Терминал аэропорта' },
  custom: { icon: Building2, hint: 'Параметры вашего объекта', placeholder: 'Например: Новый объект' },
}

export function ProjectStarter() {
  const draft = useProjectDraft('blank')
  const { objectTypes, create, workspace, objectType, setObjectType, mode, setMode, demos, demo } = draft
  const navigate = useNavigate()
  const id = useId()
  const nameId = `${id}-name`

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const project = await draft.submit()?.catch(() => undefined)
    if (project) navigate(`/projects/${project.id}/object`)
  }

  return (
    <section aria-labelledby={`${id}-title`}>
      <div className="mb-7 max-w-180">
        <h2 id={`${id}-title`} className="display text-[28px] leading-[1.15] tracking-[-0.03em] sm:text-[38px]">
          Начните с вашего объекта.
        </h2>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-3 sm:text-[15px]">
          Оцените, какие процессы стоит роботизировать и когда окупятся вложения.
          <br className="hidden sm:block" /> Выберите объект, затем добавьте свои данные или возьмите готовый пример.
        </p>
      </div>

      {objectTypes.isPending ? (
        <LoadingBlock label="Загружаем типы объектов…" />
      ) : objectTypes.isError ? (
        <ErrorBlock error={objectTypes.error} onRetry={() => void objectTypes.refetch()} />
      ) : (
        <form onSubmit={submit}>
          <fieldset disabled={create.isPending} className="min-w-0 disabled:opacity-70">
            <legend className="sr-only">Создание первого проекта</legend>
            <fieldset className="min-w-0">
              <legend className="mb-3 text-[14px] font-semibold">Тип объекта</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {objectTypes.data.map((type) => {
                  const { icon: Icon, hint } = OBJECT_DETAILS[type.key]
                  const active = objectType === type.key
                  return (
                    <label key={type.key} className="relative flex min-w-0 cursor-pointer">
                      <input
                        type="radio"
                        name={`${id}-object`}
                        value={type.key}
                        checked={active}
                        onChange={() => setObjectType(type.key)}
                        className="peer sr-only"
                      />
                      <span
                        className={cn(
                          'flex w-full items-center gap-4 rounded-xl border bg-popover p-4 transition-colors hover:border-ink-3 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-ring sm:items-start sm:p-5',
                          active ? 'border-ink bg-surface-2' : 'border-line',
                        )}
                      >
                        <Icon className="mt-0.5 size-6 shrink-0 text-ink-2" strokeWidth={1.5} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[16px] font-semibold">{type.name}</span>
                          <span className="mt-1 block text-[12px] leading-relaxed text-ink-3">{hint}</span>
                        </span>
                        <span
                          aria-hidden
                          className={cn(
                            'mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border',
                            active ? 'border-ink bg-ink text-canvas' : 'border-line-2',
                          )}
                        >
                          {active && <Check size={11} strokeWidth={3} />}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>

            <div className="mt-5 grid overflow-hidden rounded-xl border border-line bg-popover md:grid-cols-[1.2fr_1fr]">
              <fieldset className="min-w-0 p-5 sm:p-6">
                <legend className="sr-only">Исходные данные</legend>
                <h3 className="mb-2 text-[16px] font-semibold">Исходные данные</h3>
                <div className="space-y-1">
                  <DataOption
                    id={`${id}-blank`}
                    group={`${id}-init`}
                    value="blank"
                    title="Свои данные"
                    description="Вручную или из Excel, CSV, JSON на следующем шаге."
                    checked={mode === 'blank'}
                    onChange={() => setMode('blank')}
                  />
                  {demos.map((item) => (
                    <DataOption
                      key={item.key}
                      id={`${id}-${item.key}`}
                      group={`${id}-init`}
                      value={item.key}
                      title={item.name}
                      checked={mode === 'demo' && item.key === demo?.key}
                      onChange={() => {
                        draft.setDemoKey(item.key)
                        setMode('demo')
                      }}
                    />
                  ))}
                </div>
                {mode === 'demo' && demo?.description && (
                  <details key={demo.key} className="mt-3 pl-8 text-[12px] leading-relaxed text-ink-3">
                    <summary className="cursor-pointer font-medium text-ink-2">Описание примера</summary>
                    <p className="mt-2">{demo.description}</p>
                  </details>
                )}
              </fieldset>

              <div className="flex min-w-0 flex-col border-t border-line bg-surface-2/60 p-5 sm:p-6 md:border-t-0 md:border-l">
                <Label htmlFor={nameId} className="text-[14px] font-semibold">
                  Название проекта
                </Label>
                <Input
                  id={nameId}
                  value={draft.name}
                  onChange={(event) => draft.setName(event.target.value)}
                  placeholder={OBJECT_DETAILS[objectType].placeholder}
                  maxLength={200}
                  aria-describedby={`${id}-name-hint`}
                  className="mt-3 h-11 bg-popover"
                />
                <p id={`${id}-name-hint`} className="mt-2 text-[12px] leading-relaxed text-ink-3">
                  Необязательно. Название можно изменить позже.
                </p>
                <Button type="submit" disabled={create.isPending || !draft.selected} className="mt-5 h-11 w-full">
                  {create.isPending ? (
                    <>
                      <Spinner /> Создаём проект…
                    </>
                  ) : (
                    <>
                      Создать проект <ArrowRight />
                    </>
                  )}
                </Button>
                <p className="mt-2 text-center text-[12px] leading-relaxed text-ink-3">
                  {mode === 'demo' ? 'Далее: проверьте параметры примера' : 'Далее: заполните параметры объекта'}
                </p>
                {create.isError && (
                  <p role="alert" className="mt-3 text-[13px] text-crit">
                    {problemText(create.error)}
                  </p>
                )}
              </div>
            </div>
          </fieldset>
        </form>
      )}

      <div
        className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-ink-3 sm:text-[13px]"
        aria-label="Путь проекта"
      >
        {['Параметры объекта', 'Подбор роботов', 'Экономика и имитация', 'Отчёт PDF и Excel'].map((step, index) => (
          <span key={step} className="inline-flex items-center gap-3">
            {index > 0 && <ArrowRight size={13} className="text-ink-3" aria-hidden />}
            {step}
          </span>
        ))}
      </div>
      {workspace.organization && (
        <p className="mt-5 border-t border-line pt-4 text-[12px] leading-relaxed text-ink-3">
          Проект появится в организации {quoted(workspace.organization.name)} и будет доступен всем участникам. Уже есть
          личный проект? Перенесите его сюда через меню «…» в личном пространстве.
        </p>
      )}
    </section>
  )
}

function DataOption({
  id,
  group,
  value,
  title,
  description,
  checked,
  onChange,
}: {
  id: string
  group: string
  value: string
  title: string
  description?: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-surface-2',
        checked && 'bg-surface-2',
      )}
    >
      <input
        type="radio"
        name={group}
        value={value}
        checked={checked}
        onChange={onChange}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-description` : undefined}
        className="mt-0.5 size-4 shrink-0 accent-ink focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring"
      />
      <span className="min-w-0">
        <span id={`${id}-label`} className="block text-[13px] leading-relaxed font-medium text-ink-2">
          {title}
        </span>
        {description && (
          <span id={`${id}-description`} className="mt-1 block text-[12px] leading-relaxed text-ink-3">
            {description}
          </span>
        )}
      </span>
    </label>
  )
}

import { useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Copy, HeartPulse, Plane, Plus, Trash2, Warehouse } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useCopyProject, useCreateProject, useDeleteProject, useProjects } from '@/api/projects'
import { useObjectTypes } from '@/api/reference'
import type { ObjectTypeKey, Project } from '@/api/types'
import { ConfidenceRing } from '@/components/TopBar'
import { ErrorState, Loading } from '@/components/States'
import { Button, Pill, inputCls } from '@/components/ui'
import { formatRub, formatYears } from '@/lib/format'
import { OBJECT_TYPE_LABEL, VERDICT_LABEL, VERDICT_TONE, type Verdict } from '@/lib/labels'

const ICONS: Partial<Record<ObjectTypeKey, ReactNode>> = {
  warehouse: <Warehouse size={18} />,
  airport: <Plane size={18} />,
  hospital: <HeartPulse size={18} />,
}

const isVerdict = (v: string | null | undefined): v is Verdict => Boolean(v && v in VERDICT_LABEL)

export function ProjectsScreen() {
  const navigate = useNavigate()
  const projects = useProjects()
  const types = useObjectTypes()
  const create = useCreateProject()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<ObjectTypeKey>('warehouse')
  const [withDemo, setWithDemo] = useState(true)
  const selected = types.data?.find((t) => t.key === type)
  const demo = selected?.demo_projects?.[0]

  const submit = async () => {
    const useDemo = withDemo && Boolean(demo)
    const project = await create.mutateAsync({
      name: name.trim() || (useDemo && demo ? demo.name : `Новый объект: ${OBJECT_TYPE_LABEL[type]}`),
      object_type: type,
      init: useDemo && demo ? { mode: 'demo', demo_key: demo.key } : { mode: 'blank' },
    })
    navigate(`/projects/${project.id}/object`)
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-6 pt-12 pb-16">
      <div className="mb-8 max-w-[720px]">
        <h1 className="display text-[44px] leading-[1.05] tracking-[-0.035em]">Стоит ли роботизировать ваш объект?</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-2">
          Загрузите параметры склада, аэропорта или больницы — RoboScope подберёт роботов из каталога, проверит
          количество имитацией на планировке объекта и посчитает экономику: как сейчас, покупка, аренда или лизинг.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="h3">Проекты</div>
            {!creating && (
              <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
                Новый проект
              </Button>
            )}
          </div>
          {projects.isPending && <Loading label="Загружаем проекты…" />}
          {projects.error && <ErrorState error={projects.error} onRetry={() => projects.refetch()} />}
          {projects.data && projects.data.items.length === 0 && !creating && (
            <div className="rounded-[12px] border border-dashed border-line px-5 py-10 text-center text-[14px] text-ink-3">
              Проектов пока нет. Создайте первый на демо-данных организатора — это меньше минуты.
            </div>
          )}
          {projects.data && projects.data.items.length > 0 && (
            <ul className="card divide-y divide-line overflow-hidden">
              {projects.data.items.map((p) => (
                <ProjectRow key={p.id} project={p} />
              ))}
            </ul>
          )}
        </section>

        <aside>
          {creating ? (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
              <div className="h3 mb-4">Новый проект</div>
              <div>
                <span className="meta">Тип объекта</span>
                <div className="mt-1.5 space-y-1.5">
                  {(types.data ?? []).map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setType(t.key)}
                      className={`flex w-full items-start gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors ${type === t.key ? 'border-ink bg-surface-2' : 'border-line hover:border-line-2'}`}
                    >
                      <span className="mt-0.5 text-ink-2">{ICONS[t.key]}</span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-[14px] font-medium">
                          {t.name}
                          {t.depth === 'basic' && (
                            <span className="text-[11px] font-normal text-ink-3">без имитации</span>
                          )}
                        </span>
                        {t.description && (
                          <span className="block text-[12.5px] leading-snug text-ink-3">{t.description}</span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <label className="mt-4 flex items-start gap-2.5 text-[13.5px]">
                <input
                  type="checkbox"
                  checked={withDemo && Boolean(demo)}
                  disabled={!demo}
                  onChange={(e) => setWithDemo(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-ink"
                />
                <span>
                  <span className="font-medium">Заполнить демо-данными организатора</span>
                  <span className="block text-[12.5px] text-ink-3">
                    {demo?.description ?? 'Для этого типа нет демо-набора'}
                  </span>
                </span>
              </label>
              <label className="mt-4 block">
                <span className="meta">Название</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void submit()}
                  placeholder={withDemo && demo ? demo.name : 'Например: РЦ Подмосковье'}
                  className={`${inputCls} mt-1`}
                />
              </label>
              <div className="mt-5 flex gap-2">
                <Button variant="primary" onClick={() => void submit()} disabled={create.isPending}>
                  {create.isPending ? 'Создаём…' : 'Создать проект'}
                </Button>
                <Button variant="ghost" onClick={() => setCreating(false)}>
                  Отмена
                </Button>
              </div>
            </motion.div>
          ) : (
            <div className="rounded-[12px] bg-surface-2 p-5 text-[13.5px] leading-relaxed text-ink-2">
              <div className="h3 mb-2 text-ink">Как это работает</div>
              <ol className="list-decimal space-y-1.5 pl-4">
                <li>Создайте проект и выберите тип объекта — или возьмите демо-данные.</li>
                <li>Проверьте параметры: откуда каждое значение и что стоит уточнить.</li>
                <li>Посмотрите, где уходят деньги и какие роботы подходят.</li>
                <li>Имитация на планировке проверит, сколько роботов на самом деле нужно.</li>
                <li>Сравните покупку, аренду и лизинг — и получите заключение.</li>
              </ol>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function ProjectRow({ project: p }: { project: Project }) {
  const navigate = useNavigate()
  const remove = useDeleteProject()
  const copy = useCopyProject()
  const quality = Math.round(p.data_quality.score * 100)
  const verdict = p.headline_metrics?.verdict
  return (
    <li className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2">
      <button
        type="button"
        onClick={() => navigate(`/projects/${p.id}/object`)}
        className="flex min-w-0 flex-1 items-center gap-4 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-black/[0.05] text-ink-2">
          {ICONS[p.object_type]}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{p.name}</span>
          <span className="block truncate text-[13px] text-ink-3">
            {OBJECT_TYPE_LABEL[p.object_type]}
            {p.headline_metrics?.payback_years != null
              ? ` · окупаемость ${formatYears(p.headline_metrics.payback_years)} · CAPEX ${formatRub(p.headline_metrics.capex_rub)}`
              : ' · ещё не рассчитан'}
          </span>
        </span>
        {isVerdict(verdict) && <Pill tone={VERDICT_TONE[verdict]}>{VERDICT_LABEL[verdict]}</Pill>}
        <span className="flex items-center gap-2 text-[13px] text-ink-2" title="Доля подтверждённых данных">
          <ConfidenceRing value={quality} size={20} />
          <span className="num">{quality} %</span>
        </span>
      </button>
      <span className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={async () => {
            const created = await copy.mutateAsync({ id: p.id, name: `${p.name} (копия)` })
            navigate(`/projects/${created.id}/object`)
          }}
          className="rounded-md p-1.5 text-ink-4 hover:bg-black/[0.05] hover:text-ink"
          title="Копировать проект со сценариями"
        >
          <Copy size={14} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm(`Удалить проект «${p.name}» со всеми сценариями и расчётами?`)) remove.mutate(p.id)
          }}
          className="rounded-md p-1.5 text-ink-4 hover:bg-black/[0.05] hover:text-crit"
          title="Удалить проект"
        >
          <Trash2 size={14} />
        </button>
      </span>
    </li>
  )
}

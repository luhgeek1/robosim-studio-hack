import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Trash2, Warehouse, Plane, HeartPulse } from 'lucide-react'
import { api, type Project } from '../api'
import { invalidate, useQuery } from '../query'
import { useStore } from '../store'
import { Button, Pill } from '../components/ui'
import { ErrorState, Loading } from '../components/States'
import { ConfidenceRing } from '../components/TopBar'

const ICONS: Record<string, React.ReactNode> = { warehouse: <Warehouse size={18} />, airport: <Plane size={18} />, medical: <HeartPulse size={18} /> }

export function ProjectsScreen() {
  const openProject = useStore((s) => s.openProject)
  const toast = useStore((s) => s.toast)
  const { data: projects, error, loading, reload } = useQuery('projects', api.projects)
  const { data: types } = useQuery('object-types', api.objectTypes)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('warehouse')
  const [busy, setBusy] = useState(false)

  const create = async () => {
    setBusy(true)
    try {
      const p = await api.createProject({ name: name.trim() || 'Новый проект', object_type: type })
      invalidate('projects')
      openProject(p)
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const remove = async (p: Project) => {
    if (!confirm(`Удалить проект «${p.name}»?`)) return
    await api.deleteProject(p.id)
    invalidate('projects')
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-6 pb-16 pt-12">
      <div className="mb-8 max-w-[720px]">
        <h1 className="display text-[44px] leading-[1.05] tracking-[-0.035em]">Стоит ли роботизировать ваш объект?</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-2">
          Загрузите данные склада в любом формате — RoboScope приведёт их к единой модели, подберёт роботов, посчитает количество и экономику и проверит конфигурацию симуляцией.
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
          {loading && <Loading label="Загружаем проекты…" />}
          {error && <ErrorState error={error} onRetry={reload} />}
          {projects && projects.length === 0 && !creating && (
            <div className="rounded-[12px] border border-dashed border-line px-5 py-10 text-center text-[14px] text-ink-3">
              Проектов пока нет. Создайте первый — на это уйдёт меньше минуты.
            </div>
          )}
          {projects && projects.length > 0 && (
            <ul className="card divide-y divide-line overflow-hidden">
              {projects.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => openProject(p)} className="group flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-black/[0.05] text-ink-2">{ICONS[p.object_type]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-semibold">{p.name}</span>
                        {!p.supported && <Pill>параметры и данные</Pill>}
                      </span>
                      <span className="block truncate text-[13px] text-ink-3">
                        {p.object_type_label}
                        {p.source_file ? ` · ${p.source_file}` : ' · данные не загружены'}
                      </span>
                    </span>
                    {p.confidence !== null && (
                      <span className="flex items-center gap-2 text-[13px] text-ink-2">
                        <ConfidenceRing value={p.confidence} size={20} />
                        <span className="num">{p.confidence} %</span>
                      </span>
                    )}
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation()
                        void remove(p)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.stopPropagation()
                          void remove(p)
                        }
                      }}
                      className="rounded-md p-1.5 text-ink-4 opacity-0 transition-opacity hover:bg-black/[0.05] hover:text-crit group-hover:opacity-100"
                      title="Удалить проект"
                    >
                      <Trash2 size={14} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside>
          {creating ? (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
              <div className="h3 mb-4">Новый проект</div>
              <label className="block">
                <span className="meta">Название</span>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void create()}
                  placeholder="Warehouse Moscow #01"
                  className="mt-1 h-10 w-full rounded-[9px] border border-line bg-surface px-3 text-[14px] outline-none transition-colors focus:border-ink"
                />
              </label>
              <div className="mt-4">
                <span className="meta">Тип объекта</span>
                <div className="mt-1.5 space-y-1.5">
                  {(types ?? []).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setType(t.id)}
                      className={`flex w-full items-start gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors ${type === t.id ? 'border-ink bg-surface-2' : 'border-line hover:border-line-2'}`}
                    >
                      <span className="mt-0.5 text-ink-2">{ICONS[t.id]}</span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-[14px] font-medium">
                          {t.label}
                          {!t.supported && <span className="text-[11px] font-normal text-ink-3">только параметры</span>}
                        </span>
                        <span className="block text-[12.5px] leading-snug text-ink-3">{t.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-5 flex gap-2">
                <Button variant="primary" onClick={() => void create()} disabled={busy}>
                  Создать проект
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
                <li>Создайте проект и выберите тип объекта.</li>
                <li>Загрузите файл с параметрами: xlsx, csv, json или текст. Или возьмите демо-данные.</li>
                <li>Проверьте, что система поняла, а где использовала предположения.</li>
                <li>Получите подбор роботов, количество, экономику и симуляцию.</li>
              </ol>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

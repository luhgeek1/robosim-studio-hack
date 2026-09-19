import { useRef, useState } from 'react'
import { FileSpreadsheet, Upload, Sparkles, AlertTriangle } from 'lucide-react'
import { Screen } from '../components/Screen'
import { Twin } from '../twin/Twin'
import { api, type ParameterValue } from '../api'
import { invalidate, useQuery } from '../query'
import { useStore } from '../store'
import { Button, Pill } from '../components/ui'
import { ConfidenceRing } from '../components/TopBar'
import { ErrorState, Loading } from '../components/States'

function fmtValue(p: ParameterValue) {
  if (p.value === null || p.value === undefined) return '—'
  if (p.kind === 'bool') return p.value ? 'есть' : 'нет'
  if (typeof p.value === 'number') return `${p.value.toLocaleString('ru-RU')}${p.unit ? ' ' + p.unit : ''}`
  return String(p.value)
}

function ParamRow({ p, onSave }: { p: ParameterValue; onSave: (key: string, value: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(p.value ?? ''))
  const editable = p.kind === 'number'
  const commit = async () => {
    setEditing(false)
    const n = Number(val.replace(',', '.').replace(/\s/g, ''))
    if (!Number.isFinite(n) || n === p.value) return
    await onSave(p.key, n)
  }
  return (
    <div className="flex items-baseline justify-between gap-3 py-[7px]">
      <dt className="text-[13px] text-ink-3" title={p.source_value || p.note}>
        {p.label}
      </dt>
      <dd className="flex items-center gap-1.5 text-right text-[13.5px] font-medium text-ink">
        {p.source === 'assumption' && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" title={`Предположение: ${p.note}`} />}
        {p.out_of_range && <AlertTriangle size={12} className="text-warn" />}
        {editing ? (
          <input
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commit()
              if (e.key === 'Escape') setEditing(false)
            }}
            className="num h-7 w-28 rounded-[6px] border border-ink bg-surface px-2 text-right text-[13px] outline-none"
          />
        ) : (
          <button
            type="button"
            disabled={!editable}
            onClick={() => {
              setVal(String(p.value ?? ''))
              setEditing(true)
            }}
            className={`rounded-[6px] px-1 -mx-1 ${editable ? 'hover:bg-black/[0.05]' : ''} ${p.source === 'missing' ? 'text-ink-4' : ''}`}
            title={editable ? 'Нажмите, чтобы изменить' : undefined}
          >
            {fmtValue(p)}
          </button>
        )}
      </dd>
    </div>
  )
}

export function ObjectScreen() {
  const project = useStore((s) => s.project)!
  const setProject = useStore((s) => s.setProject)
  const toast = useStore((s) => s.toast)
  const openConfidence = () => useStore.getState().setConfidenceOpen(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const hasData = !!project.imported_at
  const key = hasData ? `parameters:${project.id}:${project.version}` : null
  const { data, error, loading, reload } = useQuery(key, () => api.parameters(project.id))

  const afterImport = (r: Awaited<ReturnType<typeof api.importDemo>>) => {
    setProject(r.project)
    invalidate(`parameters:${project.id}`)
    invalidate(`confidence:${project.id}`)
    invalidate('projects')
    const un = r.unmapped.length
    toast(`Распознано ${r.recognized} из ${r.total} параметров${un ? `, не сопоставлено полей: ${un}` : ''}`)
  }
  const importDemo = async () => {
    setImporting(true)
    try {
      afterImport(await api.importDemo(project.id))
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setImporting(false)
    }
  }
  const importFile = async (f: File) => {
    setImporting(true)
    try {
      afterImport(await api.importFile(project.id, f))
    } catch (e) {
      toast((e as Error).message)
    } finally {
      setImporting(false)
    }
  }
  const save = async (k: string, value: number) => {
    try {
      await api.patchParameters(project.id, { [k]: value })
      const fresh = await api.project(project.id)
      setProject(fresh)
      invalidate(`parameters:${project.id}`)
      invalidate(`confidence:${project.id}`)
      invalidate(`analysis:${project.id}`)
      invalidate(`matching:${project.id}`)
      invalidate(`configurations:${project.id}`)
      invalidate(`scenarios:${project.id}`)
      invalidate(`recommendation:${project.id}`)
      useStore.getState().setConfigurations(null)
      toast('Параметр обновлён, расчёты пересчитаны')
    } catch (e) {
      toast((e as Error).message)
    }
  }

  const errors = data?.validation.filter((v) => v.level === 'error') ?? []
  const nextDisabled = !hasData || !project.supported || errors.length > 0

  return (
    <Screen
      wide
      title={project.name}
      lead={
        hasData
          ? 'Данные объекта приведены к единой модели. Проверьте параметры: подтверждённые значения взяты из файла, оценочные помечены точкой. Любое число можно исправить — расчёты пересчитаются.'
          : 'Загрузите файл с параметрами объекта в любом формате: xlsx, csv, json или текст. Система сама определит, какие показатели чему соответствуют.'
      }
      nextLabel={project.supported ? 'Начать анализ' : 'Расчёт для этого типа объекта скоро'}
      nextDisabled={nextDisabled}
    >
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[5fr_7fr]">
        <div>
          <div className="card flex items-center gap-3 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-black/[0.05] text-ink-2">
              <FileSpreadsheet size={17} />
            </span>
            <button type="button" onClick={hasData ? openConfidence : undefined} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[13.5px] font-medium">{hasData ? project.source_file : 'Данные не загружены'}</span>
              <span className="block text-[12.5px] text-ink-3">
                {hasData
                  ? `${project.recognized} из ${project.total} параметров распознаны · ${new Date(project.imported_at!).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`
                  : 'xlsx, csv, json или текстовый файл до 20 МБ'}
              </span>
            </button>
            {hasData && project.confidence !== null && (
              <button type="button" onClick={openConfidence} className="flex items-center gap-2 text-[13px]">
                <ConfidenceRing value={project.confidence} size={22} />
                <span className="num font-medium">{project.confidence} %</span>
              </button>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.csv,.json,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
            <Button size="sm" variant={hasData ? 'secondary' : 'primary'} icon={<Upload size={14} />} onClick={() => fileRef.current?.click()} disabled={importing}>
              {hasData ? 'Загрузить другой файл' : 'Загрузить файл'}
            </Button>
            <Button size="sm" variant="ghost" icon={<Sparkles size={14} />} onClick={() => void importDemo()} disabled={importing}>
              {importing ? 'Распознаём…' : 'Демо-данные'}
            </Button>
            {project.address && <span className="ml-auto text-[12.5px] text-ink-3">{project.address}</span>}
          </div>

          {loading && <div className="mt-6"><Loading label="Загружаем параметры…" /></div>}
          {error && <div className="mt-6"><ErrorState error={error} onRetry={reload} /></div>}
          {data && data.validation.length > 0 && (
            <ul className="mt-5 space-y-1.5">
              {data.validation.map((v) => (
                <li key={v.key + v.message} className={`rounded-[9px] px-3 py-2 text-[13px] ${v.level === 'error' ? 'bg-crit-soft text-crit' : 'bg-warn-soft text-warn'}`}>
                  {v.message}
                </li>
              ))}
            </ul>
          )}
          {data && (
            <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-7 sm:grid-cols-2">
              {data.groups.map((g) => (
                <section key={g.title}>
                  <div className="h3 mb-2.5">{g.title}</div>
                  <dl className="divide-y divide-line">
                    {g.items.map((it) => (
                      <ParamRow key={it.key} p={it} onSave={save} />
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          )}
          {data && (
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Pill tone="ok">{data.parameters.filter((p) => p.source === 'confirmed').length} подтверждено</Pill>
              <Pill tone="warn">{data.parameters.filter((p) => p.source === 'assumption' || p.source === 'default').length} предположений</Pill>
              <Pill>{data.parameters.filter((p) => p.source === 'missing').length} не указано</Pill>
              <button type="button" onClick={openConfidence} className="ml-1 text-[13px] font-medium text-accent hover:underline">
                Посмотреть все
              </button>
            </div>
          )}
        </div>

        <div className="card relative h-[640px] overflow-hidden lg:sticky lg:top-20">
          {project.object_type === 'warehouse' ? (
            <>
              <Twin mode="overview" />
              <div className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-2">
                <span className="rounded-full border border-line bg-white/90 px-2.5 py-1 text-[12.5px] font-medium">Цифровой двойник</span>
                <span className="rounded-full bg-white/90 px-2.5 py-1 text-[12px] text-ink-3">типовая планировка по параметрам</span>
              </div>
              {data && (
                <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-10 flex flex-wrap items-end justify-between gap-3">
                  <div className="grid grid-cols-3 gap-6 rounded-[12px] border border-line bg-white/90 px-4 py-3 backdrop-blur">
                    {[
                      [fmtValue(data.parameters.find((p) => p.key === 'robotized_area_m2')!), 'зона роботизации'],
                      [fmtValue(data.parameters.find((p) => p.key === 'pallet_positions')!).replace(' мест', ''), 'паллето-мест'],
                      [((Number(data.parameters.find((p) => p.key === 'daily_pallets_in')?.value) || 0) + (Number(data.parameters.find((p) => p.key === 'daily_pallets_out')?.value) || 0)).toLocaleString('ru-RU'), 'перемещений в сутки'],
                    ].map(([v, l]) => (
                      <div key={l}>
                        <div className="display num text-[18px]">{v}</div>
                        <div className="meta">{l}</div>
                      </div>
                    ))}
                  </div>
                  <span className="text-[12px] text-ink-4">Вращайте сцену мышью</span>
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full min-h-[560px] flex-col items-center justify-center px-8 text-center">
              <div className="h2">{project.object_type_label}</div>
              <p className="mt-2 max-w-[420px] text-[14px] leading-relaxed text-ink-3">
                Для этого типа объекта уже работают импорт и оценка достоверности данных. Подбор роботов, экономика и симуляция подключаются следующим этапом.
              </p>
            </div>
          )}
        </div>
      </div>
    </Screen>
  )
}

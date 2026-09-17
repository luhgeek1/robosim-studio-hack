import { FileSpreadsheet } from 'lucide-react'
import { Screen } from '../components/Screen'
import { Twin } from '../twin/Twin'
import { paramGroups, project } from '../data/project'
import { useStore } from '../store'
import { Pill } from '../components/ui'
import { ConfidenceRing } from '../components/TopBar'

export function ObjectScreen() {
  const openConfidence = () => useStore.getState().setConfidenceOpen(true)
  return (
    <Screen
      wide
      title={project.name}
      lead="Данные объекта импортированы из корпоративного файла и приведены к единой модели. Проверьте параметры и запустите анализ."
      nextLabel="Начать анализ"
    >
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[5fr_7fr]">
        <div>
          <button
            type="button"
            onClick={openConfidence}
            className="group flex w-full items-center gap-3 rounded-[12px] border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-line-2 hover:bg-surface-2"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-black/[0.05] text-ink-2">
              <FileSpreadsheet size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium">{project.source}</span>
              <span className="block text-[12.5px] text-ink-3">
                {project.recognized} из {project.total} параметров распознаны · {project.importedAt}
              </span>
            </span>
            <span className="flex items-center gap-2 text-[13px]">
              <ConfidenceRing value={project.confidence} size={22} />
              <span className="num font-medium">{project.confidence} %</span>
            </span>
          </button>
          <p className="mt-2 px-1 text-[12.5px] text-ink-3">{project.address}</p>

          <div className="mt-7 grid grid-cols-1 gap-x-8 gap-y-7 sm:grid-cols-2">
            {paramGroups.map((g) => (
              <section key={g.title}>
                <div className="h3 mb-2.5">{g.title}</div>
                <dl className="divide-y divide-line">
                  {g.items.map((it) => (
                    <div key={it.label} className="flex items-baseline justify-between gap-3 py-[7px]">
                      <dt className="text-[13px] text-ink-3">{it.label}</dt>
                      <dd className="flex items-center gap-1.5 text-right text-[13.5px] font-medium text-ink">
                        {it.status === 'assumed' && <span className="h-1.5 w-1.5 rounded-full bg-warn" title="Предположение" />}
                        <span className={it.status === 'missing' ? 'text-ink-4' : ''}>{it.value}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Pill tone="ok">38 подтверждено</Pill>
            <Pill tone="warn">9 предположений</Pill>
            <Pill>4 не указано</Pill>
            <button type="button" onClick={openConfidence} className="ml-1 text-[13px] font-medium text-accent hover:underline">
              Посмотреть все
            </button>
          </div>
        </div>

        <div className="card relative min-h-[560px] overflow-hidden">
          <Twin mode="overview" />
          <div className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-2">
            <span className="rounded-full border border-line bg-white/90 px-2.5 py-1 text-[12.5px] font-medium">Цифровой двойник</span>
            <span className="rounded-full bg-white/90 px-2.5 py-1 text-[12px] text-ink-3">построен по плану стеллажей</span>
          </div>
          <div className="pointer-events-none absolute bottom-4 left-4 right-4 z-10 flex flex-wrap items-end justify-between gap-3">
            <div className="grid grid-cols-3 gap-6 rounded-[12px] border border-line bg-white/90 px-4 py-3 backdrop-blur">
              {[
                ['10 000 м²', 'зона роботизации'],
                ['4 200', 'паллето-мест'],
                ['2 000', 'перемещений в сутки'],
              ].map(([v, l]) => (
                <div key={l}>
                  <div className="display num text-[18px]">{v}</div>
                  <div className="meta">{l}</div>
                </div>
              ))}
            </div>
            <span className="text-[12px] text-ink-4">Вращайте сцену мышью</span>
          </div>
        </div>
      </div>
    </Screen>
  )
}

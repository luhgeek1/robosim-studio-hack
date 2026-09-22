import { Screen } from '../components/Screen'
import { HourlyLoadChart } from '../components/HourlyLoadChart'
import { api, fmt } from '../api'
import { useQuery } from '../query'
import { useStore } from '../store'
import { Check, Pill } from '../components/ui'
import { ErrorState, Loading } from '../components/States'

export function AnalysisScreen() {
  const project = useStore((s) => s.project)!
  const { data, error, loading, reload } = useQuery(`analysis:${project.id}:${project.version}`, () => api.analysis(project.id))
  const d = data?.demand
  return (
    <Screen
      title={data ? (data.hours_over_capacity > 0 ? 'Склад справляется в среднем, но не в пиковые часы' : 'Склад справляется с текущим потоком') : 'Анализ текущего процесса'}
      lead={
        d ? (
          <>
            Средний поток {fmt.int(d.average)} паллет в час, пиковый — {fmt.int(d.peak)}. Ручная мощность зоны {fmt.int(d.manual_capacity)} паллет в час: в пиковые часы растёт очередь, а доля отгрузок в срок падает до {fmt.int(d.current_sla)} % при требовании {fmt.int(d.sla_target)} %.
          </>
        ) : undefined
      }
      nextLabel="Подобрать роботов"
      nextDisabled={!data || !data.suitable}
    >
      {loading && <Loading label="Моделируем текущий процесс…" />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && d && (
        <>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[7fr_5fr]">
            <div className="card p-5">
              <div className="mb-3 flex items-baseline justify-between">
                <div className="h3">Нагрузка по часам суток</div>
                <span className="meta">паллет в час, приёмка + отгрузка</span>
              </div>
              <HourlyLoadChart hourly={data.hourly} manualCapacity={d.manual_capacity} required={d.required} />
            </div>

            <div className="flex flex-col gap-6">
              <section>
                <div className="h3 mb-3">Что это значит</div>
                <ul className="space-y-3">
                  {data.findings.map((f) => (
                    <li key={f.text} className="flex items-start gap-2.5 text-[14px] leading-snug">
                      <Check tone={f.tone === 'ok' ? 'ok' : 'warn'} />
                      <span>{f.text}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="rounded-[12px] bg-surface-2 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="h3">Требования к решению</span>
                  <Pill tone={data.suitable ? 'ok' : 'crit'}>{data.suitable ? 'Объект пригоден' : 'Есть блокеры'}</Pill>
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                  {data.requirements.map((r) => (
                    <div key={r.label}>
                      <dt className="display num text-[20px]">{r.value}</dt>
                      <dd className="meta">{r.label}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </div>
          </div>

          <section className="mt-10">
            <div className="h3 mb-3">Как проходит поток сегодня</div>
            <div className="card grid grid-cols-1 divide-y divide-line sm:grid-cols-4 sm:divide-x sm:divide-y-0">
              {data.flow.map((f, i) => (
                <div key={f.name} className="relative p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-ink-3">{f.name}</span>
                    {i < data.flow.length - 1 && <span className="hidden text-ink-4 sm:inline">›</span>}
                  </div>
                  <div className="display num mt-2 text-[26px]">{f.value}</div>
                  <div className="meta">{f.unit}</div>
                  <div className="mt-3">
                    <Pill tone={f.tone}>{f.note}</Pill>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </Screen>
  )
}

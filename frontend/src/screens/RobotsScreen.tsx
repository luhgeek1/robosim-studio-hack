import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { Screen } from '../components/Screen'
import { api, fmt, type MatchResult } from '../api'
import { useQuery } from '../query'
import { useStore } from '../store'
import { Bar, Button, Check, Pill } from '../components/ui'
import { ErrorState, Loading } from '../components/States'

const CRITERIA = ['Тип груза', 'Грузоподъёмность', 'Ширина проходов', 'Производительность', 'Бюджет', 'Инфраструктура', 'Интеграция с WMS']

export function RobotsScreen() {
  const project = useStore((s) => s.project)!
  const robotId = useStore((s) => s.robotId)
  const selectRobot = useStore((s) => s.selectRobot)
  const openDetails = useStore((s) => s.setRobotDetails)
  const { data, error, loading, reload } = useQuery(`matching:${project.id}:${project.version}`, () => api.matching(project.id))
  const [showExcluded, setShowExcluded] = useState(false)

  const eligible = (data ?? []).filter((m) => m.eligible)
  const excluded = (data ?? []).filter((m) => !m.eligible)
  const top = eligible.slice(0, 4)
  const activeId = robotId && eligible.some((m) => m.robot.id === robotId) ? robotId : top[0]?.robot.id
  const selected = eligible.find((m) => m.robot.id === activeId)
  const choose = (m: MatchResult) => {
    selectRobot(m.robot.id, m.required_count)
    void api.setSelection(project.id, { robot_id: m.robot.id, count: m.required_count })
  }
  useEffect(() => {
    if (data && selected && robotId !== selected.robot.id) selectRobot(selected.robot.id, selected.required_count)
  }, [data, selected, robotId, selectRobot])

  return (
    <Screen
      title={data ? (top.length ? `Подходят ${eligible.length} решений из ${data.length}, лучшее — ${top[0].robot.short_name}` : 'Подходящих решений не найдено') : 'Подбор роботов'}
      lead="Каталог отфильтрован по вашему складу: тип груза, вес паллет, ширина проходов, пол и зрелость решения — это жёсткие ограничения. Оставшиеся решения ранжированы по производительности на вашем объекте, стоимости конфигурации, инфраструктуре, зрелости и качеству данных."
      nextLabel={selected ? `Рассчитать конфигурацию: ${selected.robot.short_name}` : 'Далее'}
      nextDisabled={!selected}
    >
      {loading && <Loading label="Подбираем роботов из каталога…" />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[7fr_5fr]">
          <div>
            <div className="card divide-y divide-line overflow-hidden">
              {top.map((m, i) => {
                const active = m.robot.id === activeId
                return (
                  <div key={m.robot.id} className={`transition-colors ${active ? 'bg-surface' : 'bg-surface hover:bg-surface-2'}`}>
                    <button type="button" onClick={() => choose(m)} className="flex w-full items-center gap-5 px-5 py-4 text-left" aria-expanded={active}>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${active ? 'border-ink bg-ink' : 'border-line-2'}`}>
                        {active && <span className="h-2 w-2 rounded-full bg-white" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-[15px] font-semibold">{m.robot.short_name}</span>
                          {i === 0 && <Pill tone="accent">Рекомендация</Pill>}
                          {m.fleet_capex_mln > 0 && m.risks.some((r) => r.includes('выше бюджета')) && <Pill tone="warn">выше бюджета</Pill>}
                        </span>
                        <span className="block text-[13px] text-ink-3">
                          {m.robot.subtype || m.robot.category} · {fmt.mln(m.robot.price_mln)} млн ₽ за робота · {m.required_count} робота · {fmt.mln(m.fleet_capex_mln)} млн ₽ конфигурация
                        </span>
                      </span>
                      <span className="flex w-[160px] shrink-0 items-center gap-3">
                        <span className="flex-1">
                          <Bar value={m.compatibility} tone={m.compatibility >= 85 ? 'ok' : m.compatibility >= 70 ? 'accent' : 'warn'} height={5} />
                        </span>
                        <span className="display num w-[52px] text-right text-[20px]">{m.compatibility} %</span>
                      </span>
                    </button>
                    <AnimatePresence initial={false}>
                      {active && (
                        <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
                          <div className="grid grid-cols-1 gap-6 px-5 pb-5 pl-[60px] md:grid-cols-2">
                            <div>
                              <div className="mb-2 text-[13px] font-medium text-ink-2">Подходит потому что</div>
                              <ul className="space-y-1.5">
                                {m.fits.map((f) => (
                                  <li key={f} className="flex items-start gap-2 text-[13.5px] leading-snug"><Check /> <span>{f}</span></li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <div className="mb-2 text-[13px] font-medium text-ink-2">{m.risks.length > 1 ? 'Ограничения' : m.risks.length ? 'Риск' : 'Рисков не найдено'}</div>
                              <ul className="space-y-1.5">
                                {m.risks.map((f) => (
                                  <li key={f} className="flex items-start gap-2 text-[13.5px] leading-snug"><Check tone="warn" /> <span>{f}</span></li>
                                ))}
                              </ul>
                              <div className="mt-4 flex items-center gap-3">
                                <Button size="sm" onClick={() => openDetails(m.robot.id)}>
                                  Подробнее о роботе
                                </Button>
                                <span className="meta">
                                  На вашем складе: <span className="font-medium text-ink num">{m.effective_throughput}</span> паллет/ч на робота
                                </span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              })}
            </div>

            {excluded.length > 0 && (
              <div className="mt-4">
                <button type="button" onClick={() => setShowExcluded((v) => !v)} className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink">
                  <ChevronDown size={14} className={`transition-transform ${showExcluded ? 'rotate-180' : ''}`} />
                  Не подходят по жёстким ограничениям: {excluded.length + Math.max(0, eligible.length - top.length)}
                </button>
                <AnimatePresence initial={false}>
                  {showExcluded && (
                    <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-2 divide-y divide-line overflow-hidden rounded-[12px] border border-line">
                      {[...eligible.slice(4), ...excluded].map((m) => (
                        <li key={m.robot.id} className="flex items-center gap-4 px-4 py-2.5 text-[13px]">
                          <span className="w-[200px] shrink-0 truncate font-medium text-ink-2">{m.robot.short_name}</span>
                          <span className="min-w-0 flex-1 truncate text-ink-3">{m.eligible ? m.summary : m.risks[0]}</span>
                          <span className="num text-ink-4">{m.compatibility} %</span>
                          <button type="button" className="text-accent hover:underline" onClick={() => openDetails(m.robot.id)}>
                            детали
                          </button>
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          <div>
            <div className="h3 mb-3">Как решения проходят по критериям склада</div>
            <div className="card overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-ink-3">
                    <th className="px-4 py-3 text-left font-normal">Критерий</th>
                    {top.slice(0, 3).map((m) => (
                      <th key={m.robot.id} className={`px-2 py-3 text-center font-medium ${m.robot.id === activeId ? 'text-ink' : 'text-ink-3'}`}>
                        {m.robot.short_name.split(' ')[0]}
                        <span className="block text-[11px] font-normal text-ink-4">{m.robot.short_name.split(' ').slice(1).join(' ')}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {CRITERIA.map((c) => (
                    <tr key={c}>
                      <td className="px-4 py-2.5 text-ink-2">{c}</td>
                      {top.slice(0, 3).map((m) => {
                        const ch = m.checks.find((x) => x.criterion === c)
                        return (
                          <td key={m.robot.id} className={`px-2 py-2.5 ${m.robot.id === activeId ? 'bg-accent-soft/40' : ''}`} title={ch?.text}>
                            <div className="flex justify-center">
                              <Check tone={!ch ? 'neutral' : ch.passed ? 'ok' : 'warn'} />
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
              Жёсткие ограничения исключают решение целиком, мягкие снижают совместимость. Наведите на отметку, чтобы увидеть формулировку.
            </p>
            {selected && (
              <div className="mt-5 rounded-[12px] bg-surface-2 p-4 text-[13.5px] leading-relaxed text-ink-2">
                <span className="font-medium text-ink">{selected.robot.short_name}.</span> {selected.summary}
              </div>
            )}
          </div>
        </div>
      )}
    </Screen>
  )
}

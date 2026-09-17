import { AnimatePresence, motion } from 'framer-motion'
import { Screen } from '../components/Screen'
import { robots, type RobotId } from '../data/robots'
import { useStore } from '../store'
import { Bar, Button, Check, Pill } from '../components/ui'

const criteria: { label: string; marks: Record<RobotId, 'ok' | 'warn' | 'neutral'> }[] = [
  { label: 'Проходы 2,8 м', marks: { 'ronavi-h1500': 'ok', 'dmr-carrier-p': 'ok', 'robocv-stacker': 'warn' } },
  { label: 'Грузоподъёмность', marks: { 'ronavi-h1500': 'ok', 'dmr-carrier-p': 'warn', 'robocv-stacker': 'ok' } },
  { label: 'Пик 123 паллет / ч', marks: { 'ronavi-h1500': 'ok', 'dmr-carrier-p': 'ok', 'robocv-stacker': 'warn' } },
  { label: 'Бюджет 15 млн ₽', marks: { 'ronavi-h1500': 'ok', 'dmr-carrier-p': 'ok', 'robocv-stacker': 'warn' } },
  { label: 'Без разметки пола', marks: { 'ronavi-h1500': 'ok', 'dmr-carrier-p': 'warn', 'robocv-stacker': 'neutral' } },
  { label: 'Интеграция с WMS', marks: { 'ronavi-h1500': 'warn', 'dmr-carrier-p': 'warn', 'robocv-stacker': 'warn' } },
]

export function RobotsScreen() {
  const robotId = useStore((s) => s.robotId)
  const selectRobot = useStore((s) => s.selectRobot)
  const openDetails = useStore((s) => s.setRobotDetails)
  const selected = robots.find((r) => r.id === robotId)!

  return (
    <Screen
      title={
        <>
          Подходят три решения, лучшее — {robots[0].name}
        </>
      }
      lead="Каталог отфильтрован по вашему складу: ширина проходов, вес паллет, пиковый поток и бюджет. Совместимость показывает, насколько робот подходит именно этому объекту, а не насколько он хорош вообще."
      nextLabel={`Рассчитать конфигурацию: ${selected.name}`}
    >
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[7fr_5fr]">
        <div className="card divide-y divide-line overflow-hidden">
          {robots.map((r, i) => {
            const active = r.id === robotId
            return (
              <div key={r.id} className={`transition-colors ${active ? 'bg-surface' : 'bg-surface hover:bg-surface-2'}`}>
                <button
                  type="button"
                  onClick={() => selectRobot(r.id)}
                  className="flex w-full items-center gap-5 px-5 py-4 text-left"
                  aria-expanded={active}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      active ? 'border-ink bg-ink' : 'border-line-2'
                    }`}
                  >
                    {active && <span className="h-2 w-2 rounded-full bg-white" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold">{r.name}</span>
                      {i === 0 && <Pill tone="accent">Рекомендация</Pill>}
                      {!r.meetsSla && <Pill tone="warn">не выполняет SLA</Pill>}
                    </span>
                    <span className="block text-[13px] text-ink-3">
                      {r.type} · {r.price.toFixed(1).replace('.', ',')} млн ₽ за робота · {r.payload.toLocaleString('ru-RU')} кг · {r.perRobot} паллет / ч
                    </span>
                  </span>
                  <span className="flex w-[160px] shrink-0 items-center gap-3">
                    <span className="flex-1">
                      <Bar value={r.compatibility} tone={r.compatibility >= 85 ? 'ok' : r.compatibility >= 75 ? 'accent' : 'warn'} height={5} />
                    </span>
                    <span className="display num w-[52px] text-right text-[20px]">{r.compatibility} %</span>
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {active && (
                    <motion.div
                      key="body"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-1 gap-6 px-5 pb-5 pl-[60px] md:grid-cols-2">
                        <div>
                          <div className="mb-2 text-[13px] font-medium text-ink-2">Подходит потому что</div>
                          <ul className="space-y-1.5">
                            {r.fits.map((f) => (
                              <li key={f} className="flex items-start gap-2 text-[13.5px] leading-snug">
                                <Check /> <span>{f}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="mb-2 text-[13px] font-medium text-ink-2">{r.risks.length > 1 ? 'Ограничения' : 'Риск'}</div>
                          <ul className="space-y-1.5">
                            {r.risks.map((f) => (
                              <li key={f} className="flex items-start gap-2 text-[13.5px] leading-snug">
                                <Check tone="warn" /> <span>{f}</span>
                              </li>
                            ))}
                          </ul>
                          <div className="mt-4 flex items-center gap-3">
                            <Button size="sm" onClick={() => openDetails(r.id)}>
                              Подробнее о роботе
                            </Button>
                            <span className="meta">
                              Рекомендуемое количество: <span className="font-medium text-ink num">{r.recommendedCount}</span>
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

        <div>
          <div className="h3 mb-3">Как решения проходят по критериям склада</div>
          <div className="card overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-ink-3">
                  <th className="px-4 py-3 text-left font-normal">Критерий</th>
                  {robots.map((r) => (
                    <th key={r.id} className={`px-2 py-3 text-center font-medium ${r.id === robotId ? 'text-ink' : 'text-ink-3'}`}>
                      {r.name.split(' ')[0]}
                      <span className="block text-[11px] font-normal text-ink-4">{r.name.split(' ').slice(1).join(' ')}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {criteria.map((c) => (
                  <tr key={c.label}>
                    <td className="px-4 py-2.5 text-ink-2">{c.label}</td>
                    {robots.map((r) => (
                      <td key={r.id} className={`px-2 py-2.5 ${r.id === robotId ? 'bg-accent-soft/40' : ''}`}>
                        <div className="flex justify-center">
                          <Check tone={c.marks[r.id]} />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
            Интеграция с WMS отмечена как риск для всех решений: в исходных данных нет версии API. Это влияет на срок внедрения, но не на выбор робота.
          </p>
          <div className="mt-5 rounded-[12px] bg-surface-2 p-4 text-[13.5px] leading-relaxed text-ink-2">
            <span className="font-medium text-ink">{selected.name}.</span> {selected.summary}
          </div>
        </div>
      </div>
    </Screen>
  )
}

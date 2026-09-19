import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { api, fmt, type MatchResult, type RobotOut } from '../api'
import { peek, useQuery } from '../query'
import { useStore } from '../store'
import { Check, Pill, Button, Bar } from './ui'
import { ConfidenceRing } from './TopBar'
import { Loading, ErrorState } from './States'

function Sheet({ open, onClose, children, width = 440 }: { open: boolean; onClose: () => void; children: ReactNode; width?: number }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="bg" className="fixed inset-0 z-40 bg-ink/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={onClose} />
          <motion.aside
            key="panel"
            className="fixed right-3 top-3 bottom-3 z-50 flex flex-col overflow-hidden rounded-[16px] bg-surface shadow-float"
            style={{ width: `min(${width}px, calc(100vw - 24px))` }}
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            role="dialog"
            aria-modal
          >
            {children}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

export function ConfidenceDrawer() {
  const open = useStore((s) => s.confidenceOpen)
  const project = useStore((s) => s.project)
  const close = () => useStore.getState().setConfidenceOpen(false)
  const key = project && open ? `confidence:${project.id}:${project.version}` : null
  const { data, error, loading, reload } = useQuery(key, () => api.confidence(project!.id))
  return (
    <Sheet open={open} onClose={close}>
      <div className="flex items-start justify-between px-6 pt-6 pb-4">
        <div>
          <div className="meta mb-1">Качество исходных данных</div>
          {data && (
            <div className="flex items-center gap-3">
              <ConfidenceRing value={data.score} size={36} />
              <div>
                <div className="display text-[28px] num">{data.score} %</div>
                <div className="meta">
                  {data.recognized} из {data.total} параметров распознаны
                </div>
              </div>
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={close} aria-label="Закрыть" className="!px-2">
          <X size={16} />
        </Button>
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto px-6 pb-6">
        {loading && <Loading label="Загружаем отчёт о данных…" />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {data && (
          <>
            <div className="flex h-2 overflow-hidden rounded-full bg-black/[0.06]">
              <div className="bg-ok" style={{ width: `${(data.confirmed.length / data.total) * 100}%` }} />
              <div className="bg-warn" style={{ width: `${(data.assumptions.length / data.total) * 100}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-[12.5px] text-ink-3">
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-ok" />{data.confirmed.length} подтверждено</span>
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-warn" />{data.assumptions.length} предположений</span>
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-ink-4" />{data.missing.length} нет данных</span>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
              Источник: {project?.source_file || '—'}. Расчёт использует подтверждённые значения; предположения помечены и берутся из типовых значений для объектов этого класса.
            </p>
            {data.warnings.length > 0 && (
              <ul className="mt-3 space-y-1 rounded-[10px] bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
                {data.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            {[
              { title: 'Подтверждено', tone: 'ok' as const, items: data.confirmed },
              { title: 'Предположения', tone: 'warn' as const, items: data.assumptions },
              { title: 'Нет данных', tone: 'neutral' as const, items: data.missing },
            ].map((g) => (
              <section key={g.title} className="hairline mt-4 pt-4 pb-2">
                <div className="mb-2 flex items-center justify-between">
                  <span className="h3">{g.title}</span>
                  <Pill tone={g.tone}>{g.items.length}</Pill>
                </div>
                <ul className="space-y-2">
                  {g.items.map((it) => (
                    <li key={it.key} className="flex items-start gap-2.5">
                      <Check tone={g.tone === 'ok' ? 'ok' : g.tone === 'warn' ? 'warn' : 'neutral'} />
                      <div className="min-w-0">
                        <div className="text-[13.5px] text-ink">
                          {it.label}
                          {it.value !== null && it.kind !== 'bool' && <span className="ml-1.5 text-ink-3 num">{typeof it.value === 'number' ? it.value.toLocaleString('ru-RU') : String(it.value)} {it.unit}</span>}
                        </div>
                        <div className="truncate text-[12.5px] text-ink-3">{it.source === 'confirmed' ? it.source_value : it.note}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </Sheet>
  )
}

const SPEC_LABELS: Record<string, string> = {
  payload_kg: 'Грузоподъёмность',
  speed_mps: 'Скорость',
  throughput_pallets_h: 'Производительность (номинал)',
  battery_hours: 'Время работы',
  charge_min: 'Зарядка',
  navigation: 'Навигация',
  min_aisle_m: 'Минимальный проход',
  lift_height_m: 'Высота подъёма',
  lead_weeks: 'Срок поставки',
  references: 'Внедрений',
}

export function RobotDetails() {
  const id = useStore((s) => s.robotDetailsId)
  const project = useStore((s) => s.project)
  const selectRobot = useStore((s) => s.selectRobot)
  const selected = useStore((s) => s.robotId)
  const close = () => useStore.getState().setRobotDetails(null)
  const matching = project ? peek<MatchResult[]>(`matching:${project.id}:${project.version}`) : undefined
  const match = matching?.find((m) => m.robot.id === id) ?? null
  const robot: RobotOut | null = match?.robot ?? null
  return (
    <Sheet open={!!robot} onClose={close} width={480}>
      {robot && match && (
        <>
          <div className="flex items-start justify-between px-6 pt-6 pb-4">
            <div>
              <div className="meta mb-1">{robot.subtype || robot.category} · {robot.scenario}</div>
              <div className="h2">{robot.short_name}</div>
              <div className="meta mt-1">{robot.vendor}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={close} aria-label="Закрыть" className="!px-2">
              <X size={16} />
            </Button>
          </div>
          <div className="scroll-thin flex-1 overflow-y-auto px-6 pb-6">
            <div className="rounded-[12px] bg-surface-2 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-ink-2">Совместимость с вашим складом</span>
                <span className="display text-[24px] num">{match.compatibility} %</span>
              </div>
              <div className="mt-2">
                <Bar value={match.compatibility} tone={match.compatibility >= 85 ? 'ok' : match.compatibility >= 70 ? 'accent' : 'warn'} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[12px] text-ink-3">
                {Object.entries(match.score_breakdown).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between rounded-[6px] bg-white px-2 py-1">
                    <span>{{ throughput: 'производительность', cost: 'стоимость', infrastructure: 'инфраструктура', maturity: 'зрелость', data_quality: 'данные', references: 'внедрения' }[k] ?? k}</span>
                    <span className="num text-ink">{Math.round(v * 100)}</span>
                  </div>
                ))}
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-[13.5px]">
              <div className="hairline pt-2">
                <dt className="meta">Цена за робота</dt>
                <dd className="mt-0.5 text-ink">{fmt.mln(robot.price_mln)} млн ₽</dd>
              </div>
              <div className="hairline pt-2">
                <dt className="meta">На вашем складе</dt>
                <dd className="mt-0.5 text-ink">{match.effective_throughput} паллет / ч на робота</dd>
              </div>
              {Object.entries(SPEC_LABELS).map(([k, label]) => {
                const s = robot.specs[k]
                if (!s || s.value === 0 || s.value === '') return null
                return (
                  <div key={k} className="hairline pt-2">
                    <dt className="meta flex items-center gap-1.5">
                      {label}
                      {s.is_assumption && <span className="h-1.5 w-1.5 rounded-full bg-warn" title={`Оценка: ${s.source}`} />}
                    </dt>
                    <dd className="mt-0.5 text-ink">
                      {typeof s.value === 'number' ? s.value.toLocaleString('ru-RU') : String(s.value)} {s.unit}
                    </dd>
                  </div>
                )
              })}
            </dl>

            <section className="mt-6">
              <div className="h3 mb-2">Почему подходит</div>
              <ul className="space-y-2">
                {match.fits.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[13.5px]"><Check /> <span>{f}</span></li>
                ))}
              </ul>
            </section>
            {match.risks.length > 0 && (
              <section className="mt-5">
                <div className="h3 mb-2">Ограничения и риски</div>
                <ul className="space-y-2">
                  {match.risks.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13.5px]"><Check tone="warn" /> <span>{f}</span></li>
                  ))}
                </ul>
              </section>
            )}
            {robot.cases && (
              <section className="mt-5">
                <div className="h3 mb-2">Внедрения</div>
                <p className="text-[13px] leading-relaxed text-ink-2">{robot.cases}</p>
              </section>
            )}
            <section className="mt-5 hairline pt-4">
              <div className="flex items-center justify-between">
                <span className="meta">Качество данных о роботе</span>
                <Pill tone={robot.data_quality === 'high' ? 'ok' : robot.data_quality === 'medium' ? 'warn' : 'neutral'}>
                  {robot.data_quality === 'high' ? 'Высокое' : robot.data_quality === 'medium' ? 'Среднее' : 'Низкое'}
                </Pill>
              </div>
              <div className="mt-1 text-[13px] text-ink-2">{robot.data_quality_label}</div>
            </section>
          </div>
          <div className="hairline flex items-center justify-between gap-3 px-6 py-4">
            <span className="meta">
              {match.eligible ? <>Нужно роботов: <span className="text-ink font-medium">{match.required_count}</span></> : 'Не проходит ограничения объекта'}
            </span>
            <Button
              variant={selected === robot.id ? 'secondary' : 'primary'}
              disabled={!match.eligible}
              onClick={() => {
                selectRobot(robot.id, match.required_count)
                if (project) void api.setSelection(project.id, { robot_id: robot.id, count: match.required_count })
                close()
              }}
            >
              {selected === robot.id ? 'Уже выбран' : 'Выбрать это решение'}
            </Button>
          </div>
        </>
      )}
    </Sheet>
  )
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }} className="max-w-[560px] rounded-full bg-ink px-4 py-2 text-center text-[13px] font-medium text-white shadow-float">
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

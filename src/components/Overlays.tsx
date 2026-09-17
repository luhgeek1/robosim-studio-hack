import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useStore } from '../store'
import { confidence, project } from '../data/project'
import { robotById } from '../data/robots'
import { Check, Pill, Button, Bar } from './ui'
import { ConfidenceRing } from './TopBar'

function Sheet({ open, onClose, children, width = 440 }: { open: boolean; onClose: () => void; children: ReactNode; width?: number }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="bg"
            className="fixed inset-0 z-40 bg-ink/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
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
  const close = () => useStore.getState().setConfidenceOpen(false)
  const groups = [
    { key: 'ok', title: 'Подтверждено', tone: 'ok' as const, items: confidence.confirmed, count: 38 },
    { key: 'assumed', title: 'Предположения', tone: 'warn' as const, items: confidence.assumptions, count: 9 },
    { key: 'missing', title: 'Нет данных', tone: 'neutral' as const, items: confidence.missing, count: 4 },
  ]
  return (
    <Sheet open={open} onClose={close}>
      <div className="flex items-start justify-between px-6 pt-6 pb-4">
        <div>
          <div className="meta mb-1">Качество исходных данных</div>
          <div className="flex items-center gap-3">
            <ConfidenceRing value={project.confidence} size={36} />
            <div>
              <div className="display text-[28px] num">{project.confidence} %</div>
              <div className="meta">
                {project.recognized} из {project.total} параметров распознаны
              </div>
            </div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={close} aria-label="Закрыть" className="!px-2">
          <X size={16} />
        </Button>
      </div>
      <div className="px-6 pb-4">
        <div className="flex h-2 overflow-hidden rounded-full bg-black/[0.06]">
          <div className="bg-ok" style={{ width: `${(38 / 51) * 100}%` }} />
          <div className="bg-warn" style={{ width: `${(9 / 51) * 100}%` }} />
        </div>
        <div className="mt-2 flex gap-4 text-[12.5px] text-ink-3">
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-ok" />38 подтверждено</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-warn" />9 предположений</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-ink-4" />4 нет данных</span>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
          Источник: {project.source}, импортирован {project.importedAt}. Расчёт использует подтверждённые значения; предположения помечены и
          не влияют на итоговую рекомендацию сильнее ±6 % по ROI.
        </p>
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto px-6 pb-6">
        {groups.map((g) => (
          <section key={g.key} className="hairline pt-4 pb-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="h3">{g.title}</span>
              <Pill tone={g.tone}>{g.count}</Pill>
            </div>
            <ul className="space-y-2">
              {g.items.map((it) => (
                <li key={it.label} className="flex items-start gap-2.5">
                  <Check tone={g.tone === 'ok' ? 'ok' : g.tone === 'warn' ? 'warn' : 'neutral'} />
                  <div>
                    <div className="text-[13.5px] text-ink">{it.label}</div>
                    {it.detail && <div className="text-[12.5px] text-ink-3">{it.detail}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  )
}

export function RobotDetails() {
  const id = useStore((s) => s.robotDetailsId)
  const selectRobot = useStore((s) => s.selectRobot)
  const close = () => useStore.getState().setRobotDetails(null)
  const robot = id ? robotById(id) : null
  const selected = useStore((s) => s.robotId)
  return (
    <Sheet open={!!robot} onClose={close} width={480}>
      {robot && (
        <>
          <div className="flex items-start justify-between px-6 pt-6 pb-4">
            <div>
              <div className="meta mb-1">{robot.type}</div>
              <div className="h2">{robot.name}</div>
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
                <span className="display text-[24px] num">{robot.compatibility} %</span>
              </div>
              <div className="mt-2">
                <Bar value={robot.compatibility} tone={robot.compatibility >= 85 ? 'ok' : robot.compatibility >= 75 ? 'accent' : 'warn'} />
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-[13.5px]">
              {[
                ['Цена за робота', `${robot.price.toFixed(1).replace('.', ',')} млн ₽`],
                ['Грузоподъёмность', `${robot.payload.toLocaleString('ru-RU')} кг`],
                ['Производительность', `${robot.perRobot} паллет / ч`],
                ['Срок поставки', robot.leadTime],
                ['Навигация', robot.navigation],
                ['Батарея', robot.battery],
              ].map(([k, v]) => (
                <div key={k} className="hairline pt-2">
                  <dt className="meta">{k}</dt>
                  <dd className="mt-0.5 text-ink">{v}</dd>
                </div>
              ))}
            </dl>

            <section className="mt-6">
              <div className="h3 mb-2">Почему подходит</div>
              <ul className="space-y-2">
                {robot.fits.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[13.5px]"><Check /> <span>{f}</span></li>
                ))}
              </ul>
            </section>
            <section className="mt-5">
              <div className="h3 mb-2">Ограничения и риски</div>
              <ul className="space-y-2">
                {robot.risks.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[13.5px]"><Check tone="warn" /> <span>{f}</span></li>
                ))}
              </ul>
            </section>
            <section className="mt-5 hairline pt-4">
              <div className="flex items-center justify-between">
                <span className="meta">Качество данных о роботе</span>
                <Pill tone={robot.dataQuality.level === 'high' ? 'ok' : robot.dataQuality.level === 'medium' ? 'warn' : 'neutral'}>
                  {robot.dataQuality.level === 'high' ? 'Высокое' : robot.dataQuality.level === 'medium' ? 'Среднее' : 'Низкое'}
                </Pill>
              </div>
              <div className="mt-1 text-[13px] text-ink-2">{robot.dataQuality.label}</div>
            </section>
          </div>
          <div className="hairline flex items-center justify-between gap-3 px-6 py-4">
            <span className="meta">
              Рекомендуемое количество: <span className="text-ink font-medium">{robot.recommendedCount}</span>
            </span>
            <Button
              variant={selected === robot.id ? 'secondary' : 'primary'}
              onClick={() => {
                selectRobot(robot.id)
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
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-white shadow-float"
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

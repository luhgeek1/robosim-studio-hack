import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useMatch } from 'react-router'
import { useDataQuality, useProject } from '@/api/projects'
import { useTrace } from '@/api/scenarios'
import type { ProvenanceStatus, TraceItem } from '@/api/types'
import { formatValue } from '@/lib/format'
import { PROVENANCE_LABEL, PROVENANCE_TONE, TRACE_SECTION_LABEL } from '@/lib/labels'
import { useStore } from '@/store'
import { Formula, SourcePill } from './Provenance'
import { ErrorState, Loading } from './States'
import { ConfidenceRing } from './TopBar'
import { Dot, Drawer, DrawerHeader, Pill, inputCls } from './ui'

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[80] flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={`max-w-[560px] rounded-full px-4 py-2 text-center text-[13px] font-medium text-white shadow-float ${t.tone === 'error' ? 'bg-crit' : 'bg-ink'}`}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

const STATUS_ORDER: ProvenanceStatus[] = [
  'user',
  'imported',
  'confirmed',
  'derived',
  'default',
  'assumption',
  'vendor_claim',
  'llm_suggested',
  'missing',
]

export function TrustDrawer() {
  const open = useStore((s) => s.trustOpen)
  const setOpen = useStore((s) => s.setTrustOpen)
  const match = useMatch('/projects/:projectId/*')
  const projectId = match?.params.projectId ?? ''
  const project = useProject(projectId)
  const quality = useDataQuality(projectId)
  const close = () => setOpen(false)
  const counts = project.data?.data_quality.counts ?? {}
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1
  const score = Math.round((project.data?.data_quality.score ?? 0) * 100)
  const toCheck = (quality.data?.items ?? []).filter((i) => ['missing', 'assumption', 'default'].includes(i.status))

  return (
    <Drawer open={open && Boolean(projectId)} onClose={close}>
      <DrawerHeader eyebrow="Откуда взяты данные объекта" title="Достоверность данных" onClose={close}>
        <div className="mt-3 flex items-center gap-3">
          <ConfidenceRing value={score} size={36} />
          <div>
            <div className="display num text-[28px]">{score} %</div>
            <div className="meta">доля введённых и подтверждённых значений среди влияющих на результат</div>
          </div>
        </div>
      </DrawerHeader>
      <div className="scroll-thin flex-1 overflow-y-auto px-6 pb-6">
        <div className="flex h-2 overflow-hidden rounded-full bg-black/[0.06]">
          {STATUS_ORDER.filter((s) => counts[s]).map((s) => (
            <div
              key={s}
              className={
                { ok: 'bg-ok', accent: 'bg-accent', warn: 'bg-warn', crit: 'bg-crit', neutral: 'bg-ink-4' }[
                  PROVENANCE_TONE[s]
                ]
              }
              style={{ width: `${((counts[s] ?? 0) / total) * 100}%` }}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-3">
          {STATUS_ORDER.filter((s) => counts[s]).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <Dot tone={PROVENANCE_TONE[s]} />
              {PROVENANCE_LABEL[s]} <span className="num text-ink">{counts[s]}</span>
            </span>
          ))}
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-ink-2">
          Значения по умолчанию взяты из справочника с источником, допущения — с обоснованием. Чем больше их заменено
          замерами объекта, тем точнее оценка.
        </p>
        {quality.isPending && (
          <div className="mt-5">
            <Loading label="Загружаем параметры…" />
          </div>
        )}
        {toCheck.length > 0 && (
          <>
            <div className="h3 mt-6 mb-2">Что стоит уточнить</div>
            <ul className="divide-y divide-line">
              {toCheck.map((item) => (
                <li key={item.key} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                  <span className="min-w-0">
                    <span className="block truncate text-ink">{item.name}</span>
                    {item.source_title && (
                      <span className="block truncate text-[12px] text-ink-4">{item.source_title}</span>
                    )}
                  </span>
                  <SourcePill status={item.status} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Drawer>
  )
}

const SECTION_ORDER: NonNullable<TraceItem['section']>[] = [
  'demand',
  'sizing',
  'capex',
  'opex',
  'baseline',
  'effect',
  'cashflow',
  'metrics',
]

export function TraceDrawer() {
  const calculationId = useStore((s) => s.traceCalculationId)
  const query = useStore((s) => s.traceQuery)
  const setQuery = useStore((s) => s.setTraceQuery)
  const openTrace = useStore((s) => s.openTrace)
  const trace = useTrace(calculationId, Boolean(calculationId))
  const [expanded, setExpanded] = useState<string | null>(null)
  const close = () => openTrace(null)

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const items = (trace.data?.items ?? []).filter(
      (i) => !needle || i.metric_key.toLowerCase().includes(needle) || i.name.toLowerCase().includes(needle),
    )
    return SECTION_ORDER.map((section) => ({
      section,
      items: items.filter((i) => (i.section ?? 'metrics') === section),
    })).filter((g) => g.items.length > 0)
  }, [trace.data, query])

  return (
    <Drawer open={Boolean(calculationId)} onClose={close} width={640}>
      <DrawerHeader eyebrow="Как посчитано" title="Трасса расчёта" onClose={close}>
        {trace.data && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Pill tone={trace.data.undocumented_constants ? 'crit' : 'ok'}>
              недокументированных коэффициентов: {trace.data.undocumented_constants ?? 0}
            </Pill>
            <Pill>шагов расчёта: {trace.data.items.length}</Pill>
          </div>
        )}
        <div className="relative mt-4">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-4" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти показатель: окупаемость, CAPEX, роботов…"
            className={`${inputCls} pl-9`}
          />
        </div>
      </DrawerHeader>
      <div className="scroll-thin flex-1 overflow-y-auto px-6 pb-6">
        {trace.isPending && <Loading label="Собираем формулы…" />}
        {trace.error && <ErrorState error={trace.error} onRetry={() => trace.refetch()} />}
        {grouped.map(({ section, items }) => (
          <section key={section} className="mb-5">
            <div className="meta mb-1.5 font-medium tracking-wide uppercase">{TRACE_SECTION_LABEL[section]}</div>
            <div className="divide-y divide-line rounded-[12px] border border-line">
              {items.map((item) => {
                const isOpen = expanded === item.metric_key
                return (
                  <div key={item.metric_key}>
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : item.metric_key)}
                      className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left hover:bg-surface-2"
                    >
                      <ChevronRight
                        size={14}
                        className={`shrink-0 text-ink-4 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                      />
                      <span className="min-w-0 flex-1 truncate text-[13.5px]">{item.name}</span>
                      <span className="num shrink-0 text-[13.5px] font-medium">
                        {formatValue(item.value, item.unit)}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="space-y-2 px-3.5 pb-3.5">
                        <Formula formula={item.formula} rendered={item.formula_rendered} inputs={item.inputs} />
                        {item.depends_on.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 text-[12px]">
                            <span className="text-ink-3">Зависит от:</span>
                            {item.depends_on.map((key) => (
                              <button
                                key={key}
                                type="button"
                                onClick={() => {
                                  setQuery(key)
                                  setExpanded(key)
                                }}
                                className="rounded-md bg-black/[0.05] px-1.5 py-0.5 font-mono text-[11px] hover:bg-accent-soft"
                              >
                                {key}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </Drawer>
  )
}

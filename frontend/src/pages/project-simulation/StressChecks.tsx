import { motion } from 'framer-motion'
import { Play, ShieldCheck } from 'lucide-react'
import { isFinal, useSimulationRun } from '@/entities/simulation'
import { formatNumber } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { PulseDot } from '@/shared/ui/kinetics'
import { Spinner } from '@/shared/ui/states'
import type { RunConfig, StressCheck } from './runConfig'

/* Стресс-тесты как вердикт: три прогона отвечают, выдержит ли парк сбои, — «держит / не держит» по сроку. */
export function StressChecks({
  checks,
  starting,
  onRunAll,
  onOpen,
}: {
  checks: { check: StressCheck; runId: string | null }[]
  starting: boolean
  onRunAll: () => void
  onOpen: (config: RunConfig) => void
}) {
  const missing = checks.some((c) => !c.runId)
  return (
    <section className="card px-6 pt-5 pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="h3">Выдержит ли парк сбои</h2>
          <p className="meta mt-0.5">Три проверки того же пика: больше задач, отказ робота и парк без запаса</p>
        </div>
        {missing && (
          <Button size="sm" onClick={onRunAll} disabled={starting}>
            {starting ? <Spinner /> : <ShieldCheck />} Прогнать все проверки
          </Button>
        )}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {checks.map(({ check, runId }, i) => (
          <StressCard key={check.key} check={check} runId={runId} index={i} onOpen={() => onOpen(check.config)} />
        ))}
      </div>
    </section>
  )
}

function StressCard({
  check,
  runId,
  index,
  onOpen,
}: {
  check: StressCheck
  runId: string | null
  index: number
  onOpen: () => void
}) {
  const run = useSimulationRun(runId)
  const summary = run.data?.status === 'done' ? run.data.summary : null
  const pending = Boolean(runId) && !summary && run.data?.status !== 'failed'
  const failed = run.data?.status === 'failed'
  const holds = summary ? summary.sla.achieved_pct >= summary.sla.target_pct : null
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'flex flex-col rounded-[12px] border px-4 py-3.5',
        holds === true && 'border-ok/30 bg-ok-soft/40',
        holds === false && 'border-crit/30 bg-crit-soft/40',
        holds === null && 'border-line bg-surface-2',
      )}
    >
      <div className="text-[14px] font-semibold">{check.title}</div>
      <div className="meta">{check.note}</div>
      <div className="mt-3 flex items-end justify-between gap-2">
        {summary ? (
          <div>
            <div className={cn('hud', holds ? 'text-ok' : 'text-crit')}>{holds ? 'держит' : 'не держит'}</div>
            <div className="display num text-[28px] leading-none">
              {formatNumber(summary.sla.achieved_pct, summary.sla.achieved_pct >= 99 ? 1 : 0)}
              <span className="text-[14px] font-normal tracking-normal text-ink-3"> % в срок</span>
            </div>
          </div>
        ) : pending ? (
          <div className="flex items-center gap-2 text-[13px] text-ink-2">
            <PulseDot /> Считаем
            {run.data && run.data.progress > 0 && !isFinal(run.data.status) && (
              <span className="num text-ink-3">{Math.round(run.data.progress * 100)} %</span>
            )}
          </div>
        ) : (
          <div className="text-[13px] text-ink-3">{failed ? 'Прогон не удался' : 'Не проверено'}</div>
        )}
        {summary && (
          <Button variant="ghost" size="sm" onClick={onOpen} title="Открыть этот прогон в плеере">
            <Play /> В плеере
          </Button>
        )}
      </div>
    </motion.div>
  )
}

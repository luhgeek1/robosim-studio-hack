import { motion } from 'framer-motion'
import type { ProcessDemand } from '@/shared/api/types'
import { formatPct, formatRub } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

/* ФОТ по процессам строками в языке сайта: чернильная полоса на светлой дорожке, сумма и доля справа.
   Клик по строке ведёт к карточке процесса ниже. */
export function LaborCostChart({ processes }: { processes: ProcessDemand[] }) {
  const max = Math.max(...processes.map((p) => p.current?.cost_rub_year ?? 0), 1)
  return (
    <ul className="divide-y divide-line">
      {processes.map((process, i) => {
        const cost = process.current?.cost_rub_year ?? 0
        const share = process.share_of_labor_cost
        return (
          <li key={process.process_key}>
            <button
              type="button"
              onClick={() =>
                document
                  .getElementById(`process-${process.process_key}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="group grid w-full grid-cols-[minmax(0,15rem)_minmax(0,1fr)_9rem] items-center gap-5 py-3 text-left"
            >
              <span
                className="truncate text-[14px] text-ink-2 transition-colors group-hover:text-ink"
                title={process.name}
              >
                {process.name}
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-black/5">
                <motion.span
                  className={cn(
                    'block h-full rounded-full transition-colors',
                    i === 0 ? 'bg-ink' : 'bg-ink/35 group-hover:bg-ink/55',
                  )}
                  initial={{ width: 0 }}
                  animate={{ width: `${(cost / max) * 100}%` }}
                  transition={{ type: 'spring', stiffness: 120, damping: 24, delay: i * 0.04 }}
                />
              </span>
              <span className="num text-right text-[14px]">
                <span className={cn('font-medium', cost === 0 && 'text-ink-4')}>{cost ? formatRub(cost) : '—'}</span>
                {share !== undefined && cost > 0 && (
                  <span className="ml-2 text-[12.5px] text-ink-3">{formatPct(share, { share: true, digits: 0 })}</span>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

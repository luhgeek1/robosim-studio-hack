import { motion } from 'framer-motion'
import type { ProcessMatching } from '@/api/types'
import { Dot } from '@/components/ui'
import { formatRub } from '@/lib/format'
import { countBy, processShort } from './model'

function countText(p: ProcessMatching): string {
  const fit = countBy(p.candidates, 'fit')
  if (fit) return `${fit} ${fit % 10 === 1 && fit % 100 !== 11 ? 'подходит' : 'подходят'}`
  const check = countBy(p.candidates, 'check')
  if (check) return `${check} на проверку`
  return 'нет подходящих'
}

export function ProcessSwitcher({
  processes,
  value,
  inScenario,
  costs,
  onChange,
}: {
  processes: ProcessMatching[]
  value: string
  inScenario: Set<string>
  costs: Map<string, number>
  onChange: (processKey: string) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Процессы объекта"
      className="inline-flex flex-wrap gap-1 rounded-[12px] bg-black/[0.05] p-[3px]"
    >
      {processes.map((p) => {
        const active = p.process_key === value
        const cost = costs.get(p.process_key)
        return (
          <button
            key={p.process_key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(p.process_key)}
            title={`${p.name}${cost ? ` · ФОТ ${formatRub(cost)} в год` : ''}${inScenario.has(p.process_key) ? ' · в сценарии' : ''}`}
            className={`relative rounded-[9px] px-3 py-1.5 text-left transition-colors ${active ? 'text-ink' : 'text-ink-3 hover:text-ink-2'}`}
          >
            {active && (
              <motion.span
                layoutId="robots-process"
                className="absolute inset-0 rounded-[9px] bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)]"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative z-10 block">
              <span className="flex items-center gap-1.5 text-[13px] font-medium whitespace-nowrap">
                {inScenario.has(p.process_key) && <Dot tone="ok" />}
                {processShort(p)}
              </span>
              <span className="block text-[11.5px] whitespace-nowrap text-ink-3">{countText(p)}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

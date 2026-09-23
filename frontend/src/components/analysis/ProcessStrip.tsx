import type { CSSProperties } from 'react'
import type { ProcessDemand } from '@/api/types'
import { Bar, Pill } from '@/components/ui'
import { formatNumber, formatPct, formatRub, isNum } from '@/lib/format'
import { shortName, unitOf } from './process'

export function ProcessStrip({
  processes,
  selectedKey,
  mainKey,
  onSelect,
}: {
  processes: ProcessDemand[]
  selectedKey: string
  mainKey: string
  onSelect: (key: string) => void
}) {
  return (
    <div
      className="card grid grid-cols-1 divide-y divide-line overflow-hidden sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-[repeat(var(--n),minmax(0,1fr))] lg:divide-x"
      style={{ '--n': processes.length } as CSSProperties}
    >
      {processes.map((p, i) => {
        const selected = p.process_key === selectedKey
        const share = p.share_of_labor_cost
        return (
          <button
            key={p.process_key}
            type="button"
            onClick={() => onSelect(p.process_key)}
            aria-pressed={selected}
            title={p.name}
            className={`relative flex flex-col p-4 text-left transition-colors ${
              selected ? 'bg-surface-2' : 'hover:bg-surface-2/70'
            }`}
          >
            {selected && <span className="absolute inset-x-0 top-0 h-[2px] bg-ink" />}
            <span className="flex items-start justify-between gap-2">
              <span className="line-clamp-2 min-h-[2.6em] text-[13px] leading-snug text-ink-3">{shortName(p)}</span>
              {i < processes.length - 1 && <span className="hidden text-ink-4 lg:inline">›</span>}
            </span>
            <span className="display num mt-2 text-[24px]">{formatNumber(p.demand_per_day)}</span>
            <span className="meta">{isNum(p.demand_per_day) ? `${unitOf(p)} / сутки` : 'объём не задан'}</span>
            <span className="mt-3 text-[13px]">
              <span className="num font-medium">{formatRub(p.current?.cost_rub_year)}</span>
              <span className="text-ink-3"> в год</span>
            </span>
            {isNum(share) && (
              <span className="mt-1.5 flex items-center gap-2">
                <span className="flex-1">
                  <Bar value={share * 100} tone={p.process_key === mainKey ? 'warn' : 'neutral'} height={4} />
                </span>
                <span className="num text-[12px] text-ink-3">{formatPct(share, { share: true, digits: 0 })}</span>
              </span>
            )}
            <span className="mt-3">
              <Pill tone={p.robotizable ? 'ok' : 'neutral'}>
                {p.robotizable ? 'можно роботизировать' : 'без роботов'}
              </Pill>
            </span>
          </button>
        )
      })}
    </div>
  )
}

import type { ReactNode } from 'react'
import type { Reason } from '@/api/types'
import { Check } from '@/components/ui'
import { formatValue } from '@/lib/format'
import type { ReasonGroups } from './model'

function CritMark() {
  return (
    <span className="mt-[2px] inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-crit-soft text-crit">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
        <path d="M3 3l4 4M7 3l-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  )
}

function Item({ mark, children, sub }: { mark: ReactNode; children: ReactNode; sub?: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[13.5px] leading-snug">
      {mark}
      <span className="min-w-0">
        {children}
        {sub && <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-3">{sub}</span>}
      </span>
    </li>
  )
}

// The reason text is shown verbatim (contract); the requirement and the product's value are repeated for exclusions.
const requirement = (r: Reason) =>
  r.required != null && r.actual != null
    ? `требование объекта: ${formatValue(r.required, r.unit)} · у решения: ${formatValue(r.actual, r.unit)}`
    : undefined

export function PassedList({ reasons }: { reasons: Reason[] }) {
  if (!reasons.length)
    return <p className="text-[13px] text-ink-3">Подтверждённых совпадений нет — проверки ждут данных производителя.</p>
  return (
    <ul className="space-y-1.5">
      {reasons.map((r, i) => (
        <Item key={`${r.code}-${i}`} mark={<Check />}>
          {r.text}
        </Item>
      ))}
    </ul>
  )
}

export function RiskList({ groups }: { groups: ReasonGroups }) {
  const empty = !groups.blocking.length && !groups.warnings.length && !groups.missing.length && !groups.notes.length
  if (empty) return <p className="text-[13px] text-ink-3">Ограничений не найдено.</p>
  return (
    <ul className="space-y-2">
      {groups.blocking.map((r, i) => (
        <Item key={`b-${r.code}-${i}`} mark={<CritMark />} sub={requirement(r)}>
          {r.text}
        </Item>
      ))}
      {groups.warnings.map(({ reason, why }, i) => (
        <Item key={`w-${reason.code}-${i}`} mark={<Check tone="warn" />} sub={why}>
          {reason.text}
        </Item>
      ))}
      {groups.missing.map((m) => (
        <Item key={`m-${m.spec_key}`} mark={<Check tone="warn" />} sub={m.why_needed}>
          Нет данных: {m.name}
        </Item>
      ))}
      {groups.notes.map((r, i) => (
        <Item key={`n-${r.code}-${i}`} mark={<Check tone="neutral" />}>
          <span className="text-ink-2">{r.text}</span>
        </Item>
      ))}
    </ul>
  )
}

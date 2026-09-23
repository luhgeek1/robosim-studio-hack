import { Info } from 'lucide-react'
import type { ProcessDemand } from '@/api/types'
import { SourceDot } from '@/components/Provenance'
import { formatNumber, formatPct, formatRub, isNum } from '@/lib/format'
import { unitOf } from './process'

// Level 3 of the step: who does the work today, what it costs and how the staff was split between processes.
export function LaborDetails({
  processes,
  solutionNames,
}: {
  processes: ProcessDemand[]
  solutionNames: Map<string, string>
}) {
  return (
    <div className="card divide-y divide-line">
      {processes.map((p) => (
        <ProcessLabor key={p.process_key} process={p} solutionNames={solutionNames} />
      ))}
    </div>
  )
}

function ProcessLabor({ process: p, solutionNames }: { process: ProcessDemand; solutionNames: Map<string, string> }) {
  const unit = unitOf(p)
  const current = p.current
  const groups = current?.labor_groups ?? []
  const solutions = (p.solution_types ?? []).flatMap((key) => solutionNames.get(key) ?? [])
  const facts: string[] = []
  if (isNum(p.demand_per_day)) facts.push(`спрос ${formatNumber(p.demand_per_day)} ${unit}/сут`)
  if (isNum(p.avg_per_hour)) facts.push(`в среднем ${formatNumber(p.avg_per_hour)} ${unit}/ч`)
  if (isNum(p.peak_per_hour)) facts.push(`в пик ${formatNumber(p.peak_per_hour)} ${unit}/ч`)
  if (isNum(current?.productivity_per_hour))
    facts.push(`выработка ${formatNumber(current.productivity_per_hour)} ${unit}/ч на человека`)
  if (isNum(current?.sla_now)) facts.push(`вовремя сейчас ${formatPct(current.sla_now, { share: true })}`)

  return (
    <section className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{p.name}</h3>
        <span className="num text-[13px] text-ink-2">
          {formatRub(current?.cost_rub_year)} в год
          {isNum(current?.fte) && ` · ${formatNumber(current.fte)} чел.`}
        </span>
      </div>
      {facts.length > 0 && <p className="mt-1 text-[12.5px] text-ink-3">{facts.join(' · ')}</p>}
      {solutions.length > 0 && <p className="mt-0.5 text-[12.5px] text-ink-3">Решения: {solutions.join(', ')}</p>}

      {groups.length > 0 ? (
        <table className="mt-3 w-full text-[13px]">
          <thead>
            <tr className="text-left text-[12px] text-ink-3">
              <th className="pb-1.5 font-normal">Группа персонала</th>
              <th className="pb-1.5 text-right font-normal">Чел.</th>
              <th className="pb-1.5 text-right font-normal">Оклад в месяц</th>
              <th className="pb-1.5 text-right font-normal">Затраты в год</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line border-t border-line">
            {groups.map((g) => (
              <tr key={g.key}>
                <td className="py-1.5">
                  <span className="flex items-center gap-1.5">
                    {g.name}
                    <SourceDot provenance={g.provenance} />
                  </span>
                </td>
                <td className="num py-1.5 text-right">{formatNumber(g.headcount)}</td>
                <td className="num py-1.5 text-right">{formatRub(g.salary_rub_month)}</td>
                <td className="num py-1.5 text-right font-medium">{formatRub(g.cost_rub_year)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-3 text-[13px] text-ink-3">Персонал процесса не задан.</p>
      )}

      {p.notes && p.notes.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {p.notes.map((note, i) => (
            <li key={i} className="flex gap-1.5 text-[12.5px] leading-snug text-ink-3">
              <Info size={13} className="mt-[2px] shrink-0" />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

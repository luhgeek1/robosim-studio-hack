import { ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { ProvenanceBadge } from '@/entities/provenance'
import type { ProcessDemand } from '@/shared/api/types'
import { formatNumber, formatPct, formatRub } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { DEMAND_UNIT_LABEL } from './labels'

export function ProcessCard({
  process,
  solutionNames,
  peakFactor,
}: {
  process: ProcessDemand
  solutionNames: Map<string, string>
  peakFactor?: number
}) {
  const unit = DEMAND_UNIT_LABEL[process.demand_unit] ?? process.demand_unit
  const current = process.current
  const share = process.share_of_labor_cost
  const groups = current?.labor_groups ?? []
  const profile = process.hourly_profile ?? []
  const solutions = (process.solution_types ?? []).map((key) => solutionNames.get(key) ?? key)

  return (
    <article className="card overflow-hidden">
      <header className="px-6 pt-5 pb-4">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h2 className="h3 text-[18px]">{process.name}</h2>
            <p className="mt-1 flex min-w-0 items-center gap-2 text-[13px] text-ink-3">
              <span className="flex shrink-0 items-center gap-1.5">
                <span className={cn('size-1.5 rounded-full', process.robotizable ? 'bg-ok' : 'bg-ink-4')} />
                {process.robotizable ? 'Можно роботизировать' : 'Роботизация не предусмотрена'}
              </span>
              {solutions.length > 0 && (
                <span className="truncate" title={solutions.join(', ')}>
                  · {solutions.join(', ')}
                </span>
              )}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="display num text-[26px]">{formatRub(current?.cost_rub_year)}</div>
            <div className="meta mt-1">
              в год{share !== undefined && ` · ${formatPct(share, { share: true })} всего ФОТ`}
            </div>
          </div>
        </div>
        {share !== undefined && (
          <div className="mt-4 h-0.75 w-full overflow-hidden rounded-full bg-black/5">
            <div className="h-full rounded-full bg-ink" style={{ width: `${Math.min(share, 1) * 100}%` }} />
          </div>
        )}
      </header>

      <div className="hairline grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="px-6 py-5">
          <dl className="grid grid-cols-3 gap-x-6 gap-y-5">
            <Figure value={formatNumber(process.demand_per_day)} label={`${unit} в сутки`} />
            <Figure value={formatNumber(process.avg_per_hour)} label={`${unit}/ч в среднем`} />
            <Figure
              value={formatNumber(process.peak_per_hour)}
              label={`${unit}/ч в пик${peakFactor ? ` · ×${formatNumber(peakFactor)}` : ''}`}
              tone="warn"
            />
            <Figure value={current?.fte !== undefined ? formatNumber(current.fte) : '—'} label="человек занято" />
            <Figure
              value={current?.productivity_per_hour != null ? formatNumber(current.productivity_per_hour) : '—'}
              label={`${unit}/ч на сотрудника`}
            />
            <Figure
              value={current?.sla_now != null ? formatPct(current.sla_now, { share: true }) : '—'}
              label={current?.sla_now != null ? 'вовремя сейчас' : 'вовремя: не оценено'}
            />
          </dl>

          {profile.length > 0 && (
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[13px] text-ink-2">Спрос по часам</span>
                {process.profile_provenance && <ProvenanceBadge provenance={process.profile_provenance} />}
              </div>
              <HourStrip profile={profile} />
            </div>
          )}
        </div>

        <div className="border-t border-line bg-surface-2/60 px-6 py-5 lg:border-t-0 lg:border-l">
          <div className="mb-3 text-[13px] text-ink-2">Кто делает сейчас</div>
          {groups.length > 0 ? (
            <ul className="divide-y divide-line">
              {groups.map((group) => (
                <li key={group.key} className="flex items-start justify-between gap-4 py-2.5 first:pt-0">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-[14px] font-medium">
                      {group.name}
                      {group.provenance && <ProvenanceBadge provenance={group.provenance} />}
                    </div>
                    <div className="num mt-0.5 text-[12.5px] text-ink-3">
                      {formatNumber(group.headcount)} чел. × {formatRub(group.salary_rub_month)} в месяц
                    </div>
                  </div>
                  <div className="num shrink-0 text-right text-[14px] font-medium">
                    {formatRub(group.cost_rub_year)}
                    <div className="text-[12px] font-normal text-ink-3">в год</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-3">Персонал процесса не задан.</p>
          )}
          {process.notes && process.notes.length > 0 && <Notes notes={process.notes} />}
        </div>
      </div>
    </article>
  )
}

function Figure({ value, label, tone }: { value: ReactNode; label: string; tone?: 'warn' }) {
  // dt раньше dd по смыслу, а визуально число сверху — поэтому колонка развёрнута.
  return (
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="mt-0.5 truncate text-[12.5px] text-ink-3" title={label}>
        {label}
      </dt>
      <dd
        className={cn('num text-[19px] leading-tight font-semibold tracking-[-0.01em]', tone === 'warn' && 'text-warn')}
      >
        {value}
      </dd>
    </div>
  )
}

/* Профиль суток полосой из 24 столбиков: часы выше ровной доли по рабочим часам — тёплым цветом. */
function HourStrip({ profile }: { profile: number[] }) {
  const workingHours = profile.filter((share) => share > 0).length
  const even = workingHours ? 1 / workingHours : 0
  const max = Math.max(...profile, even, 0.0001)
  return (
    <div>
      <div className="flex h-16 items-end gap-0.75">
        {profile.map((share, hour) => {
          const above = share > even * 1.001
          return (
            <div
              key={hour}
              title={`${String(hour).padStart(2, '0')}:00 — ${formatPct(share, { share: true })} суточного объёма`}
              className={cn(
                'flex-1 rounded-t-[3px] transition-opacity hover:opacity-70',
                share === 0 ? 'bg-black/4' : above ? 'bg-warn' : 'bg-black/12',
              )}
              style={{ height: `${Math.max(share / max, share ? 0.06 : 0.04) * 100}%` }}
            />
          )
        })}
      </div>
      <div className="num mt-1.5 flex justify-between text-[11px] text-ink-4">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-ink-3">
        <span className="size-2 rounded-[2px] bg-warn" /> часы выше средней нагрузки
      </div>
    </div>
  )
}

/* Пояснения к расчёту важны для проверки, но не для первого взгляда — прячем их под раскрытие. */
function Notes({ notes }: { notes: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[12.5px] font-medium text-ink-3 transition-colors hover:text-ink"
      >
        <ChevronRight size={14} className={cn('transition-transform', open && 'rotate-90')} />
        Как распределён персонал
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5 pl-5 text-[12.5px] leading-relaxed text-ink-3">
          {notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

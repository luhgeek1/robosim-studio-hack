import { Info } from 'lucide-react'
import { ProvenanceBadge } from '@/entities/provenance'
import type { ProcessDemand } from '@/shared/api/types'
import { formatNumber, formatPct, formatRub } from '@/shared/lib/format'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { ToneBadge } from '@/shared/ui/tone'
import { HourlyProfileChart } from './HourlyProfileChart'
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

  return (
    <article className="rounded-xl border bg-card">
      <header className="grid grid-cols-[minmax(0,1fr)_15rem] items-start gap-6 border-b px-5 py-4">
        <div className="min-w-0 space-y-1">
          <h2 className="text-base font-semibold">{process.name}</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {process.robotizable ? (
              <ToneBadge tone="ok">Можно роботизировать</ToneBadge>
            ) : (
              <ToneBadge tone="muted">Роботизация не предусмотрена</ToneBadge>
            )}
            {process.solution_types?.map((key) => (
              <ToneBadge key={key} tone="info">
                {solutionNames.get(key) ?? key}
              </ToneBadge>
            ))}
          </div>
        </div>
        <div className="space-y-1 text-right">
          <div className="num text-xl font-semibold tracking-tight">{formatRub(current?.cost_rub_year)}</div>
          <div className="text-xs text-muted-foreground">ФОТ процесса в год</div>
          {share !== undefined && (
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-chart-1" style={{ width: `${Math.min(share, 1) * 100}%` }} />
              </div>
              <span className="num w-20 text-xs">{formatPct(share, { share: true })} ФОТ</span>
            </div>
          )}
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-6 px-5 py-4">
        <div className="space-y-4">
          <dl className="grid grid-cols-3 gap-3">
            <Metric label="Спрос в сутки" value={`${formatNumber(process.demand_per_day)} ${unit}`} />
            <Metric label="В среднем за час" value={`${formatNumber(process.avg_per_hour)} ${unit}/ч`} />
            <Metric
              label={peakFactor ? `В пик (×${formatNumber(peakFactor)})` : 'В пиковый час'}
              value={`${formatNumber(process.peak_per_hour)} ${unit}/ч`}
              accent
            />
            <Metric
              label="Сейчас занято"
              value={current?.fte !== undefined ? `${formatNumber(current.fte)} FTE` : '—'}
            />
            <Metric
              label="Выработка на сотрудника"
              value={
                current?.productivity_per_hour != null
                  ? `${formatNumber(current.productivity_per_hour)} ${unit}/ч`
                  : '—'
              }
            />
            <Metric
              label="Вовремя сейчас"
              value={current?.sla_now != null ? formatPct(current.sla_now, { share: true }) : 'не оценено'}
            />
          </dl>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Профиль спроса по часам</span>
              {process.profile_provenance && <ProvenanceBadge provenance={process.profile_provenance} />}
            </div>
            {profile.length > 0 ? (
              <>
                <HourlyProfileChart profile={profile} />
                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-2 rounded-sm bg-chart-3" /> часы нагрузки выше средней
                </div>
              </>
            ) : (
              <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                Почасовой профиль не передан: пиковый час оценён через пиковый коэффициент
                {peakFactor ? ` ×${formatNumber(peakFactor)}` : ''} к среднему часу.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground">Кто делает сейчас</div>
          {groups.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Группа персонала</TableHead>
                  <TableHead className="text-right">Чел.</TableHead>
                  <TableHead className="text-right">Оклад, мес</TableHead>
                  <TableHead className="text-right">Затраты, год</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <TableRow key={group.key}>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {group.name}
                        {group.provenance && <ProvenanceBadge provenance={group.provenance} />}
                      </div>
                    </TableCell>
                    <TableCell className="num text-right">{formatNumber(group.headcount)}</TableCell>
                    <TableCell className="num text-right">{formatRub(group.salary_rub_month)}</TableCell>
                    <TableCell className="num text-right">{formatRub(group.cost_rub_year)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-xs text-muted-foreground">Персонал процесса не задан.</p>
          )}

          {process.notes && process.notes.length > 0 && (
            <ul className="space-y-1.5">
              {process.notes.map((note, i) => (
                <li key={i} className="flex gap-1.5 text-xs text-muted-foreground">
                  <Info className="mt-px size-3.5 shrink-0" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </article>
  )
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-muted-foreground" title={label}>
        {label}
      </dt>
      <dd className={accent ? 'num font-semibold text-warn' : 'num font-semibold'}>{value}</dd>
    </div>
  )
}

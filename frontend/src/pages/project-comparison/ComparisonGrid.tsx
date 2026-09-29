import { ArrowDown, ArrowUp, Check } from 'lucide-react'
import { Link } from 'react-router'
import { SCENARIO_KIND_LABEL } from '@/entities/scenario'
import type { ComparisonTable } from '@/shared/api/types'
import { cn } from '@/shared/lib/utils'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { ToneBadge } from '@/shared/ui/tone'
import { formatByUnit } from './format'

const BETTER_HINT = {
  higher: { icon: ArrowUp, text: 'больше — лучше' },
  lower: { icon: ArrowDown, text: 'меньше — лучше' },
} as const

export function ComparisonGrid({ table }: { table: ComparisonTable }) {
  const recommendedId = table.recommendation?.scenario_id ?? null
  const highlight = (id: string) => id === recommendedId && 'bg-surface-2'

  return (
    // На телефоне таблица листается вбок внутри своей карточки, а колонка показателей остаётся на месте.
    <Table className="table-fixed" style={{ minWidth: `${11 + table.scenarios.length * 8}rem` }}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-44 pl-4 align-bottom max-sm:sticky max-sm:left-0 max-sm:z-10 max-sm:bg-card sm:w-64 sm:pl-5">
            Показатель
          </TableHead>
          {table.scenarios.map((s) => (
            <TableHead
              key={s.scenario_id}
              className={cn('h-auto py-2 align-bottom whitespace-normal', highlight(s.scenario_id))}
            >
              <div className="flex flex-wrap items-center gap-1">
                {s.scenario_id === recommendedId && (
                  <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium text-white">
                    рекомендуем
                  </span>
                )}
                {s.status === 'stale' && <ToneBadge tone="warn">устарел — пересчитайте</ToneBadge>}
              </div>
              <Link
                to={`../scenarios/${s.scenario_id}`}
                className="mt-1 block leading-snug font-semibold text-foreground hover:underline"
              >
                {s.name}
              </Link>
              {SCENARIO_KIND_LABEL[s.kind] !== s.name && (
                <div className="text-xs font-normal text-muted-foreground">{SCENARIO_KIND_LABEL[s.kind]}</div>
              )}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {table.rows.map((row) => {
          const hint = row.better === 'none' ? null : BETTER_HINT[row.better]
          return (
            <TableRow key={row.metric_key}>
              <TableCell className="pl-4 whitespace-normal max-sm:sticky max-sm:left-0 max-sm:z-10 max-sm:bg-card sm:pl-5">
                <div className="font-medium">{row.name}</div>
                <div className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
                  {row.unit && <span className="whitespace-nowrap">{row.unit}</span>}
                  {hint && (
                    <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
                      {row.unit && '·'} <hint.icon className="size-3" /> {hint.text}
                    </span>
                  )}
                </div>
              </TableCell>
              {table.scenarios.map((s) => {
                const best = row.best_scenario_id === s.scenario_id
                return (
                  <TableCell key={s.scenario_id} className={cn('num', highlight(s.scenario_id))}>
                    <span className={cn('inline-flex items-center gap-1', best && 'font-semibold text-ok')}>
                      {formatByUnit(row.values[s.scenario_id], row.unit, s.kind !== 'baseline')}
                      {best && <Check className="size-3.5" aria-label="лучшее значение" />}
                    </span>
                  </TableCell>
                )
              })}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

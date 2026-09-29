import { ChevronRight } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Formula } from '@/entities/provenance'
import type { TraceInput } from '@/shared/api/types'
import { formatRub } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

export type CostRow = {
  key: string
  name: string
  amount: number
  formula: string
  formulaRendered?: string | null
  inputs: TraceInput[]
  note?: string | null
  normKey?: string | null
  hint?: string | null
}

// ТЗ 3.5.8: every CAPEX/OPEX line opens into its formula, substituted values and the sources of each input.
export function CostTable({
  rows,
  total,
  totalLabel = 'Итого',
  unitSuffix = '',
}: {
  rows: CostRow[]
  total: number
  totalLabel?: string
  unitSuffix?: string
}) {
  const [open, setOpen] = useState<string | null>(null)
  const max = Math.max(...rows.map((r) => Math.abs(r.amount)), 1)

  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((row) => {
          const expanded = open === row.key
          return (
            <Fragment key={row.key}>
              <tr
                className={cn(
                  'cursor-pointer border-t transition-colors hover:bg-raised/60',
                  expanded && 'bg-raised/60',
                )}
                onClick={() => setOpen(expanded ? null : row.key)}
              >
                <td className="py-2 pr-2 pl-1">
                  <div className="flex items-center gap-1.5">
                    <ChevronRight
                      className={cn(
                        'size-3.5 shrink-0 text-muted-foreground transition-transform',
                        expanded && 'rotate-90',
                      )}
                    />
                    <span>{row.name}</span>
                  </div>
                  {row.hint && <div className="pl-5 text-xs text-muted-foreground">{row.hint}</div>}
                </td>
                <td className="w-12 py-2 pr-3 sm:w-40">
                  <div className="h-1.5 rounded-full bg-muted">
                    <div
                      className={cn('h-full rounded-full', row.amount < 0 ? 'bg-crit/60' : 'bg-primary/60')}
                      style={{ width: `${(Math.abs(row.amount) / max) * 100}%` }}
                    />
                  </div>
                </td>
                <td className="num py-2 pr-1 text-right font-medium whitespace-nowrap">
                  {formatRub(row.amount)}
                  {unitSuffix}
                </td>
              </tr>
              {expanded && (
                <tr className="bg-raised/30">
                  <td colSpan={3} className="px-2 pt-1 pb-4 sm:px-6">
                    <Formula formula={row.formula} rendered={row.formulaRendered} inputs={row.inputs} note={row.note} />
                    {row.normKey && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Норматив: <span className="font-mono">{row.normKey}</span> — можно переопределить в условиях
                        сценария
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          )
        })}
        <tr className="border-t-2 font-semibold">
          <td className="py-2 pl-6">{totalLabel}</td>
          <td />
          <td className="num py-2 pr-1 text-right whitespace-nowrap">
            {formatRub(total)}
            {unitSuffix}
          </td>
        </tr>
      </tbody>
    </table>
  )
}

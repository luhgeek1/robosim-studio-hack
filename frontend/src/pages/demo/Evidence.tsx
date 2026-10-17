import { Fragment, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { DemoSnapshot } from '@/entities/demo/api'
import type { CalculationRun } from '@/shared/api/types'
import { formatNumber } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { FleetCheckStatus, type FleetCheckState } from './FleetCheck'

export function Evidence({
  demo,
  calculation,
  fleet,
  pending,
}: {
  demo: DemoSnapshot
  calculation: CalculationRun
  fleet: FleetCheckState
  pending: boolean
}) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <section aria-label="Состав парка" className="overflow-hidden rounded-lg border border-line bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-[14px] font-semibold">Состав парка</h2>
        <span className="text-[11px] text-ink-3">Количество включает резерв</span>
      </div>
      <Table aria-label="Подобранные роботы" aria-busy={pending} className="text-[12px]">
        <TableHeader className="bg-surface-2">
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-9 pl-4 text-[11px] font-normal text-ink-3">Процесс / модель</TableHead>
            <TableHead className="h-9 text-right text-[11px] font-normal text-ink-3">Кол-во</TableHead>
            <TableHead className="hidden h-9 text-right text-[11px] font-normal text-ink-3 sm:table-cell">
              Резерв
            </TableHead>
            <TableHead className="hidden h-9 text-right text-[11px] font-normal text-ink-3 md:table-cell">
              Спрос в пик, ед/ч
            </TableHead>
            <TableHead className="h-9 pr-4">
              <span className="sr-only">Обоснование</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {calculation.sizing.map((s) => {
            const process = demo.matching.processes.find((p) => p.process_key === s.process_key)
            const candidate = process?.candidates.find((c) => c.product.id === s.product_id)
            const expanded = open === s.process_key
            return (
              <Fragment key={s.process_key}>
                <TableRow className={expanded ? 'bg-surface-2' : undefined}>
                  <TableCell className="w-full py-3 pl-4 whitespace-normal">
                    <p className="text-[11px] leading-relaxed text-ink-3">{process?.name ?? s.process_key}</p>
                    <p className="mt-0.5 font-medium leading-relaxed">{s.product_name}</p>
                    <p className="mt-0.5 text-[11px] text-ink-3">{candidate?.product.manufacturer?.name}</p>
                  </TableCell>
                  <TableCell className={cn('num text-right font-semibold', pending && 'opacity-40')}>
                    {formatNumber(s.count.final)}
                  </TableCell>
                  <TableCell className="num hidden text-right text-ink-3 sm:table-cell">
                    {formatNumber(s.count.reserve ?? 0)}
                  </TableCell>
                  <TableCell className="num hidden text-right text-ink-3 md:table-cell">
                    {formatNumber(s.demand_peak_per_hour)}
                  </TableCell>
                  <TableCell className="pr-4">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Обоснование: ${s.product_name ?? s.process_key}`}
                      aria-expanded={expanded}
                      aria-controls={`demo-sizing-${s.process_key}`}
                      onClick={() => setOpen(expanded ? null : s.process_key)}
                    >
                      <ChevronDown className={cn('transition-transform', expanded && 'rotate-180')} />
                    </Button>
                  </TableCell>
                </TableRow>
                {expanded && (
                  <TableRow className="bg-surface-2 hover:bg-surface-2">
                    <TableCell colSpan={5} className="px-4 py-4 whitespace-normal">
                      <div id={`demo-sizing-${s.process_key}`} className="grid gap-5 md:grid-cols-3">
                        <div className="space-y-2">
                          <h3 className="font-medium">Расчёт количества</h3>
                          <dl className="space-y-1.5 text-[11px]">
                            {[
                              ['По формуле', s.count.analytic],
                              ['Резерв', s.count.reserve ?? 0],
                              ['Принято в расчёте', s.count.final],
                            ].map(([label, amount]) => (
                              <div key={String(label)} className="flex justify-between gap-3">
                                <dt className="text-ink-3">{label}</dt>
                                <dd className="num">{formatNumber(Number(amount))}</dd>
                              </div>
                            ))}
                          </dl>
                          <p className="text-[11px] leading-relaxed text-ink-3">{s.count.explanation}</p>
                        </div>
                        <div className="space-y-2">
                          <h3 className="font-medium">Производительность</h3>
                          <dl className="space-y-1.5 text-[11px]">
                            <div className="flex justify-between gap-3">
                              <dt className="text-ink-3">Спрос в пик</dt>
                              <dd className="num">{formatNumber(s.demand_peak_per_hour)} ед/ч</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="text-ink-3">Один робот</dt>
                              <dd className="num">{formatNumber(s.robot.effective_throughput_per_hour)} ед/ч</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                              <dt className="text-ink-3">Время цикла</dt>
                              <dd className="num">
                                {s.robot.cycle_time_s == null ? '—' : `${formatNumber(s.robot.cycle_time_s)} с`}
                              </dd>
                            </div>
                          </dl>
                        </div>
                        <div className="space-y-2">
                          <h3 className="font-medium">Почему эта модель</h3>
                          {candidate?.reasons.slice(0, 3).map((r, i) => (
                            <p key={i} className="text-[11px] leading-relaxed text-ink-3">
                              {r.text}
                            </p>
                          ))}
                          {!!candidate?.missing_data.length && (
                            <p className="text-[11px] text-warn">
                              Нужно подтвердить: {candidate.missing_data.map((v) => v.name).join(', ')}.
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            )
          })}
        </TableBody>
      </Table>
      <FleetCheckStatus demo={demo} fleet={fleet} />
    </section>
  )
}

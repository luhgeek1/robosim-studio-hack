import type { DemoSnapshot } from '@/entities/demo/api'
import type { CalculationRun } from '@/shared/api/types'
import { formatRub, formatYears } from '@/shared/lib/format'
import { CostTable, type CostRow } from '@/pages/project-scenario/CostTable'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'

export function DemoCosts({
  demo,
  calculation,
  pending,
}: {
  demo: DemoSnapshot
  calculation: CalculationRun
  pending: boolean
}) {
  const sections = [
    { key: 'capex', label: 'Вложения', total: calculation.capex.total_rub, rows: calculation.capex.items },
    { key: 'opex', label: 'Расходы в год', total: calculation.opex_year.total_rub, rows: calculation.opex_year.items },
    {
      key: 'effect',
      label: 'Эффект в год',
      total: calculation.effect_year.total_rub_year,
      rows: calculation.effect_year.items.map((item): CostRow => ({
        key: item.key,
        name: item.name,
        amount: item.amount_rub_year,
        formula: item.formula,
        formulaRendered: item.formula_rendered,
        inputs: item.inputs,
      })),
    },
  ]
  return (
    <section aria-label="Детали расчёта" className="min-w-0 rounded-lg border border-line bg-card">
      <Tabs defaultValue="capex" className="gap-0">
        <div className="flex flex-wrap items-center gap-x-6 border-b border-line px-4">
          <h2 className="py-3 text-[14px] font-semibold">Детали расчёта</h2>
          <div className="max-w-full overflow-x-auto">
            <TabsList variant="line" aria-label="Разделы расчёта" className="gap-4 p-0 group-data-horizontal/tabs:h-10">
              {[...sections, { key: 'comparison', label: 'Сравнение' }].map((section) => (
                <TabsTrigger
                  key={section.key}
                  value={section.key}
                  className="flex-none rounded-none border-x-0 border-t-0 border-b-2 px-0 text-[12px] after:hidden data-[state=active]:border-b-ink data-[state=active]:text-ink"
                >
                  {section.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>
        {sections.map((section) => {
          const rows: CostRow[] = section.rows.map((item) =>
            'amount_rub' in item
              ? {
                  key: item.key,
                  name: item.name,
                  amount: item.amount_rub,
                  formula: item.formula,
                  formulaRendered: item.formula_rendered,
                  inputs: item.inputs,
                  note: item.note,
                  normKey: item.norm_key,
                }
              : item,
          )
          return (
            <TabsContent key={section.key} value={section.key} className="min-w-0" aria-busy={pending}>
              <p className="px-4 pt-3 pb-2 text-[11px] text-ink-3">
                Нажмите строку, чтобы открыть формулу и исходные значения.
              </p>
              <div className="overflow-x-auto px-2 pb-2 text-[12px] [&_table]:text-[12px] [&_table]:min-w-[260px]">
                <CostTable rows={rows} total={section.total} unitSuffix={section.key === 'capex' ? '' : ' / год'} />
              </div>
            </TabsContent>
          )
        })}
        <TabsContent value="comparison" className="min-w-0">
          <p className="px-4 py-3 text-[11px] leading-relaxed text-ink-3">
            Подготовленные сценарии после проверки имитацией. Без пробных изменений из текущей вкладки.
          </p>
          <Table aria-label="Сравнение способов внедрения" className="text-[12px]">
            <TableHeader className="bg-surface-2">
              <TableRow>
                <TableHead className="pl-4 text-[11px]">Вариант</TableHead>
                <TableHead className="text-right text-[11px]">Вложения на старте</TableHead>
                <TableHead className="text-right text-[11px]">Эффект в год</TableHead>
                <TableHead className="pr-4 text-right text-[11px]">Окупаемость</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {demo.comparison.scenarios.map((s) => (
                <TableRow key={s.scenario_id}>
                  <TableCell className="pl-4 font-medium">{s.name}</TableCell>
                  <TableCell className="num text-right">
                    {formatRub(s.metrics.owner_upfront_rub ?? s.metrics.capex_rub)}
                  </TableCell>
                  <TableCell className="num text-right">
                    {s.kind === 'baseline' ? '—' : formatRub(s.metrics.effect_rub_year)}
                  </TableCell>
                  <TableCell className="num pr-4 text-right">
                    {s.kind === 'baseline' ? '—' : formatYears(s.metrics.payback_years)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </section>
  )
}

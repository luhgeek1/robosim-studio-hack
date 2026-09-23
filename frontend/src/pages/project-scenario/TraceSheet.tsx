import { ChevronRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Formula } from '@/entities/provenance'
import { TRACE_SECTION_LABEL, useTrace } from '@/entities/scenario'
import type { TraceItem } from '@/shared/api/types'
import { formatValue } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Input } from '@/shared/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { ToneBadge } from '@/shared/ui/tone'

const SECTION_ORDER: NonNullable<TraceItem['section']>[] = [
  'demand',
  'sizing',
  'capex',
  'opex',
  'baseline',
  'effect',
  'cashflow',
  'metrics',
]

export function TraceSheet({
  calculationId,
  open,
  onOpenChange,
  query,
  onQueryChange,
}: {
  calculationId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  query: string
  onQueryChange: (query: string) => void
}) {
  const trace = useTrace(calculationId, open)
  const [expanded, setExpanded] = useState<string | null>(null)

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const items = (trace.data?.items ?? []).filter(
      (item) =>
        !needle ||
        item.metric_key.toLowerCase().includes(needle) ||
        item.name.toLowerCase().includes(needle) ||
        item.formula.toLowerCase().includes(needle),
    )
    return SECTION_ORDER.map((section) => ({
      section,
      items: items.filter((item) => (item.section ?? 'metrics') === section),
    })).filter((group) => group.items.length > 0)
  }, [trace.data, query])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 data-[side=right]:w-[720px] data-[side=right]:sm:max-w-[min(720px,90vw)]">
        <SheetHeader className="border-b">
          <SheetTitle>Трасса расчёта</SheetTitle>
          <SheetDescription>
            Каждая метрика → формула → подставленные значения → входы с источниками. Нажмите на зависимость, чтобы
            перейти к ней.
          </SheetDescription>
          {trace.data && (
            <div className="flex flex-wrap gap-2 pt-1">
              <ToneBadge tone={trace.data.undocumented_constants ? 'crit' : 'ok'}>
                недокументированных констант: {trace.data.undocumented_constants ?? 0}
              </ToneBadge>
              <ToneBadge tone="muted">шагов: {trace.data.items.length}</ToneBadge>
            </div>
          )}
          <div className="relative pt-2">
            <Search className="absolute top-1/2 left-2.5 mt-1 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Поиск по названию, ключу или формуле"
              className="pl-8"
            />
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {trace.isPending && <LoadingBlock rows={6} />}
          {trace.isError && <ErrorBlock error={trace.error} />}
          {grouped.map(({ section, items }) => (
            <div key={section} className="mb-4">
              <div className="mb-1 text-xs font-medium text-muted-foreground">{TRACE_SECTION_LABEL[section]}</div>
              <div className="divide-y rounded-lg border">
                {items.map((item) => {
                  const isOpen = expanded === item.metric_key
                  return (
                    <div key={item.metric_key}>
                      <button
                        type="button"
                        className={cn(
                          'flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-raised/60',
                          isOpen && 'bg-raised/60',
                        )}
                        onClick={() => setExpanded(isOpen ? null : item.metric_key)}
                      >
                        <ChevronRight
                          className={cn(
                            'size-3.5 shrink-0 text-muted-foreground transition-transform',
                            isOpen && 'rotate-90',
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{item.name}</span>
                          <span className="block truncate font-mono text-[11px] text-muted-foreground">
                            {item.metric_key}
                          </span>
                        </span>
                        <span className="num shrink-0 font-medium">{formatValue(item.value, item.unit)}</span>
                      </button>
                      {isOpen && (
                        <div className="space-y-2 px-3 pb-3">
                          <Formula formula={item.formula} rendered={item.formula_rendered} inputs={item.inputs} />
                          {item.depends_on.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 text-xs">
                              <span className="text-muted-foreground">Зависит от:</span>
                              {item.depends_on.map((key) => (
                                <button
                                  key={key}
                                  type="button"
                                  className="rounded bg-raised px-1.5 py-0.5 font-mono text-[11px] hover:bg-accent"
                                  onClick={() => {
                                    onQueryChange(key)
                                    setExpanded(key)
                                  }}
                                >
                                  {key}
                                </button>
                              ))}
                            </div>
                          )}
                          {item.norm_keys && item.norm_keys.length > 0 && (
                            <div className="text-xs text-muted-foreground">
                              Нормативы: <span className="font-mono">{item.norm_keys.join(', ')}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}

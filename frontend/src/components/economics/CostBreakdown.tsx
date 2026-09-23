import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { CalculationRun, CostBreakdown as Breakdown, CostItem } from '@/api/types'
import { formatRub, formatValue } from '@/lib/format'
import { SOURCE_KIND_LABEL } from '@/lib/labels'
import { Formula } from '../Provenance'
import { Skeleton } from '../States'
import { Disclosure } from '../ui'

// ТЗ 3.5.2 and 3.5.8: each CAPEX and OPEX line opens into its formula, substituted values and input sources.
export function CostBreakdown({ calc, isBaseline }: { calc: CalculationRun | undefined; isBaseline: boolean }) {
  if (!calc) {
    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Skeleton className="h-[260px]" />
        <Skeleton className="h-[260px]" />
      </div>
    )
  }
  const assumptions = calc.assumptions_used ?? []
  return (
    <>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card title="Из чего складывается CAPEX" breakdown={calc.capex} empty="Вложений нет: процесс остаётся ручным" />
        {isBaseline ? (
          <Card title="Расходы в год сейчас" meta="ФОТ с начислениями" breakdown={calc.baseline_cost_year} />
        ) : (
          <Card
            title="Расходы в год после внедрения"
            meta="обслуживание и эксплуатация роботов"
            breakdown={calc.opex_year}
          />
        )}
      </div>
      {assumptions.length > 0 && (
        <div className="mt-4">
          <Disclosure label={`Нормативы и допущения этого расчёта · ${assumptions.length}`}>
            <ul className="scroll-thin card max-h-[360px] divide-y divide-line overflow-y-auto px-5">
              {assumptions.map((n) => (
                <li key={n.key} className="flex items-baseline justify-between gap-4 py-2 text-[13px]">
                  <span className="min-w-0">
                    <span className="block text-ink">{n.name}</span>
                    <span className="block text-[12px] text-ink-4">
                      {SOURCE_KIND_LABEL[n.source.kind]}: {n.source.title}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block font-medium">{formatValue(n.value, n.unit)}</span>
                    {n.range && (
                      <span className="num block text-[12px] text-ink-4">
                        диапазон {formatValue(n.range.min)}–{formatValue(n.range.max)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Disclosure>
        </div>
      )}
    </>
  )
}

function Card({
  title,
  meta,
  breakdown,
  empty,
}: {
  title: string
  meta?: string
  breakdown: Breakdown
  empty?: string
}) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="h3">{title}</div>
        {meta && <span className="meta text-right">{meta}</span>}
      </div>
      {breakdown.items.length === 0 ? (
        <p className="py-2 text-[13.5px] text-ink-3">{empty ?? 'Статей нет'}</p>
      ) : (
        <ul className="divide-y divide-line">
          {breakdown.items.map((item) => (
            <CostRow
              key={item.key}
              item={item}
              open={open === item.key}
              onToggle={() => setOpen(open === item.key ? null : item.key)}
            />
          ))}
          <li className="flex items-center justify-between py-1.5 pl-5 text-[13.5px] font-semibold">
            <span>Итого</span>
            <span className="num">{formatRub(breakdown.total_rub)}</span>
          </li>
        </ul>
      )}
    </div>
  )
}

function CostRow({ item, open, onToggle }: { item: CostItem; open: boolean; onToggle: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 py-1.5 text-left text-[13.5px] hover:text-ink"
      >
        <ChevronRight size={14} className={`shrink-0 text-ink-4 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="min-w-0 flex-1 truncate text-ink-2" title={item.name}>
          {item.name}
        </span>
        <span className="num shrink-0">{formatRub(item.amount_rub)}</span>
      </button>
      {open && (
        <div className="pt-1 pb-3 pl-5">
          <Formula formula={item.formula} rendered={item.formula_rendered} inputs={item.inputs} note={item.note} />
          {item.norm_key && (
            <p className="mt-2 text-[12px] text-ink-3">
              Норматив можно заменить своим значением с причиной — кнопка «Настроить сценарий».
            </p>
          )}
        </div>
      )}
    </li>
  )
}

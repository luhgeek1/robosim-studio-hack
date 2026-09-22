import { ProvenanceBadge } from '@/entities/provenance'
import type { SensitivityResult } from '@/shared/api/types'
import { formatNumber, formatPct, isNum } from '@/shared/lib/format'
import { ToneBadge } from '@/shared/ui/tone'
import { METRIC, type Metric } from './metrics'

type Item = SensitivityResult['items'][number]

const KIND_LABEL: Record<NonNullable<Item['kind']>, string> = {
  param: 'параметр',
  norm: 'норматив',
  catalog: 'каталог',
  group: 'группа',
}

const LOW_COLOR = 'var(--chart-1)'
const HIGH_COLOR = 'var(--chart-3)'
// Leaves room for the value labels outside the bar ends.
const PAD_SHARE = 0.22

function rangeText(item: Item): string {
  const base = item.base_input
  const relative = item.kind === 'group' || item.kind === 'catalog' || (!item.unit && base === 1)
  if (relative && isNum(base) && base !== 0) {
    const pct = (v: number) => {
      const delta = (v / base - 1) * 100
      return `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${formatPct(Math.abs(delta), { digits: 0 })}`
    }
    return `${pct(item.low_input)} / ${pct(item.high_input)} от текущего`
  }
  const unit = item.unit ? ` ${item.unit}` : ''
  const baseText = isNum(base) ? ` (сейчас ${formatNumber(base)})` : ''
  return `${formatNumber(item.low_input)} … ${formatNumber(item.high_input)}${unit}${baseText}`
}

export function Tornado({ result, metric }: { result: SensitivityResult; metric: Metric }) {
  const items = [...result.items].sort((a, b) => a.rank - b.rank)
  const fmt = METRIC[metric].format
  const values = [result.base_value, ...items.flatMap((i) => [i.metric_at_low, i.metric_at_high])].filter(isNum)
  const hasNull = items.some((i) => i.metric_at_low === null || i.metric_at_high === null)
  let min = Math.min(...values)
  let max = Math.max(...values)
  // A null metric means "does not pay back in the horizon": draw it to the far edge instead of hiding it.
  const nullEdge = max + (max - min || Math.abs(max) || 1) * 0.25
  if (hasNull) max = nullEdge
  const span = max - min || Math.abs(max) || 1
  min -= span * PAD_SHARE
  max += span * PAD_SHARE
  const pos = (v: number | null) => ((isNum(v) ? v : nullEdge) - min) / (max - min)
  const basePos = pos(result.base_value)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: LOW_COLOR }} />
          нижняя граница параметра
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: HIGH_COLOR }} />
          верхняя граница параметра
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-0.5 bg-foreground" />
          базовое значение
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,19rem)_1fr] gap-x-4">
        <div />
        <div className="relative h-6">
          <div
            className="num absolute bottom-1 -translate-x-1/2 rounded bg-foreground px-1.5 text-xs whitespace-nowrap text-background"
            style={{ left: `${basePos * 100}%` }}
          >
            база: {fmt(result.base_value)}
          </div>
        </div>

        {items.map((item) => (
          <TornadoRow key={item.key} item={item} pos={pos} basePos={basePos} fmt={fmt} />
        ))}
      </div>
    </div>
  )
}

function TornadoRow({
  item,
  pos,
  basePos,
  fmt,
}: {
  item: Item
  pos: (v: number | null) => number
  basePos: number
  fmt: (v: number | null | undefined) => string
}) {
  return (
    <>
      <div className="min-w-0 border-t py-2">
        <div className="text-sm leading-snug font-medium">{item.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {item.kind && <ToneBadge tone="muted">{KIND_LABEL[item.kind]}</ToneBadge>}
          <ProvenanceBadge status={item.provenance_status} />
          <span className="num">{rangeText(item)}</span>
        </div>
      </div>
      <div className="relative border-t">
        <div className="absolute inset-y-0 w-px bg-foreground/70" style={{ left: `${basePos * 100}%` }} />
        <div className="flex h-full flex-col justify-center gap-1 py-2">
          <Bar value={item.metric_at_low} color={LOW_COLOR} pos={pos} basePos={basePos} fmt={fmt} />
          <Bar value={item.metric_at_high} color={HIGH_COLOR} pos={pos} basePos={basePos} fmt={fmt} />
        </div>
      </div>
    </>
  )
}

function Bar({
  value,
  color,
  pos,
  basePos,
  fmt,
}: {
  value: number | null
  color: string
  pos: (v: number | null) => number
  basePos: number
  fmt: (v: number | null | undefined) => string
}) {
  const end = pos(value)
  const left = Math.min(basePos, end)
  const width = Math.abs(end - basePos)
  const toRight = end >= basePos
  return (
    <div className="relative h-3">
      <div
        className="absolute inset-y-0"
        style={{
          left: `${left * 100}%`,
          width: `max(${width * 100}%, 2px)`,
          background: color,
          borderRadius: toRight ? '0 4px 4px 0' : '4px 0 0 4px',
          opacity: value === null ? 0.45 : 1,
        }}
      />
      <span
        className="num absolute top-1/2 -translate-y-1/2 text-xs whitespace-nowrap"
        style={toRight ? { left: `calc(${end * 100}% + 4px)` } : { right: `calc(${(1 - end) * 100}% + 4px)` }}
      >
        {fmt(value)}
      </span>
    </div>
  )
}

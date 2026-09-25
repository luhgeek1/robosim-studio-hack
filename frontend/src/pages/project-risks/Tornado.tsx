import { motion } from 'framer-motion'
import { ProvenanceBadge } from '@/entities/provenance'
import type { SensitivityResult } from '@/shared/api/types'
import { formatNumber, formatPct, isNum } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { METRIC, type Metric } from './metrics'

type Item = SensitivityResult['items'][number]
type Fmt = (v: number | null | undefined) => string

const KIND_LABEL: Record<NonNullable<Item['kind']>, string> = {
  param: 'параметр объекта',
  norm: 'норматив',
  catalog: 'цена из каталога',
  group: 'группа параметров',
}

// Место по краям шкалы под подписи значений у концов полос.
const PAD_SHARE = 0.2
const SPRING = { type: 'spring', stiffness: 150, damping: 24 } as const

// Группы и цена из каталога сдвигаются множителем — их вход понятнее в процентах от текущего.
const isRelative = (item: Item) =>
  item.kind === 'group' || item.kind === 'catalog' || (!item.unit && item.base_input === 1)

function inputText(item: Item, v: number): string {
  const base = item.base_input
  if (isRelative(item) && isNum(base) && base !== 0) {
    const delta = Math.round((v / base - 1) * 100)
    return delta === 0 ? 'как сейчас' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} %`
  }
  // Доли читаются как проценты: 0,85 доли — это 85 %.
  if (item.unit?.startsWith('доля')) return `${formatPct(v, { share: true, digits: 0 })}${item.unit.slice(4)}`
  return item.unit ? `${formatNumber(v)} ${item.unit}` : formatNumber(v)
}

// «Срок окупаемости» внутри фразы — со строчной, аббревиатуры (NPV, ROI, TCO) остаются как есть.
const inSentence = (label: string) =>
  label[1] && label[1] === label[1].toLowerCase() ? label[0].toLowerCase() + label.slice(1) : label

/* Торнадо одной полосой на параметр: полоса — весь диапазон метрики при сдвиге параметра, часть лучше базы
   зелёная, хуже — красная; у концов значение и вход, который его даёт. Справа — разброс, по нему и порядок. */
export function Tornado({ result, metric }: { result: SensitivityResult; metric: Metric }) {
  const items = [...result.items].sort((a, b) => a.rank - b.rank)
  const { format: fmt, better, label } = METRIC[metric]
  const base = result.base_value
  const values = [base, ...items.flatMap((i) => [i.metric_at_low, i.metric_at_high])].filter(isNum)
  const hasNull = items.some((i) => i.metric_at_low === null || i.metric_at_high === null)
  let min = Math.min(...values)
  let max = Math.max(...values)
  // Пустое значение — «не окупается в горизонте»: рисуем его у дальнего края, а не прячем.
  const nullEdge = max + (max - min || Math.abs(max) || 1) * 0.2
  if (hasNull) max = nullEdge
  const span = max - min || Math.abs(max) || 1
  min -= span * PAD_SHARE
  max += span * PAD_SHARE
  const pos = (v: number | null) => ((isNum(v) ? v : nullEdge) - min) / (max - min)
  const basePos = pos(base)
  const zeroPos = min < 0 && max > 0 && base !== 0 ? pos(0) : null
  const isBetter = (v: number | null) => isNum(v) && (better === 'lower' ? v < base : v > base)

  const top = items[0]
  const topRange = top ? [top.metric_at_low, top.metric_at_high].filter(isNum).sort((a, b) => a - b) : []

  return (
    <div>
      {top && topRange.length > 0 && (
        <p className="max-w-[72ch] text-[15px] leading-relaxed text-ink-2">
          Сильнее всего {inSentence(label)} зависит от параметра{' '}
          <span className="font-medium text-ink">«{top.name}»</span>: в его диапазоне —{' '}
          {topRange.length === 2 ? (
            <>
              от <span className="num font-medium text-ink">{fmt(topRange[0])}</span> до{' '}
              <span className="num font-medium text-ink">{fmt(topRange[1])}</span>
            </>
          ) : (
            <span className="num font-medium text-ink">{fmt(topRange[0])}</span>
          )}{' '}
          при базе <span className="num font-medium text-ink">{fmt(base)}</span>.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px] text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full bg-ok" /> лучше базы
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full bg-crit" /> хуже базы
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-px bg-ink" /> база
        </span>
        {zeroPos !== null && (
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-0 border-l border-dashed border-ink-3" /> ноль
          </span>
        )}
      </div>

      <div className="mt-5 grid grid-cols-[1.5rem_minmax(0,16rem)_minmax(0,1fr)_6.5rem] gap-x-4">
        <div className="col-span-2" />
        <div className="relative h-8">
          <span
            className="num absolute bottom-2 -translate-x-1/2 rounded-full bg-ink px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap text-white transition-[left] duration-300"
            style={{ left: `${basePos * 100}%` }}
          >
            база {fmt(base)}
          </span>
        </div>
        <div className="flex items-end justify-end pb-2 text-[12px] text-ink-3">разброс</div>

        {items.map((item, i) => (
          <Row
            key={item.key}
            index={i + 1}
            item={item}
            pos={pos}
            basePos={basePos}
            zeroPos={zeroPos}
            isBetter={isBetter}
            fmt={fmt}
            swing={fmt(item.swing)}
            share={items[0].swing ? item.swing / items[0].swing : 0}
          />
        ))}
      </div>
    </div>
  )
}

function Row({
  index,
  item,
  pos,
  basePos,
  zeroPos,
  isBetter,
  fmt,
  swing,
  share,
}: {
  index: number
  item: Item
  pos: (v: number | null) => number
  basePos: number
  zeroPos: number | null
  isBetter: (v: number | null) => boolean
  fmt: Fmt
  swing: string
  share: number
}) {
  // Концы полосы — метрика на нижней и верхней границе параметра, слева меньшая.
  const ends = [
    { value: item.metric_at_low, input: item.low_input },
    { value: item.metric_at_high, input: item.high_input },
  ].sort((a, b) => pos(a.value) - pos(b.value))
  const [left, right] = ends

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="group col-span-4 grid grid-cols-subgrid items-center rounded-xl py-3 transition-colors hover:bg-black/2.5">
          <span className="num pl-2 text-[12.5px] text-ink-4">{index}</span>
          <div className="min-w-0">
            <div className="truncate text-[13.5px] leading-snug font-medium" title={item.name}>
              {item.name}
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[12px] text-ink-3">
              <ProvenanceBadge status={item.provenance_status} />
              <span className="num truncate">
                {inputText(item, item.low_input)} … {inputText(item, item.high_input)}
              </span>
            </div>
          </div>

          <div className="relative h-11">
            <span className="absolute inset-y-[-12px] w-px bg-ink" style={{ left: `${basePos * 100}%` }} />
            {zeroPos !== null && (
              <span
                className="absolute inset-y-[-12px] w-0 border-l border-dashed border-ink-4"
                style={{ left: `${zeroPos * 100}%` }}
              />
            )}
            <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
            <Segment from={basePos} to={pos(left.value)} good={isBetter(left.value)} open={left.value === null} />
            <Segment from={basePos} to={pos(right.value)} good={isBetter(right.value)} open={right.value === null} />
            <EndLabel
              side="left"
              at={pos(left.value)}
              value={left.value}
              input={inputText(item, left.input)}
              fmt={fmt}
            />
            <EndLabel
              side="right"
              at={pos(right.value)}
              value={right.value}
              input={inputText(item, right.input)}
              fmt={fmt}
            />
          </div>

          <div className="pr-2 text-right">
            <div className="num text-[13.5px] font-semibold tracking-[-0.01em]">{swing}</div>
            <div className="mt-1 ml-auto h-1 w-16 overflow-hidden rounded-full bg-black/6">
              <motion.div
                className="h-full rounded-full bg-ink"
                initial={false}
                animate={{ width: `${Math.max(4, share * 100)}%` }}
                transition={SPRING}
              />
            </div>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-sm space-y-1 text-left">
        <div className="font-medium">{item.name}</div>
        {item.kind && <div className="opacity-80">{KIND_LABEL[item.kind]}</div>}
        {isNum(item.base_input) && <div>Сейчас: {inputText(item, item.base_input)}</div>}
        <div>
          При {inputText(item, item.low_input)} — {fmt(item.metric_at_low)}, при {inputText(item, item.high_input)} —{' '}
          {fmt(item.metric_at_high)}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

/* Отрезок от базы до конца: зелёный, если там лучше базы, красный — если хуже. */
function Segment({ from, to, good, open }: { from: number; to: number; good: boolean; open: boolean }) {
  const left = Math.min(from, to)
  const width = Math.abs(to - from)
  if (width === 0) return null
  const toRight = to > from
  return (
    <motion.span
      className={cn('absolute top-1/2 h-2.5 -translate-y-1/2', good ? 'bg-ok' : 'bg-crit')}
      style={{
        borderRadius: toRight ? '0 999px 999px 0' : '999px 0 0 999px',
        // «Не окупается»: полоса уходит за край шкалы и растворяется.
        maskImage: open ? `linear-gradient(to ${toRight ? 'right' : 'left'}, #000 60%, transparent)` : undefined,
      }}
      initial={false}
      animate={{ left: `${left * 100}%`, width: `max(${width * 100}%, 3px)` }}
      transition={SPRING}
    />
  )
}

function EndLabel({
  side,
  at,
  value,
  input,
  fmt,
}: {
  side: 'left' | 'right'
  at: number
  value: number | null
  input: string
  fmt: Fmt
}) {
  return (
    <motion.span
      className={cn(
        'absolute top-1/2 -translate-y-1/2 leading-tight whitespace-nowrap',
        side === 'left' ? 'pr-2.5 text-right' : 'pl-2.5',
      )}
      initial={false}
      animate={side === 'left' ? { right: `${(1 - at) * 100}%` } : { left: `${at * 100}%` }}
      transition={SPRING}
    >
      <span className={cn('num block text-[12.5px] font-medium', value === null ? 'text-crit' : 'text-ink')}>
        {value === null ? 'не окупается' : fmt(value)}
      </span>
      <span className="num block text-[11px] text-ink-3">при {input}</span>
    </motion.span>
  )
}

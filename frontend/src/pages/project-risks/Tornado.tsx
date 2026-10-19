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

// Небольшой запас по краям шкалы, чтобы крайние точки не упирались в границу графика.
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

/* Торнадо одной полосой на параметр: часть лучше базы зелёная, хуже — красная. Точки отмечают результаты
   на границах параметра; значения и входы стоят под полосой. Справа — разброс, по нему и порядок. */
export function Tornado({ result, metric }: { result: SensitivityResult; metric: Metric }) {
  const items = [...result.items].sort((a, b) => a.rank - b.rank)
  const { format: fmt, better } = METRIC[metric]
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
  const topRange = top ? [top.metric_at_low, top.metric_at_high].sort((a, b) => pos(a) - pos(b)) : []
  const [rangeLow, rangeHigh] = topRange
  const sharedUnit = (metric === 'payback_years' || metric === 'roi_pct') && isNum(rangeLow) && isNum(rangeHigh)

  return (
    <div>
      {top && (
        <div
          role="note"
          aria-label="Краткий вывод по чувствительности"
          className="grid items-center gap-x-8 gap-y-4 pt-1 lg:grid-cols-[minmax(0,1fr)_auto]"
        >
          <div className="min-w-0 border-l-2 border-signal/70 pl-3">
            <p className="text-[11px] text-ink-3">Сильнее всего влияет</p>
            <p className="mt-1.5 text-[15px] leading-snug font-medium wrap-anywhere sm:text-[16px]">{top.name}</p>
          </div>
          <dl className="grid w-full min-w-0 max-w-96 grid-cols-[minmax(0,3fr)_minmax(0,4fr)] items-start justify-self-end gap-x-4 sm:gap-x-6 lg:w-96">
            <div className="min-w-0 text-right">
              <dt className="text-[12px] text-ink-3">База</dt>
              <dd className="num mt-1 min-w-0 text-[18px] leading-snug font-medium tracking-[-0.02em] wrap-anywhere">
                {fmt(base)}
              </dd>
            </div>
            <div className="min-w-0 text-right">
              <dt className="text-[12px] text-ink-3">Диапазон</dt>
              <dd className="num mt-1 min-w-0 text-[18px] leading-snug font-semibold tracking-[-0.02em] wrap-anywhere">
                {rangeLow === rangeHigh ? (
                  fmt(rangeLow)
                ) : (
                  <>
                    <span className="inline-block max-w-full">
                      {sharedUnit ? formatNumber(rangeLow, 1) : fmt(rangeLow)}
                    </span>
                    <span className="inline-block max-w-full">
                      <span aria-hidden className="mx-1 font-normal text-ink-4">
                        –
                      </span>
                      <span className="sr-only"> до </span>
                      {fmt(rangeHigh)}
                    </span>
                  </>
                )}
              </dd>
            </div>
          </dl>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full bg-ok" /> лучше базы
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full bg-crit" /> хуже базы
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

      {/* Подписи отделены от полосы на любой ширине: близкие результаты и длинные суммы не накладываются. */}
      <div className="mt-5 grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2 lg:grid-cols-[1.5rem_minmax(0,16rem)_minmax(0,1fr)_6.5rem] lg:gap-x-4">
        <div className="hidden lg:col-span-2 lg:block" />
        <div className="relative col-span-2 flex min-w-0 justify-center pb-2 lg:col-span-1 lg:block lg:h-8 lg:pb-0">
          <span
            className="num max-w-full rounded-full bg-ink px-2.5 py-0.5 text-center text-[12px] font-medium wrap-anywhere text-white lg:absolute lg:bottom-2 lg:-translate-x-1/2 lg:whitespace-nowrap lg:transition-[left] lg:duration-300"
            style={{ left: `${basePos * 100}%` }}
          >
            база {fmt(base)}
          </span>
        </div>
        <div className="hidden items-end justify-end pb-2 text-[12px] text-ink-3 lg:flex">разброс</div>

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
        <div
          role="group"
          aria-label={item.name}
          className="group col-span-2 grid grid-cols-subgrid items-center gap-y-2 border-b border-line/60 py-4 transition-colors last:border-b-0 hover:bg-black/2.5 lg:col-span-4 lg:gap-y-0 lg:rounded-xl lg:border-b-0 lg:py-3"
        >
          <span
            aria-hidden="true"
            className="num row-start-1 self-start pt-0.5 pl-1 text-[12.5px] text-ink-4 lg:row-auto lg:self-center lg:pt-0 lg:pl-2"
          >
            {index}
          </span>
          <div className="row-start-1 min-w-0 lg:row-auto">
            <div className="text-[13.5px] leading-snug font-medium wrap-anywhere lg:truncate" title={item.name}>
              {item.name}
            </div>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ink-3 lg:flex-nowrap">
              <ProvenanceBadge status={item.provenance_status} />
              <span className="num min-w-0 wrap-anywhere lg:truncate">
                {inputText(item, item.low_input)} … {inputText(item, item.high_input)}
              </span>
            </div>
          </div>

          <div className="relative col-span-2 row-start-2 min-w-0 lg:col-auto lg:row-auto">
            <div aria-hidden="true" className="relative h-7">
              <span className="absolute inset-y-0 w-px bg-ink" style={{ left: `${basePos * 100}%` }} />
              {zeroPos !== null && (
                <span
                  className="absolute inset-y-0 w-0 border-l border-dashed border-ink-4"
                  style={{ left: `${zeroPos * 100}%` }}
                />
              )}
              <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
              <Segment from={basePos} to={pos(left.value)} good={isBetter(left.value)} open={left.value === null} />
              <Segment from={basePos} to={pos(right.value)} good={isBetter(right.value)} open={right.value === null} />
              {ends.map((end, i) =>
                end.value !== null ? (
                  <motion.span
                    key={i}
                    className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-2 ring-surface"
                    initial={false}
                    animate={{ left: `${pos(end.value) * 100}%` }}
                    transition={SPRING}
                  />
                ) : null,
              )}
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-4">
              <EndLabel side="left" value={left.value} input={inputText(item, left.input)} fmt={fmt} />
              <EndLabel side="right" value={right.value} input={inputText(item, right.input)} fmt={fmt} />
            </div>
          </div>

          <div className="col-span-2 row-start-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 lg:col-auto lg:row-auto lg:block lg:pr-2 lg:text-right">
            <div className="text-[11px] text-ink-3 lg:hidden">разброс</div>
            <div className="num text-[12px] font-semibold tracking-[-0.01em] wrap-anywhere lg:text-[13.5px]">
              {swing}
            </div>
            <div
              aria-hidden="true"
              className="ml-auto h-1 w-16 shrink-0 overflow-hidden rounded-full bg-black/6 lg:mt-1"
            >
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
  value,
  input,
  fmt,
}: {
  side: 'left' | 'right'
  value: number | null
  input: string
  fmt: Fmt
}) {
  return (
    <span className={cn('block min-w-0 leading-snug wrap-anywhere', side === 'left' ? 'text-left' : 'text-right')}>
      <span className={cn('num block text-[12.5px] font-medium', value === null ? 'text-crit' : 'text-ink')}>
        {value === null ? 'не окупается' : fmt(value)}
      </span>
      <span className="num block text-[11px] text-ink-3">при {input}</span>
    </span>
  )
}

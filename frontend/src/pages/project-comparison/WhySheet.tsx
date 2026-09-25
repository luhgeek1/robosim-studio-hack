import { motion } from 'framer-motion'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router'
import { BAND_LABEL, VERDICT_LABEL, VERDICT_TONE } from '@/entities/scenario'
import type { ComparisonTable } from '@/shared/api/types'
import { formatMln, formatPct, formatRub, formatYears, isNum } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/shared/ui/sheet'

type Scenario = ComparisonTable['scenarios'][number]

// Как на обзоре проекта: вердикт — точка в палитре сайта, «обоснованно» чернилами, а не синим акцентом.
const VERDICT_DOT = { ok: 'bg-ok', info: 'bg-ink', warn: 'bg-warn', crit: 'bg-crit', muted: 'bg-ink-4' } as const

/* Почему рекомендован вариант: три цифры, когда вернутся вложения, как он выглядит рядом с остальными,
   что определяет результат и оговорки — всё из того же ответа сравнения, без новых расчётов. */
export function WhySheet({
  table,
  open,
  onOpenChange,
}: {
  table: ComparisonTable
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { verdict, recommendation } = table
  const best = table.scenarios.find((s) => s.scenario_id === recommendation?.scenario_id)
  if (!best || best.kind === 'baseline') return null

  const m = best.metrics
  const robotized = table.scenarios.filter((s) => s.kind !== 'baseline')
  const saving = (s: Scenario) =>
    isNum(s.metrics.tco_baseline_rub) && isNum(s.metrics.tco_rub)
      ? s.metrics.tco_baseline_rub - s.metrics.tco_rub
      : null
  const caveats = [...(verdict.caveats ?? []), ...(recommendation?.caveats ?? [])]
  const band = BAND_LABEL[verdict.band]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 bg-canvas data-[side=right]:w-[600px] data-[side=right]:sm:max-w-[min(600px,94vw)]">
        <div className="scroll-thin flex-1 overflow-y-auto px-7 pt-7 pb-8">
          <p className="text-[13px] text-ink-3">Почему рекомендуем</p>
          <SheetTitle className="h2 mt-1.5 pr-8 text-[26px] leading-[1.15]">{best.name}</SheetTitle>
          <SheetDescription className="mt-2.5 flex items-center gap-2 text-[13.5px] text-ink-2">
            <span className={cn('size-1.5 rounded-full', VERDICT_DOT[VERDICT_TONE[verdict.verdict]])} />
            <span className="font-medium text-ink">{VERDICT_LABEL[verdict.verdict]}</span>
            {band && <span className="text-ink-3">{band}</span>}
          </SheetDescription>

          <dl className="mt-6 grid grid-cols-3 divide-x divide-line rounded-2xl bg-card ring-1 ring-line">
            <Figure value={formatRub(m.npv_rub)} label="NPV" note="лучший среди окупаемых" />
            <Figure
              value={isNum(m.payback_years) ? formatYears(m.payback_years) : '—'}
              label="окупаемость"
              note={`ROI ${formatPct(m.roi_pct, { digits: 0 })}`}
            />
            <Figure
              value={formatRub(saving(best))}
              label={`экономия за ${m.horizon_years} лет`}
              note="против «как сейчас»"
            />
          </dl>

          <Block title="Когда вернутся вложения">
            <Payback table={table} scenario={best} />
          </Block>

          {robotized.length > 1 && (
            <Block title="Рядом с другими вариантами">
              <div className="space-y-5 rounded-2xl bg-card px-5 py-4 ring-1 ring-line">
                <Bars
                  title="NPV"
                  scenarios={robotized}
                  bestId={best.scenario_id}
                  value={(s) => s.metrics.npv_rub ?? null}
                />
                <Bars
                  title={`Экономия за ${m.horizon_years} лет против «как сейчас»`}
                  scenarios={robotized}
                  bestId={best.scenario_id}
                  value={saving}
                />
              </div>
            </Block>
          )}

          {!!verdict.key_drivers?.length && (
            <Block title="Что определяет результат">
              <ol className="space-y-2.5">
                {verdict.key_drivers.map((d, i) => (
                  <li key={d} className="flex gap-3 text-[13.5px] leading-relaxed text-ink-2">
                    <span className="num w-4 shrink-0 pt-px text-[12.5px] text-ink-4">{i + 1}</span>
                    <span className="min-w-0">{d}</span>
                  </li>
                ))}
              </ol>
            </Block>
          )}

          {caveats.length > 0 && <Caveats items={caveats} />}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-line bg-card px-7 py-4">
          <p className="text-[12px] leading-snug text-ink-3">
            Предварительная оценка — требует верификации при обследовании объекта.
          </p>
          <Button asChild className="shrink-0 rounded-xl">
            <Link to={`../scenarios/${best.scenario_id}`}>
              Расчёт сценария <ArrowRight />
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Figure({ value, label, note }: { value: string; label: string; note: string }) {
  return (
    <div className="flex min-w-0 flex-col px-4 py-4">
      <dt className="order-2 mt-1.5 truncate text-[12.5px] text-ink-2">{label}</dt>
      <dd className="display num order-1 truncate text-[22px]">{value}</dd>
      <dd className="order-3 truncate text-[11.5px] text-ink-3">{note}</dd>
    </div>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h3 className="mb-3 text-[13px] font-medium text-ink-2">{title}</h3>
      {children}
    </section>
  )
}

/* Накопленный поток рекомендуемого варианта против «как сейчас»: ниже нуля — вложения ещё не вернулись. */
function Payback({ table, scenario }: { table: ComparisonTable; scenario: Scenario }) {
  const points = table.cashflow_overlay?.[scenario.scenario_id] ?? []
  if (points.length < 2) return <p className="text-[13px] text-ink-3">Денежный поток в расчёте не передан.</p>
  const data = points.map((p) => ({ period: p.period, value: p.cumulative_rub }))
  const horizon = scenario.metrics.horizon_years
  const last = data.at(-1)!.period
  const monthly = last > horizon
  const payback = scenario.metrics.payback_years
  const paybackAt = isNum(payback) ? (monthly ? payback * 12 : payback) : null
  const values = data.map((d) => d.value)
  const lo = Math.min(0, ...values)
  const hi = Math.max(0, ...values)
  // Градиент меняет цвет ровно на нуле: доля высоты графика, приходящаяся на положительную часть.
  const zero = hi === lo ? 0 : hi / (hi - lo)

  return (
    <div className="rounded-2xl bg-card px-3 pt-4 pb-2 ring-1 ring-line">
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="why-stroke" x1="0" y1="0" x2="0" y2="1">
                <stop offset={zero} stopColor="var(--ok)" />
                <stop offset={zero} stopColor="var(--crit)" />
              </linearGradient>
              <linearGradient id="why-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset={0} stopColor="var(--ok)" stopOpacity={0.22} />
                <stop offset={zero} stopColor="var(--ok)" stopOpacity={0.04} />
                <stop offset={zero} stopColor="var(--crit)" stopOpacity={0.04} />
                <stop offset={1} stopColor="var(--crit)" stopOpacity={0.18} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="period"
              type="number"
              domain={['dataMin', 'dataMax']}
              allowDecimals={false}
              ticks={data.map((d) => d.period).filter((v) => !monthly || v % 12 === 0)}
              tickFormatter={(v: number) => (monthly ? (v % 12 === 0 ? `${v / 12} г.` : '') : `${v} г.`)}
              tick={{ fontSize: 11.5, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => formatMln(v)}
              tick={{ fontSize: 11.5, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <ReferenceLine y={0} stroke="var(--foreground)" strokeOpacity={0.35} />
            {paybackAt !== null && (
              <ReferenceLine
                x={paybackAt}
                stroke="var(--foreground)"
                strokeDasharray="3 3"
                strokeOpacity={0.5}
                label={{
                  value: `окупается · ${formatYears(payback)}`,
                  position: 'insideTopLeft',
                  fontSize: 11.5,
                  fill: 'var(--foreground)',
                }}
              />
            )}
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                    <div className="text-ink-3">
                      {monthly ? 'Месяц' : 'Год'} {String(label)}
                    </div>
                    <div className="num mt-0.5 font-medium">
                      {formatRub(typeof payload[0].value === 'number' ? payload[0].value : null)}
                    </div>
                  </div>
                ) : null
              }
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="url(#why-stroke)"
              strokeWidth={2}
              fill="url(#why-fill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="px-2 pt-1 text-[11.5px] text-ink-3">
        Накопленный денежный поток против «как сейчас», млн ₽. Пересечение нуля — момент окупаемости.
      </p>
    </div>
  )
}

/* Горизонтальные столбики от общего нуля: отрицательный NPV уходит влево и краснеет. */
function Bars({
  title,
  scenarios,
  bestId,
  value,
}: {
  title: string
  scenarios: Scenario[]
  bestId: string
  value: (s: Scenario) => number | null
}) {
  const numbers = scenarios.map(value).filter(isNum)
  const lo = Math.min(0, ...numbers)
  const hi = Math.max(0, ...numbers)
  const span = hi - lo || 1
  const zero = (-lo / span) * 100
  return (
    <div>
      <div className="mb-2.5 text-[12.5px] text-ink-3">{title}</div>
      <ul className="space-y-2">
        {scenarios.map((s) => {
          const v = value(s)
          const best = s.scenario_id === bestId
          return (
            <li
              key={s.scenario_id}
              className="grid grid-cols-[minmax(0,11.5rem)_minmax(0,1fr)_5.5rem] items-center gap-3"
            >
              <span
                className={cn('truncate text-[12.5px]', best ? 'font-medium text-ink' : 'text-ink-2')}
                title={s.name}
              >
                {s.name}
              </span>
              <span className="relative h-2.5 overflow-hidden rounded-full bg-black/4.5">
                {lo < 0 && <span className="absolute inset-y-0 w-px bg-ink-4" style={{ left: `${zero}%` }} />}
                {isNum(v) && (
                  <motion.span
                    className={cn('absolute inset-y-0 rounded-full', v < 0 ? 'bg-crit' : best ? 'bg-ink' : 'bg-ink-4')}
                    style={{ left: `${v < 0 ? zero - (-v / span) * 100 : zero}%` }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max((Math.abs(v) / span) * 100, v !== 0 ? 1.5 : 0)}%` }}
                    transition={{ type: 'spring', stiffness: 140, damping: 24 }}
                  />
                )}
              </span>
              <span
                className={cn(
                  'num text-right text-[12.5px]',
                  isNum(v) && v < 0 ? 'text-crit' : best ? 'font-semibold text-ink' : 'text-ink-2',
                )}
              >
                {formatRub(v)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Caveats({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="mt-8">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"
      >
        Оговорки <span className="num font-normal text-ink-4">{items.length}</span>
        <ChevronDown className={cn('size-4 text-ink-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="mt-3 space-y-2">
          {items.map((c) => (
            <li key={c} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-3">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-ink-4" />
              <span className="min-w-0">{c}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

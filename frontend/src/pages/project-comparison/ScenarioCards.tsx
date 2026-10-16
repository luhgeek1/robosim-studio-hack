import { ArrowUpRight, Info } from 'lucide-react'
import { Link } from 'react-router'
import { SCENARIO_KIND_LABEL } from '@/entities/scenario'
import type { ComparisonTable } from '@/shared/api/types'
import { formatPct, formatRub, formatYears, horizonText, isNum } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

type Scenario = ComparisonTable['scenarios'][number]

/* One card per scenario: payback up top, then the saving over the horizon against «как сейчас» as a bar
   scaled to the best saving — the eye finds the winner before reading any number. */
export function ScenarioCards({ table, onExplain }: { table: ComparisonTable; onExplain: () => void }) {
  const recommendedId = table.recommendation?.scenario_id ?? null
  const saving = (s: Scenario) =>
    isNum(s.metrics.tco_baseline_rub) && isNum(s.metrics.tco_rub)
      ? s.metrics.tco_baseline_rub - s.metrics.tco_rub
      : null
  const maxSaving = Math.max(0, ...table.scenarios.map((s) => saving(s) ?? 0))

  return (
    <div className={cn('grid gap-4 md:grid-cols-2', table.scenarios.length >= 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3')}>
      {table.scenarios.map((s) =>
        s.kind === 'baseline' ? (
          <BaselineCard key={s.scenario_id} scenario={s} />
        ) : (
          <ScenarioCard
            key={s.scenario_id}
            scenario={s}
            recommended={s.scenario_id === recommendedId}
            saving={saving(s)}
            maxSaving={maxSaving}
            onExplain={onExplain}
          />
        ),
      )}
    </div>
  )
}

function ScenarioCard({
  scenario: s,
  recommended,
  saving,
  maxSaving,
  onExplain,
}: {
  scenario: Scenario
  recommended: boolean
  saving: number | null
  maxSaving: number
  onExplain: () => void
}) {
  const m = s.metrics
  const share = saving && maxSaving ? Math.max(saving, 0) / maxSaving : 0

  return (
    // Вся карточка ведёт к расчёту через растянутую ссылку в заголовке — так внутри может жить кнопка «почему».
    <div
      className={cn(
        'group card relative flex flex-col p-5 transition-shadow hover:shadow-[0_8px_28px_-14px_rgba(20,20,19,0.25)]',
        recommended && 'border-ink ring-1 ring-ink',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="meta">{SCENARIO_KIND_LABEL[s.kind]}</span>
        {recommended ? (
          <button
            type="button"
            onClick={onExplain}
            title="Почему рекомендуем этот вариант"
            className="relative z-10 flex items-center gap-1.5 rounded-full bg-ink py-0.5 pr-1 pl-2.5 text-[11.5px] font-medium text-white transition-colors hover:bg-ink-2"
          >
            Рекомендуем
            <span className="flex items-center gap-1 rounded-full bg-white/15 px-1.5 py-px">
              <Info className="size-3" /> почему
            </span>
          </button>
        ) : s.status === 'stale' ? (
          <span className="flex items-center gap-1.5 text-[12px] text-warn">
            <span className="size-1.5 rounded-full bg-warn" /> устарел
          </span>
        ) : (
          <ArrowUpRight size={16} className="text-ink-4 transition-colors group-hover:text-ink" />
        )}
      </div>
      <h3 className="h3 mt-1 line-clamp-2 min-h-[2.6em]">
        <Link to={`../scenarios/${s.scenario_id}`} className="after:absolute after:inset-0 after:rounded-[14px]">
          {s.name}
        </Link>
      </h3>

      <div className="mt-5">
        <div className={cn('display num text-[32px]', !isNum(m.payback_years) && 'text-crit')}>
          {isNum(m.payback_years) ? formatYears(m.payback_years) : 'не окупается'}
        </div>
        <div className="meta mt-1">окупаемость</div>
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
          <span className="text-ink-3">экономия за {horizonText(m.horizon_years)}</span>
          <span className={cn('num font-medium', saving !== null && saving < 0 && 'text-crit')}>
            {formatRub(saving)}
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/5">
          <div
            className={cn('h-full rounded-full', recommended ? 'bg-ink' : 'bg-ink-3')}
            style={{ width: `${share * 100}%` }}
          />
        </div>
      </div>

      <dl className="mt-5 space-y-1.5 border-t border-line pt-4">
        <Fact label="вложения" value={formatRub(m.capex_rub)} />
        <Fact label="эффект в год" value={formatRub(m.effect_rub_year)} />
        <Fact label="NPV" value={formatRub(m.npv_rub)} tone={isNum(m.npv_rub) && m.npv_rub < 0 ? 'crit' : undefined} />
      </dl>
    </div>
  )
}

function BaselineCard({ scenario: s }: { scenario: Scenario }) {
  const m = s.metrics
  return (
    <Link
      to={`../scenarios/${s.scenario_id}`}
      className="group flex flex-col rounded-[14px] border border-dashed border-line-2 bg-surface-2 p-5 transition-colors hover:border-ink-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="meta">база сравнения</span>
        <ArrowUpRight size={16} className="text-ink-4 transition-colors group-hover:text-ink" />
      </div>
      <h3 className="h3 mt-1 line-clamp-2 min-h-[2.6em]">{s.name}</h3>

      <div className="mt-5">
        <div className="display num text-[32px] text-ink-2">{formatRub(m.scenario_cost_rub_year)}</div>
        <div className="meta mt-1">затраты в год</div>
      </div>

      <p className="mt-5 text-[12.5px] leading-relaxed text-ink-3">
        Ручной труд без роботов. С ним сравниваются затраты, эффект и окупаемость каждого варианта.
      </p>

      <dl className="mt-auto space-y-1.5 border-t border-line pt-4">
        <Fact label={`TCO за ${horizonText(m.horizon_years)}`} value={formatRub(m.tco_rub)} />
        <Fact label="ставка дисконта" value={formatPct(m.discount_rate_pct)} />
      </dl>
    </Link>
  )
}

// Label and value on one line: three money figures side by side get cut off in a narrow card.
function Fact({ label, value, tone }: { label: string; value: string; tone?: 'crit' }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0 truncate text-[12.5px] text-ink-3">{label}</dt>
      <dd
        className={cn(
          'num text-[14px] font-semibold whitespace-nowrap tracking-[-0.01em]',
          tone === 'crit' && 'text-crit',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

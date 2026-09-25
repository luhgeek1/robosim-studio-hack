import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useProduct } from '@/entities/catalog'
import { useProject } from '@/entities/project'
import { VERDICT_LABEL, VERDICT_TONE, pickMainScenario, useScenarios, type Verdict } from '@/entities/scenario'
import type { MatchingResult } from '@/shared/api/types'
import { formatNumber, formatRub, formatYears, isNum, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { CardChip, RobotStage } from '@/widgets/robot-card'

type Pick = {
  key: string
  productId: string
  name: string
  processName: string
  working: number
  reserve: number
  source: string
  unitPrice?: number | null
}

const VERDICT_DOT: Record<(typeof VERDICT_TONE)[Verdict], string> = {
  ok: 'bg-ok',
  info: 'bg-ink',
  warn: 'bg-warn',
  crit: 'bg-crit',
  muted: 'bg-ink-4',
}

// Above this the fleet reads better as a number than as a row of dots.
const MAX_FLEET_DOTS = 48

const shortName = (name: string) => name.split(' (')[0]

/* The robots the assessment recommends, above the full candidate list: the same fleet as on the overview
   (the recommended scenario), or — before any scenario exists — the top fitting candidate of each process. */
export function RecommendedBlock({ projectId, matching }: { projectId: string; matching: MatchingResult }) {
  const project = useProject(projectId).data
  const scenarios = useScenarios(projectId)
  const scenario =
    scenarios.data?.find((s) => s.id === project?.recommended_scenario_id) ?? pickMainScenario(scenarios.data)
  const processName = new Map(matching.processes.map((p) => [p.process_key, shortName(p.name)]))

  const fromScenario: Pick[] =
    scenario?.items
      .filter((item) => item.product_id)
      .map((item) => {
        const result = item.count_result
        const final = result?.final ?? item.count_manual ?? 0
        const reserve = result?.reserve ?? 0
        return {
          key: item.id,
          productId: item.product_id!,
          name: shortName(item.product_name ?? 'Решение'),
          processName: processName.get(item.process_key) ?? item.process_key,
          working: final - reserve,
          reserve,
          source: !result ? 'задано вручную' : isNum(result.simulated) ? 'по имитации' : 'по расчёту цикла',
          unitPrice: item.price_override_rub ?? item.price_rub,
        }
      }) ?? []

  const fromMatching: Pick[] = matching.processes.flatMap((process) => {
    const best = process.candidates.find((c) => c.status === 'fit')
    if (!best) return []
    return [
      {
        key: `${process.process_key}-${best.product.id}`,
        productId: best.product.id,
        name: shortName(best.product.name),
        processName: shortName(process.name),
        working: best.estimate?.robots_count ?? 0,
        reserve: 0,
        source: 'оценка по циклу',
        unitPrice: best.product.price_from?.amount_rub,
      },
    ]
  })

  const picks = fromScenario.length ? fromScenario : fromMatching
  if (scenarios.isPending || picks.length === 0) return null

  const calc = fromScenario.length ? scenario?.last_calculation : null
  const verdict = calc?.verdict && calc.verdict in VERDICT_LABEL ? (calc.verdict as Verdict) : null
  const stale = calc?.status === 'stale'

  return (
    <section className="card mx-auto mb-10 max-w-[1080px] overflow-hidden">
      <ul className="divide-y divide-line">
        {picks.map((pick, i) => (
          <PickHero key={pick.key} pick={pick} first={i === 0} />
        ))}
      </ul>

      {(calc || scenario) && (
        <footer className="grid grid-cols-2 items-center gap-x-8 gap-y-5 border-t border-line bg-surface-2 px-8 py-5 md:grid-cols-[repeat(3,auto)_1fr]">
          {calc && (
            <>
              <Figure label="окупаемость" value={formatYears(calc.payback_years)}>
                {verdict && (
                  <span className="inline-flex items-center gap-1.5 text-ink-2">
                    <span className={cn('size-1.5 rounded-full', VERDICT_DOT[VERDICT_TONE[verdict]])} />
                    {VERDICT_LABEL[verdict].toLowerCase()}
                  </span>
                )}
              </Figure>
              <Figure label="вложения, с НДС" value={formatRub(calc.capex_rub)} />
              <Figure label="эффект в год" value={formatRub(calc.effect_rub_year)} />
            </>
          )}
          {scenario && fromScenario.length > 0 && (
            <Link
              to={`/projects/${projectId}/scenarios/${scenario.id}`}
              className={cn(
                'group col-span-2 inline-flex items-center gap-2 justify-self-start rounded-full px-4 py-2 text-[13px] font-medium transition-colors md:col-span-1 md:justify-self-end',
                stale ? 'bg-warn-soft text-warn hover:bg-warn-soft/70' : 'bg-ink text-white hover:bg-ink/85',
              )}
            >
              {stale && <span className="size-1.5 rounded-full bg-warn" />}
              {stale ? 'Данные изменились — пересчитать' : 'Открыть сценарий'}
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </footer>
      )}
    </section>
  )
}

function PickHero({ pick, first }: { pick: Pick; first: boolean }) {
  const product = useProduct(pick.productId).data
  const count = pick.working + pick.reserve
  const total = isNum(pick.unitPrice) && count ? pick.unitPrice * count : null

  return (
    <li className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="relative min-h-[300px] md:min-h-[380px]">
        <RobotStage productId={pick.productId} solutionType={product?.solution_type ?? ''} />
        <div className="pointer-events-none absolute top-5 left-5 flex items-center gap-1.5">
          {first && <CardChip strong>Рекомендуем</CardChip>}
          <CardChip>{pick.processName}</CardChip>
        </div>
      </div>

      <div className="flex min-w-0 flex-col px-8 py-7 md:border-l md:border-line">
        <Link
          to={`/catalog/${pick.productId}`}
          className="display self-start text-[34px] transition-colors hover:text-info"
        >
          {pick.name}
        </Link>
        <p className="mt-2 text-[14px] text-ink-3">
          {[product?.manufacturer?.name, product?.solution_type_name].filter(Boolean).join(' · ') || ' '}
        </p>

        <div className="mt-auto pt-8">
          <div className="flex items-end gap-3">
            <span className="display num text-[76px]">{formatNumber(count)}</span>
            <span className="pb-2 leading-tight">
              <span className="block text-[15px] font-semibold">{pluralRu(count, ['робот', 'робота', 'роботов'])}</span>
              <span className="meta">{pick.source}</span>
            </span>
          </div>
          <Fleet working={pick.working} reserve={pick.reserve} />
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-6 border-t border-line pt-5">
          <Fact label="за единицу" value={isNum(pick.unitPrice) ? formatRub(pick.unitPrice) : '—'} />
          <Fact label="весь парк" value={total ? formatRub(total) : '—'} />
        </dl>
      </div>
    </li>
  )
}

/* One dot per robot: filled ones work, hollow ones are the reserve. */
function Fleet({ working, reserve }: { working: number; reserve: number }) {
  if (working + reserve > MAX_FLEET_DOTS || working + reserve === 0) return null
  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-1.5" aria-hidden>
        {Array.from({ length: working }, (_, i) => (
          <span key={`w${i}`} className="size-3 rounded-full bg-ink" />
        ))}
        {Array.from({ length: reserve }, (_, i) => (
          <span key={`r${i}`} className="size-3 rounded-full ring-[1.5px] ring-ink-3 ring-inset" />
        ))}
      </div>
      {reserve > 0 && (
        <div className="meta mt-2.5 flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-ink" />
            {formatNumber(working)} в работе
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full ring-[1.5px] ring-ink-3 ring-inset" />
            {formatNumber(reserve)} в резерве
          </span>
        </div>
      )}
    </div>
  )
}

function Figure({ value, label, children }: { value: string; label: string; children?: ReactNode }) {
  return (
    <div className="min-w-0 whitespace-nowrap">
      <div className="display num text-[22px]">{value}</div>
      <div className="meta mt-1 flex items-center gap-2">
        {label}
        {children}
      </div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="meta truncate">{label}</dt>
      <dd className="num truncate text-[17px] font-semibold tracking-[-0.01em]">{value}</dd>
    </div>
  )
}

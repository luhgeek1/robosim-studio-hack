import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useProduct } from '@/entities/catalog'
import { useProject } from '@/entities/project'
import { VERDICT_LABEL, VERDICT_TONE, pickMainScenario, useScenarios, type Verdict } from '@/entities/scenario'
import type { MatchingResult } from '@/shared/api/types'
import { formatNumber, formatRub, formatYears, isNum, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { RobotPreview3D } from '@/widgets/robot-3d'

type Pick = {
  key: string
  productId: string
  name: string
  processName: string
  count: number
  countNote?: string
  unitPrice?: number | null
}

const VERDICT_DOT: Record<(typeof VERDICT_TONE)[Verdict], string> = {
  ok: 'bg-ok',
  info: 'bg-ink',
  warn: 'bg-warn',
  crit: 'bg-crit',
  muted: 'bg-ink-4',
}

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
        return {
          key: item.id,
          productId: item.product_id!,
          name: shortName(item.product_name ?? 'Решение'),
          processName: processName.get(item.process_key) ?? item.process_key,
          count: result?.final ?? item.count_manual ?? 0,
          countNote: result?.reserve
            ? `${formatNumber(isNum(result.simulated) ? result.simulated : result.analytic)} + ${formatNumber(result.reserve)} резерв`
            : undefined,
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
        count: best.estimate?.robots_count ?? 0,
        countNote: best.estimate ? 'оценка по циклу' : undefined,
        unitPrice: best.product.price_from?.amount_rub,
      },
    ]
  })

  const picks = fromScenario.length ? fromScenario : fromMatching
  if (scenarios.isPending || picks.length === 0) return null

  const calc = fromScenario.length ? scenario?.last_calculation : null
  const verdict = calc?.verdict && calc.verdict in VERDICT_LABEL ? (calc.verdict as Verdict) : null

  return (
    <section className="card mb-8 overflow-hidden">
      <header className="flex items-baseline justify-between gap-4 border-b border-line px-6 py-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 className="h2">Рекомендуем</h2>
          {!fromScenario.length && <span className="meta truncate">лучший кандидат в каждом процессе</span>}
        </div>
        {fromScenario.length > 0 && scenario && (
          <Link
            to={`/projects/${projectId}/scenarios/${scenario.id}`}
            className="group flex shrink-0 items-center gap-1 text-[13px] font-medium text-ink-3 transition-colors hover:text-ink"
          >
            Сценарий <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </header>

      <div className={cn('grid', calc && 'lg:grid-cols-[minmax(0,1fr)_260px]')}>
        <ul className="divide-y divide-line">
          {picks.map((pick) => (
            <PickRow key={pick.key} pick={pick} />
          ))}
        </ul>

        {calc && (
          <aside className="flex flex-col gap-3 border-t border-line bg-canvas/50 px-6 py-5 lg:border-t-0 lg:border-l">
            <Metric label="окупаемость" value={formatYears(calc.payback_years)}>
              {verdict && (
                <span className="inline-flex items-center gap-1.5">
                  <span className={cn('size-1.5 rounded-full', VERDICT_DOT[VERDICT_TONE[verdict]])} />
                  {VERDICT_LABEL[verdict].toLowerCase()}
                </span>
              )}
            </Metric>
            <Metric label="вложения, с НДС" value={formatRub(calc.capex_rub)} />
            <Metric label="эффект в год" value={formatRub(calc.effect_rub_year)} />
            {calc.status === 'stale' && (
              <p className="mt-auto flex items-center gap-1.5 text-[12px] text-warn">
                <span className="size-1.5 shrink-0 rounded-full bg-warn" />
                Данные изменились — пересчитайте
              </p>
            )}
          </aside>
        )}
      </div>
    </section>
  )
}

function PickRow({ pick }: { pick: Pick }) {
  const product = useProduct(pick.productId).data
  const total = isNum(pick.unitPrice) && pick.count ? pick.unitPrice * pick.count : null

  return (
    <li className="flex min-w-0 items-center gap-5 px-6 py-4">
      <div className="relative h-28 w-40 shrink-0 overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_50%_60%,#ffffff_0%,var(--card)_45%,var(--canvas)_100%)] ring-1 ring-line">
        <RobotPreview3D productId={pick.productId} framing={{ scale: 1.25, lower: 0.08 }} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[17px] font-semibold tracking-[-0.015em]">{pick.name}</div>
        <div className="truncate text-[13px] text-ink-3">
          {[pick.processName, product?.manufacturer?.name].filter(Boolean).join(' · ')}
        </div>
        <div className="num mt-2.5 truncate text-[13px] text-ink-2">
          {isNum(pick.unitPrice) ? `${formatRub(pick.unitPrice)} за шт.` : 'цена не указана'}
          {total && <span className="text-ink-3"> · парк {formatRub(total)}</span>}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="display num text-[30px] leading-none">×{formatNumber(pick.count)}</div>
        <div className="meta mt-1.5">{pick.countNote ?? pluralRu(pick.count, ['робот', 'робота', 'роботов'])}</div>
      </div>
    </li>
  )
}

function Metric({ value, label, children }: { value: string; label: string; children?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 whitespace-nowrap">
      <div className="meta">{label}</div>
      <div className="text-right">
        <div className="num text-[16px] font-semibold tracking-[-0.01em]">{value}</div>
        {children && <div className="meta text-ink-2">{children}</div>}
      </div>
    </div>
  )
}

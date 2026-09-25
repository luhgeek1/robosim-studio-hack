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
          countNote: result
            ? `${isNum(result.simulated) ? `${formatNumber(result.simulated)} по имитации` : `${formatNumber(result.analytic)} по расчёту цикла`}${result.reserve ? ` + ${formatNumber(result.reserve)} в резерв` : ''}`
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
        countNote: best.estimate ? 'оценка по циклу, точнее — в имитации' : undefined,
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
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 px-7 pt-6 pb-5">
        <div className="min-w-0">
          <h2 className="h2">Рекомендуем</h2>
          <p className="mt-1 text-[13.5px] text-ink-3">
            {fromScenario.length && scenario
              ? `Состав сценария «${scenario.name}» — тот же, что на обзоре проекта`
              : 'Лучший подходящий кандидат в каждом процессе — сценарий ещё не создан'}
          </p>
        </div>
        <div className="flex items-end gap-8">
          {calc && (
            <>
              <Metric value={formatYears(calc.payback_years)} label="окупаемость">
                {verdict && (
                  <>
                    <span className={cn('size-1.5 rounded-full', VERDICT_DOT[VERDICT_TONE[verdict]])} />
                    {VERDICT_LABEL[verdict].toLowerCase()}
                  </>
                )}
              </Metric>
              <Metric value={formatRub(calc.capex_rub)} label="вложения, с НДС" />
              <Metric value={formatRub(calc.effect_rub_year)} label="эффект в год" />
            </>
          )}
          {fromScenario.length > 0 && scenario && (
            <Link
              to={`/projects/${projectId}/scenarios/${scenario.id}`}
              className="group flex items-center gap-1 pb-1 text-[13px] font-medium text-ink-3 transition-colors hover:text-ink"
            >
              Сценарий <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      </div>

      {calc?.status === 'stale' && (
        <p className="mx-7 mb-4 flex items-center gap-2 text-[12.5px] text-warn">
          <span className="size-1.5 rounded-full bg-warn" />
          Данные менялись после расчёта — пересчитайте сценарий, состав может измениться
        </p>
      )}

      <ul className={cn('grid border-t border-line', picks.length > 1 && 'lg:grid-cols-2 lg:divide-x lg:divide-line')}>
        {picks.map((pick) => (
          <PickRow key={pick.key} pick={pick} />
        ))}
      </ul>
    </section>
  )
}

function PickRow({ pick }: { pick: Pick }) {
  const product = useProduct(pick.productId).data
  const total = isNum(pick.unitPrice) && pick.count ? pick.unitPrice * pick.count : null

  return (
    <li className="flex min-w-0 gap-6 px-7 py-6">
      <div className="relative h-44 w-60 shrink-0 overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_50%_60%,#ffffff_0%,var(--card)_45%,var(--canvas)_100%)] ring-1 ring-line">
        <RobotPreview3D productId={pick.productId} framing={{ scale: 1.25, lower: 0.08 }} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="truncate text-[18px] font-semibold tracking-[-0.015em]">{pick.name}</div>
            <div className="truncate text-[13px] text-ink-3">
              {[product?.manufacturer?.name, product?.solution_type_name].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="display num text-[34px]">×{formatNumber(pick.count)}</div>
            <div className="meta">{pluralRu(pick.count, ['робот', 'робота', 'роботов'])}</div>
          </div>
        </div>

        {product?.short_description && (
          <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-ink-2">{product.short_description}</p>
        )}

        <dl className="mt-auto grid max-w-2xl grid-cols-3 gap-4 pt-4">
          <Fact label="процесс" value={pick.processName} />
          <Fact label="за единицу" value={isNum(pick.unitPrice) ? formatRub(pick.unitPrice) : '—'} />
          <Fact label="весь парк" value={total ? formatRub(total) : '—'} />
        </dl>
        {pick.countNote && <div className="meta mt-2">{pick.countNote}</div>}
      </div>
    </li>
  )
}

function Metric({ value, label, children }: { value: string; label: string; children?: ReactNode }) {
  return (
    <div className="text-right whitespace-nowrap">
      <div className="num text-[20px] leading-tight font-semibold tracking-[-0.015em]">{value}</div>
      <div className="meta mt-0.5 inline-flex items-center gap-1.5">
        {label}
        {children && (
          <>
            <span>·</span>
            <span className="inline-flex items-center gap-1.5 text-ink-2">{children}</span>
          </>
        )}
      </div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="truncate text-[12px] text-ink-3">{label}</dt>
      <dd className="num truncate text-[14.5px] font-medium">{value}</dd>
    </div>
  )
}

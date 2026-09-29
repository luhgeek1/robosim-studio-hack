import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useAudit, useProcesses, useProject, useProjectId } from '@/entities/project'
import { VERDICT_LABEL, VERDICT_TONE, pickMainScenario, useScenarios, type Verdict } from '@/entities/scenario'
import type { ProjectStepId } from '@/entities/project/steps'
import type { AuditEvent, Scenario } from '@/shared/api/types'
import { formatDateTime, formatNumber, formatRub, formatYears, isNum } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { LoadingBlock } from '@/shared/ui/states'
import { RobotPreview3D } from '@/widgets/robot-3d'

// Journal entities as the user knows them; the raw prefix of the audit key is an internal name.
const AUDIT_ENTITY_LABEL: Record<string, string> = {
  project: 'проекта',
  project_param: 'параметра объекта',
  project_params: 'параметров объекта',
  scenario: 'сценария',
  import: 'данных из файла',
  layout: 'планировки',
  background: 'подложки планировки',
}

const AUDIT_ACTION_LABEL: Record<AuditEvent['action'], string> = {
  create: 'создание',
  update: 'изменение',
  delete: 'удаление',
  copy: 'копия',
  import: 'импорт',
  calculate: 'расчёт',
  simulate: 'имитация',
  export: 'выгрузка',
  override: 'переопределение',
}

// The overview keeps the site's ink and warm palette: a «reasonable» verdict is ink, not the accent blue.
const VERDICT_DOT: Record<(typeof VERDICT_TONE)[Verdict], string> = {
  ok: 'bg-ok',
  info: 'bg-ink',
  warn: 'bg-warn',
  crit: 'bg-crit',
  muted: 'bg-ink-4',
}

// The four steps that lead to a payback figure; the rest of the path checks and packages it.
const PATH: { id: ProjectStepId; label: string; text: string }[] = [
  { id: 'object', label: 'Объект', text: 'Площадь, персонал, смены и объёмы — загрузите файл или уточните главное' },
  { id: 'processes', label: 'Где деньги', text: 'Какие процессы обходятся дороже всего и что из них роботизируется' },
  { id: 'matching', label: 'Подбор', text: 'Роботы под ваш объект и объяснение, почему они подходят' },
  { id: 'scenarios', label: 'Сценарии', text: 'Сколько роботов нужно, сколько это стоит и когда окупится' },
]

export function OverviewPage() {
  const projectId = useProjectId()
  const project = useProject(projectId).data!
  const audit = useAudit(projectId)
  const scenarios = useScenarios(projectId)
  const scenario =
    scenarios.data?.find((s) => s.id === project.recommended_scenario_id) ?? pickMainScenario(scenarios.data)
  const hasSolution = !!scenario?.items.length
  const metrics = project.headline_metrics
  const verdict = metrics?.verdict && metrics.verdict in VERDICT_LABEL ? (metrics.verdict as Verdict) : null

  return (
    // The panel sits in the middle of the space under the header, however tall the window is.
    <div className="flex flex-1 items-center justify-center pt-4 pb-10">
      <div className="card w-full max-w-6xl p-5 shadow-card sm:p-8">
        <h1 className="h1 text-[26px] sm:text-[34px]">{project.name}</h1>

        {metrics ? (
          <>
            <div className="mt-7 grid grid-cols-1 divide-y divide-line rounded-xl bg-surface-2 ring-1 ring-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <Figure label="Окупаемость рекомендованного сценария" value={formatYears(metrics.payback_years)}>
                {verdict && (
                  <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2">
                    <span className={cn('size-1.5 rounded-full', VERDICT_DOT[VERDICT_TONE[verdict]])} />
                    {VERDICT_LABEL[verdict]}
                  </span>
                )}
              </Figure>
              <Figure label="CAPEX" value={formatRub(metrics.capex_rub)}>
                <span className="meta">с НДС</span>
              </Figure>
              <Figure label="Чистый эффект" value={formatRub(metrics.effect_rub_year)}>
                <span className="meta">в год</span>
              </Figure>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[13px] text-ink-3">
                Сравните покупку с арендой и лизингом или заберите готовое обоснование
              </span>
              <div className="flex flex-wrap items-center gap-2 max-sm:w-full [&>a]:max-sm:flex-1">
                <Button asChild variant="outline" size="lg">
                  <Link to="comparison">Сравнить варианты</Link>
                </Button>
                <Button asChild size="lg">
                  <Link to="report">
                    Открыть отчёт <ArrowRight />
                  </Link>
                </Button>
              </div>
            </div>
          </>
        ) : (
          <Start scenario={hasSolution ? scenario : undefined} />
        )}

        <div className={cn('mt-6 grid grid-cols-1 items-stretch gap-6', hasSolution && 'lg:grid-cols-2')}>
          {hasSolution && <Solution projectId={projectId} scenario={scenario!} />}

          {(audit.isPending || !!audit.data?.items.length) && (
            <Panel title="Журнал изменений" fill>
              {audit.isPending && <LoadingBlock rows={2} />}
              {audit.data && (
                // Next to the solution the list does not add to the row's height: that panel sets it and the journal
                // scrolls in it. Alone, the journal keeps its own height.
                <div className={cn('relative flex-1', hasSolution ? 'min-h-40 lg:min-h-0' : 'max-h-48')}>
                  <ul
                    className={cn(
                      'scroll-thin -mx-2 divide-y divide-line overflow-y-auto text-[12.5px]',
                      hasSolution ? 'absolute inset-0' : 'max-h-48',
                    )}
                  >
                    {audit.data.items.slice(0, 20).map((event) => (
                      <li key={event.id} className="flex flex-col gap-0.5 px-2 py-2 first:pt-0 sm:flex-row sm:gap-3">
                        <span className="num shrink-0 whitespace-nowrap text-ink-3">{formatDateTime(event.at)}</span>
                        <span className="min-w-0">
                          <span className="font-medium">{AUDIT_ACTION_LABEL[event.action] ?? 'изменение'}</span>{' '}
                          <span className="text-ink-3">
                            {AUDIT_ENTITY_LABEL[event.entity.split(':')[0]] ?? 'данных проекта'}
                          </span>
                          {event.note && <span className="text-ink-3"> — {event.note}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}

/* No calculation yet: the path to the first payback figure and one button to the next move. A project that already
   has a composed scenario goes straight to its calculation. */
function Start({ scenario }: { scenario?: Scenario }) {
  const next = scenario
    ? { to: `scenarios/${scenario.id}`, label: 'Рассчитать сценарий' }
    : { to: 'object', label: 'Начать оценку' }
  return (
    <div className="mt-5">
      <p className="text-[14px] text-ink-3">
        Расчёта ещё нет. Четыре шага ведут к окупаемости, остальные проверяют её и собирают отчёт.
      </p>
      <ol className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PATH.map((step, i) => (
          <li key={step.id}>
            <Link
              to={step.id}
              className={cn(
                'group flex h-full flex-col rounded-xl bg-surface-2 px-4 py-4 ring-1 ring-line transition-shadow hover:ring-line-2',
                !scenario && i === 0 && 'bg-card ring-ink/80 hover:ring-ink',
              )}
            >
              <span className="flex items-center justify-between text-[12.5px] text-ink-3">
                <span className="num">Шаг {i + 1}</span>
                <ArrowRight className="size-3.5 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
              </span>
              <span className="mt-1.5 text-[15px] font-semibold tracking-[-0.01em]">{step.label}</span>
              <span className="mt-1 text-[13px] leading-snug text-ink-3">{step.text}</span>
            </Link>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Button asChild size="lg" className="h-11 px-5 text-[15px]">
          <Link to={next.to}>
            {next.label} <ArrowRight />
          </Link>
        </Button>
        <span className="text-[13px] text-ink-3">
          Дальше — сравнение покупки, лизинга и RaaS, риски, имитация и отчёт PDF / Excel
        </span>
      </div>
    </div>
  )
}

function Figure({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div className="min-w-0 px-5 py-4 sm:px-6 sm:py-5">
      <div className="text-[13px] text-ink-3 sm:truncate">{label}</div>
      <div className="display num mt-2 text-[28px]">{value}</div>
      <div className="mt-2">{children}</div>
    </div>
  )
}

/* What the recommendation actually buys: which robots, how many and for which process — the first thing
   an operations director asks after the payback. */
function Solution({ projectId, scenario }: { projectId: string; scenario: Scenario }) {
  const processes = useProcesses(projectId)
  const processName = new Map((processes.data?.processes ?? []).map((p) => [p.process_key, p.name.split(' (')[0]]))

  return (
    <Panel
      title="Рекомендуемое решение"
      action={
        <Link
          to={`scenarios/${scenario.id}`}
          className="group inline-flex items-center gap-1 text-[12.5px] font-medium text-ink-3 transition-colors hover:text-ink"
        >
          Сценарий <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      }
    >
      <ul className="space-y-4">
        {scenario.items.map((item) => {
          const count = item.count_result?.final ?? item.count_manual ?? 0
          const result = item.count_result
          const price = item.price_override_rub ?? item.price_rub
          return (
            <li key={item.id} className="flex flex-wrap items-center gap-x-5 gap-y-3">
              {item.product_id && (
                <span className="relative h-28 w-full shrink-0 overflow-hidden rounded-xl sm:w-36 bg-[radial-gradient(ellipse_at_50%_60%,#ffffff_0%,var(--card)_45%,var(--canvas)_100%)] ring-1 ring-line">
                  <RobotPreview3D productId={item.product_id} framing={{ scale: 1.2, lower: 0.08 }} />
                </span>
              )}
              <span className="display num shrink-0 text-[34px]">{formatNumber(count)}</span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold tracking-[-0.01em]">
                  {(item.product_name ?? 'Решение').split(' (')[0]}
                </span>
                <span className="block truncate text-[12.5px] text-ink-3">
                  {processName.get(item.process_key) ?? item.process_key}
                </span>
                {isNum(price) && (
                  <span className="block truncate text-[12.5px] text-ink-3">{formatRub(price)} за единицу</span>
                )}
                {result && (
                  <span className="block truncate text-[12.5px] text-ink-3">
                    {isNum(result.simulated)
                      ? `${formatNumber(result.simulated)} по имитации`
                      : `${formatNumber(result.analytic)} по расчёту цикла`}
                    {result.reserve ? ` + ${formatNumber(result.reserve)} в резерв` : ''}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      {scenario.last_calculation?.status === 'stale' && (
        <p className="mt-4 flex items-center gap-2 text-[12.5px] text-warn">
          <span className="size-1.5 rounded-full bg-warn" />
          Данные менялись после расчёта — пересчитайте сценарий
        </p>
      )}
    </Panel>
  )
}

function Panel({
  title,
  action,
  fill = false,
  children,
}: {
  title: string
  action?: ReactNode
  fill?: boolean
  children: ReactNode
}) {
  return (
    <section className={cn('rounded-xl bg-surface-2 px-5 py-5 ring-1 ring-line', fill && 'flex flex-col')}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="h3">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

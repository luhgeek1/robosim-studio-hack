import { motion } from 'framer-motion'
import { ArrowRight, Copy, Layers, MoreHorizontal, Plus, RefreshCw, Sparkles, Star, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useProjectId } from '@/entities/project'
import {
  SCENARIO_KIND_LABEL,
  VERDICT_LABEL,
  useBuildComparisonSet,
  useCalculate,
  useCopyScenario,
  useCreateScenario,
  useDeleteScenario,
  useScenarios,
  type Verdict,
} from '@/entities/scenario'
import type { Scenario, ScenarioKind } from '@/shared/api/types'
import { formatNumber, formatRub, formatYears, isNum, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Screen } from '@/shared/ui/page'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { EmptyState, ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { RobotPreview3D } from '@/widgets/robot-3d'

const ROBOTIZED_KINDS: ScenarioKind[] = ['purchase', 'raas', 'lease']

export function ScenariosPage() {
  const projectId = useProjectId()
  const scenarios = useScenarios(projectId)
  const create = useCreateScenario(projectId)
  const buildSet = useBuildComparisonSet(projectId)
  const navigate = useNavigate()

  const fromRecommendation = async () => {
    const scenario = await create.mutateAsync({
      name: 'Покупка по рекомендации подбора',
      kind: 'purchase',
      from_recommendation: true,
    })
    navigate(`/projects/${projectId}/scenarios/${scenario.id}`)
  }

  const robotized = scenarios.data?.filter((s) => !s.is_baseline) ?? []
  const recommended =
    robotized.find((s) => s.is_recommended && s.last_calculation) ?? robotized.find((s) => s.last_calculation)
  const calc = recommended?.last_calculation
  // Для сравнения нужны два рассчитанных варианта роботизации (ТЗ 3.5.5): предлагаем собрать их одной кнопкой.
  const needsSet = scenarios.data !== undefined && robotized.filter((s) => s.last_calculation).length < 2
  const buildSetButton = (
    <Button
      variant={robotized.length ? 'default' : 'outline'}
      onClick={() => buildSet.mutate()}
      disabled={buildSet.isPending}
    >
      {buildSet.isPending ? <Spinner /> : <Layers />} Собрать покупку, RaaS и лизинг
    </Button>
  )

  return (
    <Screen
      title={
        calc
          ? `${recommended!.name}: ${calc.payback_years != null ? `окупается за ${formatYears(calc.payback_years)}` : 'не окупается в горизонте'}`
          : 'Сколько роботов нужно и что это стоит'
      }
      dense
      nextDisabled={!robotized.some((s) => s.last_calculation)}
      actions={
        <>
          <NewScenarioDialog projectId={projectId} />
          {needsSet && robotized.length > 0 ? (
            buildSetButton
          ) : (
            <Button onClick={fromRecommendation} disabled={create.isPending}>
              {create.isPending ? <Spinner /> : <Sparkles />} Из рекомендации подбора
            </Button>
          )}
        </>
      }
    >
      {scenarios.isPending && <LoadingBlock label="Загружаем сценарии…" />}
      {scenarios.isError && <ErrorBlock error={scenarios.error} onRetry={() => scenarios.refetch()} />}
      {scenarios.data && (
        <>
          {scenarios.data
            .filter((s) => s.is_baseline)
            .map((scenario) => (
              <BaselineStrip key={scenario.id} projectId={projectId} scenario={scenario} />
            ))}
          {robotized.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {robotized.map((scenario) => (
                <ScenarioCard key={scenario.id} projectId={projectId} scenario={scenario} />
              ))}
            </div>
          )}
        </>
      )}
      {scenarios.data && robotized.length === 0 && (
        <EmptyState
          className="mt-6"
          title="Сценариев роботизации пока нет"
          description="Быстрее всего — собрать сценарий из лучших подходящих решений по каждому процессу. Состав потом можно поменять."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={fromRecommendation} disabled={create.isPending}>
                <Sparkles /> Из рекомендации подбора
              </Button>
              {buildSetButton}
            </div>
          }
        />
      )}
    </Screen>
  )
}

const VERDICT_DOT: Record<Verdict, string> = {
  attractive: 'bg-ok',
  reasonable: 'bg-ink',
  questionable: 'bg-warn',
  not_recommended: 'bg-crit',
  insufficient_data: 'bg-ink-4',
  baseline: 'bg-ink-4',
}

const verdictOf = (v: string | null | undefined): Verdict | null => (v && v in VERDICT_LABEL ? (v as Verdict) : null)

/* The starting point: nothing is bought, today's staff costs stay — every variant is measured against it. */
function BaselineStrip({ projectId, scenario }: { projectId: string; scenario: Scenario }) {
  const calc = scenario.last_calculation
  return (
    <Link
      to={`/projects/${projectId}/scenarios/${scenario.id}`}
      className="group mb-4 flex items-center justify-between gap-6 rounded-[14px] bg-surface-2 px-6 py-4 ring-1 ring-line transition-colors hover:bg-card"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="size-2 shrink-0 rounded-full bg-ink-4" />
        <span className="min-w-0">
          <span className="block text-[15px] font-medium">{scenario.name}</span>
          <span className="block text-[12.5px] text-ink-3">
            Точка отсчёта: ничего не покупаем, затраты на персонал остаются · горизонт {scenario.horizon_years}{' '}
            {pluralRu(scenario.horizon_years, ['год', 'года', 'лет'])}
          </span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-4 text-[12.5px]">
        {calc?.status === 'stale' && <StaleMark />}
        <ArrowRight size={15} className="text-ink-3 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}

function ScenarioCard({ projectId, scenario }: { projectId: string; scenario: Scenario }) {
  const navigate = useNavigate()
  const copy = useCopyScenario(projectId)
  const remove = useDeleteScenario(projectId)
  const calculate = useCalculate(projectId, scenario.id)
  const calc = scenario.last_calculation
  const verdict = verdictOf(calc?.verdict)
  const href = `/projects/${projectId}/scenarios/${scenario.id}`
  const lead = scenario.items.find((i) => i.product_id)
  const fleet = scenario.items.reduce((sum, i) => sum + (i.count_result?.final ?? i.count_manual ?? 0), 0)
  const horizon = scenario.horizon_years
  const payback = calc?.payback_years
  const scale = Math.max(horizon, isNum(payback) ? payback : 0) * 1.08
  const stale = calc?.status === 'stale'

  const copyAs = async (kind: ScenarioKind) => {
    const created = await copy.mutateAsync({
      id: scenario.id,
      kind,
      name: `${SCENARIO_KIND_LABEL[kind]}: ${scenario.name}`,
    })
    navigate(`/projects/${projectId}/scenarios/${created.id}`)
  }

  return (
    <article className="card group relative flex flex-col overflow-hidden transition-shadow hover:shadow-card">
      <div className="relative h-44 border-b border-line bg-[radial-gradient(ellipse_at_50%_65%,#ffffff_0%,var(--surface-2)_55%,var(--canvas)_100%)]">
        {lead?.product_id ? (
          <RobotPreview3D productId={lead.product_id} framing={{ scale: 1.2, lower: 0.06 }} />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-[13px] text-ink-4">Состав не задан</div>
        )}
        <div className="pointer-events-none absolute top-4 left-4 flex items-center gap-2">
          <span className="rounded-full bg-white/90 px-2.5 py-1 text-[12px] font-medium text-ink-2 shadow-card backdrop-blur">
            {SCENARIO_KIND_LABEL[scenario.kind]}
          </span>
          {scenario.is_recommended && (
            <span className="flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[12px] font-medium text-ink shadow-card backdrop-blur">
              <Star size={12} className="fill-warn text-warn" /> рекомендуем
            </span>
          )}
        </div>
        <div className="absolute top-3 right-3 z-10">
          <ScenarioMenu scenario={scenario} onCopy={copyAs} onDelete={() => remove.mutateAsync(scenario.id)} />
        </div>
      </div>

      <div className="flex flex-1 flex-col px-5 pt-4 pb-5">
        <Link to={href} className="truncate text-[16px] font-semibold tracking-[-0.015em] after:absolute after:inset-0">
          {scenario.name}
        </Link>
        <div className="mt-0.5 truncate text-[12.5px] text-ink-3">
          {scenario.items.length
            ? scenario.items
                .map(
                  (i) =>
                    `${formatNumber(i.count_result?.final ?? i.count_manual ?? 0)} × ${shortName(i.product_name ?? 'решение')}`,
                )
                .join(', ')
            : 'добавьте решения в сценарий'}
          {fleet > 0 && scenario.items.length > 1 && ` · всего ${formatNumber(fleet)}`}
        </div>
        <CountOriginMark scenario={scenario} />

        {calc ? (
          <>
            <div className="mt-5 flex items-end justify-between gap-3">
              <div>
                <div className="display num text-[32px]">{isNum(payback) ? formatYears(payback) : 'не окупается'}</div>
                <div className="meta mt-1">окупаемость</div>
              </div>
              {verdict && (
                <span className="flex items-center gap-1.5 pb-1 text-[12.5px] font-medium text-ink-2">
                  <span className={cn('size-1.5 rounded-full', VERDICT_DOT[verdict])} />
                  {VERDICT_LABEL[verdict]}
                </span>
              )}
            </div>
            {/* Payback against the horizon: a bar that stops before the tick pays back in time. */}
            <div className="relative mt-3 h-1.5 rounded-full bg-black/5" title={`Горизонт расчёта — ${horizon} лет`}>
              {isNum(payback) && (
                <motion.div
                  className={cn('h-full rounded-full', verdict ? VERDICT_DOT[verdict] : 'bg-ink')}
                  initial={{ width: 0 }}
                  animate={{ width: `${(payback / scale) * 100}%` }}
                  transition={{ type: 'spring', stiffness: 120, damping: 22 }}
                />
              )}
              <span
                className="absolute -top-1 -bottom-1 w-px bg-ink-4"
                style={{ left: `${(horizon / scale) * 100}%` }}
              />
            </div>
            <div className="meta mt-1.5 flex justify-end">
              горизонт {horizon} {pluralRu(horizon, ['год', 'года', 'лет'])}
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
              <Cell label="CAPEX" value={formatRub(calc.capex_rub)} />
              <Cell label="эффект в год" value={formatRub(calc.effect_rub_year)} tone="ok" />
              <Cell
                label={`NPV за ${horizon} ${pluralRu(horizon, ['год', 'года', 'лет'])}`}
                value={formatRub(calc.npv_rub)}
                tone={isNum(calc.npv_rub) && calc.npv_rub < 0 ? 'crit' : undefined}
              />
            </dl>
          </>
        ) : (
          <p className="mt-5 text-[13.5px] text-ink-3">Сценарий ещё не рассчитан.</p>
        )}

        {(stale || !calc) && scenario.items.length > 0 && (
          <div className="relative z-10 mt-4 flex items-center justify-between gap-3">
            {stale ? <StaleMark /> : <span />}
            <Button size="sm" variant="outline" onClick={() => calculate.mutate()} disabled={calculate.isPending}>
              {calculate.isPending ? <Spinner /> : <RefreshCw />} {calc ? 'Пересчитать' : 'Рассчитать'}
            </Button>
          </div>
        )}
      </div>
    </article>
  )
}

// Число роботов проверено имитацией, взято по формуле или задано вручную — одно слово на карточке.
function CountOriginMark({ scenario }: { scenario: Scenario }) {
  const sources = new Set(scenario.items.map((i) => i.count_result?.source).filter(Boolean))
  if (sources.size === 0) return null
  const [text, dot] = sources.has('simulated')
    ? sources.size === 1
      ? ['N проверено имитацией', 'bg-ok']
      : ['N частично проверено имитацией', 'bg-ok']
    : sources.has('manual') && sources.size === 1
      ? ['N задано вручную', 'bg-warn']
      : ['N по формуле цикла', 'bg-ink-4']
  return (
    <div className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-3">
      <span className={cn('size-1.5 rounded-full', dot)} />
      {text}
    </div>
  )
}

function StaleMark() {
  return (
    <span className="flex items-center gap-1.5 text-[12.5px] text-warn">
      <span className="size-1.5 rounded-full bg-warn" /> данные менялись после расчёта
    </span>
  )
}

function ScenarioMenu({
  scenario,
  onCopy,
  onDelete,
}: {
  scenario: Scenario
  onCopy: (kind: ScenarioKind) => void
  onDelete: () => Promise<unknown>
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="bg-white/90 shadow-card backdrop-blur hover:bg-white"
          aria-label="Действия со сценарием"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Копия с тем же составом
        </DropdownMenuLabel>
        {ROBOTIZED_KINDS.map((kind) => (
          <DropdownMenuItem key={kind} onSelect={() => onCopy(kind)}>
            <Copy /> как «{SCENARIO_KIND_LABEL[kind]}»
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <ConfirmDialog
          title={`Удалить сценарий «${scenario.name}»?`}
          description="Сценарий и его расчёты будут удалены."
          onConfirm={onDelete}
          trigger={
            <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
              <Trash2 /> Удалить
            </DropdownMenuItem>
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'crit' }) {
  return (
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="mt-0.5 truncate text-[12px] text-ink-3">{label}</dt>
      <dd
        className={cn(
          'num truncate text-[15px] font-semibold tracking-[-0.01em]',
          tone === 'ok' && 'text-ok',
          tone === 'crit' && 'text-crit',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

const shortName = (name: string) => name.split(' (')[0]

function NewScenarioDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ScenarioKind>('purchase')
  const create = useCreateScenario(projectId)
  const navigate = useNavigate()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const scenario = await create.mutateAsync({
      name: name.trim() || SCENARIO_KIND_LABEL[kind],
      kind,
      from_recommendation: false,
    })
    setOpen(false)
    navigate(`/projects/${projectId}/scenarios/${scenario.id}`)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus /> Пустой сценарий
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Новый сценарий</DialogTitle>
            <DialogDescription>Состав решений добавите на странице сценария.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="scenario-name">Название</Label>
            <Input
              id="scenario-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: AMR на паллеты, RaaS"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Модель владения</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as ScenarioKind)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROBOTIZED_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {SCENARIO_KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Spinner />} Создать
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

import { Copy, MoreHorizontal, Plus, Sparkles, Star, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useProjectId } from '@/entities/project'
import {
  SCENARIO_KIND_LABEL,
  VerdictBadge,
  useCopyScenario,
  useCreateScenario,
  useDeleteScenario,
  useScenarios,
} from '@/entities/scenario'
import type { Scenario, ScenarioKind } from '@/shared/api/types'
import { formatRub, formatYears } from '@/shared/lib/format'
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
import { ToneBadge } from '@/shared/ui/tone'

const ROBOTIZED_KINDS: ScenarioKind[] = ['purchase', 'raas', 'lease']

export function ScenariosPage() {
  const projectId = useProjectId()
  const scenarios = useScenarios(projectId)
  const create = useCreateScenario(projectId)
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

  return (
    <Screen
      title={
        calc
          ? `${recommended!.name}: ${calc.payback_years != null ? `окупается за ${formatYears(calc.payback_years)}` : 'не окупается в горизонте'}`
          : 'Сколько роботов нужно и что это стоит'
      }
      lead="Сценарий — набор «процесс → решение → количество» и условия финансирования. «Как сейчас» — точка отсчёта; для сравнения нужны хотя бы два сценария роботизации, например покупка и RaaS."
      nextDisabled={!robotized.some((s) => s.last_calculation)}
      actions={
        <>
          <NewScenarioDialog projectId={projectId} />
          <Button onClick={fromRecommendation} disabled={create.isPending}>
            {create.isPending ? <Spinner /> : <Sparkles />} Из рекомендации подбора
          </Button>
        </>
      }
    >
      {scenarios.isPending && <LoadingBlock label="Загружаем сценарии…" />}
      {scenarios.isError && <ErrorBlock error={scenarios.error} onRetry={() => scenarios.refetch()} />}
      {scenarios.data && (
        <div className="card divide-y divide-line overflow-hidden">
          {scenarios.data.map((scenario) => (
            <ScenarioCard key={scenario.id} projectId={projectId} scenario={scenario} />
          ))}
        </div>
      )}
      {scenarios.data && robotized.length === 0 && (
        <EmptyState
          className="mt-6"
          title="Сценариев роботизации пока нет"
          description="Быстрее всего — собрать сценарий из лучших подходящих решений по каждому процессу. Состав потом можно поменять."
          action={
            <Button onClick={fromRecommendation} disabled={create.isPending}>
              <Sparkles /> Из рекомендации подбора
            </Button>
          }
        />
      )}
    </Screen>
  )
}

function ScenarioCard({ projectId, scenario }: { projectId: string; scenario: Scenario }) {
  const navigate = useNavigate()
  const copy = useCopyScenario(projectId)
  const remove = useDeleteScenario(projectId)
  const calc = scenario.last_calculation
  const href = `/projects/${projectId}/scenarios/${scenario.id}`

  const copyAs = async (kind: ScenarioKind) => {
    const created = await copy.mutateAsync({
      id: scenario.id,
      kind,
      name: `${SCENARIO_KIND_LABEL[kind]}: ${scenario.name}`,
    })
    navigate(`/projects/${projectId}/scenarios/${created.id}`)
  }

  return (
    <div className="relative grid grid-cols-[minmax(0,1.6fr)_minmax(0,2fr)_auto] items-center gap-6 px-5 py-4 transition-colors hover:bg-raised">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={href} className="truncate text-base font-medium after:absolute after:inset-0">
            {scenario.name}
          </Link>
          {scenario.is_recommended && (
            <ToneBadge tone="ok">
              <Star /> рекомендован
            </ToneBadge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <ToneBadge tone={scenario.is_baseline ? 'muted' : 'info'}>{SCENARIO_KIND_LABEL[scenario.kind]}</ToneBadge>
          <span>горизонт {scenario.horizon_years} лет</span>
          {scenario.overrides.length > 0 && <span>переопределений нормативов: {scenario.overrides.length}</span>}
        </div>
        {scenario.items.length > 0 && (
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {scenario.items.map((item) => (
              <li key={item.id} className="truncate">
                {item.product_name}
                {item.count_result
                  ? ` × ${item.count_result.final}`
                  : item.count_mode === 'manual' && item.count_manual
                    ? ` × ${item.count_manual}`
                    : ''}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="text-xs">
        {calc ? (
          <div className="grid grid-cols-4 gap-3">
            <Cell label="Окупаемость" value={scenario.is_baseline ? '—' : formatYears(calc.payback_years)} />
            <Cell label="CAPEX" value={formatRub(calc.capex_rub)} />
            <Cell label="NPV" value={formatRub(calc.npv_rub)} />
            <div className="space-y-1">
              <div className="text-muted-foreground">Итог</div>
              {calc.status === 'stale' ? (
                <ToneBadge tone="warn">устарел</ToneBadge>
              ) : (
                <VerdictBadge verdict={calc.verdict} />
              )}
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground">Не рассчитан</span>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="relative z-10" aria-label="Действия со сценарием">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {!scenario.is_baseline && (
            <>
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Копия с тем же составом
              </DropdownMenuLabel>
              {ROBOTIZED_KINDS.map((kind) => (
                <DropdownMenuItem key={kind} onSelect={() => copyAs(kind)}>
                  <Copy /> как «{SCENARIO_KIND_LABEL[kind]}»
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <ConfirmDialog
                title={`Удалить сценарий «${scenario.name}»?`}
                description="Сценарий и его расчёты будут удалены."
                onConfirm={() => remove.mutateAsync(scenario.id)}
                trigger={
                  <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                    <Trash2 /> Удалить
                  </DropdownMenuItem>
                }
              />
            </>
          )}
          {scenario.is_baseline && (
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Базовый сценарий — точка отсчёта, его нельзя удалить
            </DropdownMenuLabel>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground">{label}</div>
      <div className="num font-medium">{value}</div>
    </div>
  )
}

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

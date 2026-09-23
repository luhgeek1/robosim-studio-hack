import { ChevronRight, CircleHelp, Info, Plus } from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { BADGE_LABEL, PRODUCT_STATUS_LABEL } from '@/entities/catalog'
import { CANDIDATE_STATUS_LABEL, CRITERION_LABEL, useAddManualCandidate } from '@/entities/matching'
import { problemText } from '@/shared/api/problem'
import type { Candidate, Reason } from '@/shared/api/types'
import { formatNumber, formatPct, formatRub, formatValue, formatYears, isNum } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/ui/alert-dialog'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { ToneBadge } from '@/shared/ui/tone'
import { TONE_TEXT } from '@/shared/ui/tone-classes'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { SEVERITY_LABEL, SEVERITY_ORDER, SEVERITY_TONE, STATUS_TONE } from './labels'

// Отметки, которые говорят о проверке продукта, а не о его происхождении: «отечественный» и «есть внедрения» есть почти у всех.
const VERIFIED_BADGES = new Set(['in_registry_719', 'tested_fcbas', 'specs_confirmed'])

type MissingData = Candidate['missing_data'][number]

export function CandidateCard({
  projectId,
  processKey,
  candidate,
  selected,
  selectDisabled,
  onSelectedChange,
}: {
  projectId: string
  processKey: string
  candidate: Candidate
  selected: boolean
  selectDisabled: boolean
  onSelectedChange: (value: boolean) => void
}) {
  const { product, estimate } = candidate
  const verified = (product.badges ?? []).filter((badge) => VERIFIED_BADGES.has(badge))
  const hasEstimate =
    estimate && (isNum(estimate.robots_count) || isNum(estimate.capex_rub) || isNum(estimate.payback_years))
  const byseverity = SEVERITY_ORDER.map((severity) => ({
    severity,
    reasons: candidate.reasons.filter((r) => r.severity === severity),
  })).filter((g) => g.reasons.length > 0)
  // ТЗ 3.4.3: каких данных не хватает и зачем они нужны. Пояснение встаёт под причину с тем же ключом ТТХ,
  // остальные пробелы идут отдельным списком.
  const missing = candidate.missing_data ?? []
  const why = new Map(missing.map((m) => [m.spec_key, m.why_needed]))
  const explained = new Set(
    candidate.reasons
      .filter((r) => r.severity !== 'info')
      .map((r) => r.spec_key)
      .filter((key): key is string => Boolean(key)),
  )
  const unexplained = missing.filter((m) => !explained.has(m.spec_key))

  return (
    <article className={cn('rounded-lg border bg-surface p-4', candidate.status === 'excluded' && 'opacity-80')}>
      <div className="flex items-start gap-3">
        <Checkbox
          className="mt-1"
          checked={selected}
          disabled={selectDisabled && !selected}
          onCheckedChange={(v) => onSelectedChange(v === true)}
          aria-label={`Выбрать «${product.name}» для сравнения`}
        />
        {candidate.rank != null && (
          <span className="num mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-ok-soft text-xs font-semibold text-ok">
            {candidate.rank}
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link to={`/catalog/${product.id}`} className="font-medium hover:text-primary hover:underline">
              {product.name}
            </Link>
            <ToneBadge tone={STATUS_TONE[candidate.status]}>{CANDIDATE_STATUS_LABEL[candidate.status]}</ToneBadge>
          </div>
          <div className="text-xs text-muted-foreground">
            {[
              product.manufacturer?.name,
              product.solution_type_name,
              product.price_from
                ? `от ${formatRub(product.price_from.amount_rub)}${product.price_from.vat_included ? ' с НДС' : ' без НДС'}`
                : 'цена не указана',
              isNum(product.trl) ? `УГТ ${product.trl}` : null,
              product.status !== 'operation' ? PRODUCT_STATUS_LABEL[product.status] : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          {verified.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {verified.map((badge) => (
                <ToneBadge key={badge} tone="ok">
                  {BADGE_LABEL[badge] ?? badge}
                </ToneBadge>
              ))}
            </div>
          )}
        </div>
        <ScoreButton candidate={candidate} />
      </div>

      {hasEstimate && (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-md bg-raised px-3 py-2 text-xs">
          <span className="text-muted-foreground">Быстрая оценка:</span>
          <span>
            Роботов: <span className="num font-medium">{formatValue(estimate?.robots_count, 'шт')}</span>
          </span>
          <span>
            CAPEX: <span className="num font-medium">{formatRub(estimate?.capex_rub)}</span>
          </span>
          <span>
            Окупаемость: <span className="num font-medium">{formatYears(estimate?.payback_years)}</span>
          </span>
          {estimate?.note && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="ml-auto text-muted-foreground hover:text-foreground"
                  aria-label="Как посчитано"
                >
                  <Info className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{estimate.note}</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}

      {byseverity.length > 0 && (
        <div className="mt-3 space-y-2">
          {byseverity.map(({ severity, reasons }) =>
            severity === 'info' ? (
              <Collapsible key={severity} defaultOpen={byseverity.length === 1 && candidate.status !== 'fit'}>
                <CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
                  {SEVERITY_LABEL.info} ({reasons.length})
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ReasonList reasons={reasons} why={why} />
                </CollapsibleContent>
              </Collapsible>
            ) : (
              <div key={severity}>
                <div className={cn('text-xs font-medium', TONE_TEXT[SEVERITY_TONE[severity]])}>
                  {SEVERITY_LABEL[severity]}
                </div>
                <ReasonList reasons={reasons} why={why} />
              </div>
            ),
          )}
        </div>
      )}

      {unexplained.length > 0 && <MissingList items={unexplained} />}

      {candidate.status === 'excluded' && (
        <ManualAdd projectId={projectId} processKey={processKey} candidate={candidate} />
      )}
    </article>
  )
}

function ReasonList({ reasons, why }: { reasons: Reason[]; why: Map<string, string> }) {
  return (
    <ul className="mt-1 space-y-1">
      {reasons.map((reason, i) => {
        const tone = SEVERITY_TONE[reason.severity]
        const hasValues = reason.required != null || reason.actual != null
        return (
          <li key={`${reason.code}-${i}`} className="flex gap-2 text-xs">
            <span
              className={cn(
                'mt-1.5 size-1.5 shrink-0 rounded-full',
                tone === 'crit' ? 'bg-crit' : tone === 'warn' ? 'bg-warn' : 'bg-muted-foreground/50',
              )}
            />
            <span className="min-w-0">
              <span className={cn(reason.severity === 'info' && 'text-muted-foreground')}>{reason.text}</span>
              {hasValues && (
                <span className="num ml-1.5 text-muted-foreground">
                  (требование: {formatReasonValue(reason.required, reason.unit)}; у продукта:{' '}
                  {formatReasonValue(reason.actual, reason.unit)})
                </span>
              )}
              {reason.spec_key && why.has(reason.spec_key) && reason.severity !== 'info' && (
                <span className="block text-muted-foreground">Зачем нужно: {why.get(reason.spec_key)}</span>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function MissingList({ items }: { items: MissingData[] }) {
  return (
    <div className="mt-3">
      <div className={cn('text-xs font-medium', TONE_TEXT.warn)}>Не хватает данных производителя</div>
      <ul className="mt-1 space-y-1">
        {items.map((m) => (
          <li key={m.spec_key} className="flex gap-2 text-xs">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn" />
            <span className="min-w-0">
              {m.name}
              <span className="block text-muted-foreground">Зачем нужно: {m.why_needed}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ТЗ 3.4.4: решение не прошло жёсткие проверки, но его можно добавить в сравнение — после показа всех причин.
function ManualAdd({
  projectId,
  processKey,
  candidate,
}: {
  projectId: string
  processKey: string
  candidate: Candidate
}) {
  const add = useAddManualCandidate(projectId)
  const blocking = candidate.reasons.filter((r) => r.severity === 'blocking')
  const warnings = candidate.reasons.filter((r) => r.severity === 'warning')
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="mt-3">
          <Plus /> Всё равно добавить в сравнение
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Добавить «{candidate.product.name}» вручную?</AlertDialogTitle>
          <AlertDialogDescription>
            Решение не прошло жёсткие проверки объекта. В сравнении оно останется с пометкой «добавлен вручную» и с
            причинами исключения.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="space-y-1.5 text-sm">
          {[...blocking, ...warnings].map((r, i) => (
            <li key={`${r.code}-${i}`} className="flex gap-2">
              <span
                className={cn(
                  'mt-1.5 size-1.5 shrink-0 rounded-full',
                  r.severity === 'blocking' ? 'bg-crit' : 'bg-warn',
                )}
              />
              <span>
                {r.text}
                {(r.required != null || r.actual != null) && (
                  <span className="num ml-1.5 text-muted-foreground">
                    (требование: {formatReasonValue(r.required, r.unit)}; у продукта:{' '}
                    {formatReasonValue(r.actual, r.unit)})
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction
            disabled={add.isPending}
            onClick={() =>
              add.mutate(
                { process_key: processKey, product_id: candidate.product.id, offer_id: candidate.offer_id ?? null },
                {
                  onSuccess: () => toast.success('Решение добавлено в подбор с пометкой «добавлен вручную»'),
                  onError: (error) => toast.error(problemText(error)),
                },
              )
            }
          >
            Добавить с предупреждением
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const formatReasonValue = (value: Reason['required'], unit: Reason['unit']) =>
  value == null ? 'нет данных' : formatValue(value, unit)

function ScoreButton({ candidate }: { candidate: Candidate }) {
  if (!isNum(candidate.score)) {
    return (
      <div className="shrink-0 text-right">
        <div className="num text-xl font-semibold text-muted-foreground">—</div>
        <div className="text-[11px] text-muted-foreground">балл</div>
      </div>
    )
  }
  const breakdown = candidate.score_breakdown ?? []
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group shrink-0 rounded-lg px-2 py-1 text-right hover:bg-raised"
          aria-label="Из чего сложился балл"
        >
          <div className="num text-xl font-semibold">
            {formatNumber(candidate.score, 1)}
            <span className="text-xs font-normal text-muted-foreground"> / 100</span>
          </div>
          <div className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground group-hover:text-foreground">
            <CircleHelp className="size-3" /> из чего балл
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[440px]">
        <div className="mb-2 font-medium">Балл {formatNumber(candidate.score, 1)} из 100 — сумма вкладов</div>
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="pb-1 text-left font-normal">Критерий</th>
              <th className="pb-1 pl-3 text-right font-normal">Вес</th>
              <th className="pb-1 pl-3 text-right font-normal">Баллы</th>
              <th className="pb-1 pl-3 text-right font-normal">Вклад</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((c) => (
              <tr key={c.criterion} className="border-t align-top">
                <td className="py-1.5 pr-2">
                  <div className="font-medium">{c.name || CRITERION_LABEL[c.criterion] || c.criterion}</div>
                  <div className="text-muted-foreground">{c.explanation}</div>
                </td>
                <td className="num py-1.5 pl-3 text-right">{formatPct(c.weight, { share: true, digits: 0 })}</td>
                <td className="num py-1.5 pl-3 text-right">{formatNumber(c.points, 1)}</td>
                <td className="num py-1.5 pl-3 text-right font-medium">{formatNumber(c.contribution, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Вклад = вес × баллы. Веса меняются кнопкой «Веса критериев».
        </p>
      </PopoverContent>
    </Popover>
  )
}

import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { BADGE_LABEL } from '@/entities/catalog'
import { CANDIDATE_STATUS_LABEL, CRITERION_LABEL, useAddManualCandidate } from '@/entities/matching'
import { problemText } from '@/shared/api/problem'
import type { Candidate, Reason } from '@/shared/api/types'
import { formatNumber, formatPct, formatRub, formatValue, formatYears, isNum, pluralRu } from '@/shared/lib/format'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { CardChip, CardFigures, RobotCard } from '@/widgets/robot-card'
import { SEVERITY_LABEL, SEVERITY_ORDER } from './labels'

// Отметки, которые говорят о проверке продукта, а не о его происхождении: «отечественный» и «есть внедрения» есть почти у всех.
const VERIFIED_BADGES = new Set(['in_registry_719', 'tested_fcbas', 'specs_confirmed'])

const STATUS_DOT: Record<Candidate['status'], string> = {
  fit: 'bg-ok',
  check: 'bg-warn',
  manual: 'bg-info',
  excluded: 'bg-crit',
}

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
  const excluded = candidate.status === 'excluded'

  return (
    <RobotCard
      productId={product.id}
      solutionType={product.solution_type}
      name={product.name}
      to={`/catalog/${product.id}`}
      subtitle={product.manufacturer?.name}
      price={product.price_from}
      chips={
        <>
          {candidate.rank != null && <CardChip strong>№ {candidate.rank}</CardChip>}
          {/* Плашка статуса открывает причины (ТЗ 3.4.3); у исключённого там же ручное добавление (ТЗ 3.4.4). */}
          <WhyPopover
            candidate={candidate}
            verified={verified.map((b) => BADGE_LABEL[b] ?? b)}
            action={excluded ? <ManualAdd projectId={projectId} processKey={processKey} candidate={candidate} /> : null}
          >
            <button
              type="button"
              title="Почему такой статус"
              className="flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[12px] font-medium text-ink transition-colors hover:bg-white"
            >
              <span className={cn('size-1.5 rounded-full', STATUS_DOT[candidate.status])} />
              {CANDIDATE_STATUS_LABEL[candidate.status]}
            </button>
          </WhyPopover>
        </>
      }
      corner={
        <label
          className={cn(
            'flex cursor-pointer items-center gap-2 rounded-full bg-white/90 py-1 pr-2.5 pl-2 text-[12px] font-medium transition-colors hover:bg-white',
            selectDisabled && !selected && 'cursor-not-allowed',
          )}
        >
          <Checkbox
            checked={selected}
            disabled={selectDisabled && !selected}
            onCheckedChange={(v) => onSelectedChange(v === true)}
            aria-label={`Выбрать «${product.name}» для сравнения`}
          />
          Сравнить
        </label>
      }
      cornerPinned={selected}
      aside={<ScoreButton candidate={candidate} />}
      details={
        <CardFigures
          items={[
            {
              value: isNum(estimate?.robots_count) ? formatNumber(estimate.robots_count) : '—',
              label: isNum(estimate?.robots_count) ? 'роботов нужно' : 'роботов: не оценено',
            },
            { value: isNum(estimate?.capex_rub) ? formatRub(estimate.capex_rub) : '—', label: 'CAPEX' },
            {
              value: isNum(estimate?.payback_years) ? formatYears(estimate.payback_years) : '—',
              label: 'окупаемость',
            },
          ]}
        />
      }
    />
  )
}

function WhyPopover({
  candidate,
  verified,
  action,
  children,
}: {
  candidate: Candidate
  verified: string[]
  action: ReactNode
  children: ReactNode
}) {
  const bySeverity = SEVERITY_ORDER.map((severity) => ({
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
  const checks = candidate.reasons.length

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-[420px] space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-medium">
            {checks} {pluralRu(checks, ['проверка', 'проверки', 'проверок'])} объекта
          </span>
          {verified.length > 0 && <span className="text-[12px] text-ok">{verified.join(' · ')}</span>}
        </div>
        {bySeverity.map(({ severity, reasons }) => (
          <div key={severity}>
            <div
              className={cn(
                'text-[12px] font-medium',
                severity === 'blocking' ? 'text-crit' : severity === 'warning' ? 'text-warn' : 'text-ink-3',
              )}
            >
              {SEVERITY_LABEL[severity]}
            </div>
            <ReasonList reasons={reasons} why={why} />
          </div>
        ))}
        {unexplained.length > 0 && <MissingList items={unexplained} />}
        {candidate.estimate?.note && (
          <p className="border-t border-line pt-2 text-[12px] text-ink-3">{candidate.estimate.note}</p>
        )}
        {action}
      </PopoverContent>
    </Popover>
  )
}

function ReasonList({ reasons, why }: { reasons: Reason[]; why: Map<string, string> }) {
  return (
    <ul className="mt-1 space-y-1">
      {reasons.map((reason, i) => {
        const hasValues = reason.required != null || reason.actual != null
        return (
          <li key={`${reason.code}-${i}`} className="flex gap-2 text-[12.5px]">
            <span
              className={cn(
                'mt-1.5 size-1.5 shrink-0 rounded-full',
                reason.severity === 'blocking' ? 'bg-crit' : reason.severity === 'warning' ? 'bg-warn' : 'bg-ink-4',
              )}
            />
            <span className="min-w-0">
              <span className={cn(reason.severity === 'info' && 'text-ink-3')}>{reason.text}</span>
              {hasValues && (
                <span className="num ml-1.5 text-ink-3">
                  (требование: {formatReasonValue(reason.required, reason.unit)}; у продукта:{' '}
                  {formatReasonValue(reason.actual, reason.unit)})
                </span>
              )}
              {reason.spec_key && why.has(reason.spec_key) && reason.severity !== 'info' && (
                <span className="block text-ink-3">Зачем нужно: {why.get(reason.spec_key)}</span>
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
    <div>
      <div className="text-[12px] font-medium text-warn">Не хватает данных производителя</div>
      <ul className="mt-1 space-y-1">
        {items.map((m) => (
          <li key={m.spec_key} className="flex gap-2 text-[12.5px]">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn" />
            <span className="min-w-0">
              {m.name}
              <span className="block text-ink-3">Зачем нужно: {m.why_needed}</span>
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
        <Button size="sm" variant="outline">
          <Plus /> Всё равно добавить
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
                  <span className="num ml-1.5 text-ink-3">
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
        <div className="display num text-[19px] leading-tight text-ink-4">—</div>
        <div className="text-[11px] text-ink-3">балл</div>
      </div>
    )
  }
  const breakdown = candidate.score_breakdown ?? []
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group/score -mt-0.5 -mr-1.5 shrink-0 rounded-lg px-1.5 py-0.5 text-right transition-colors hover:bg-surface-2"
          aria-label="Из чего сложился балл"
        >
          <div className="display num text-[19px] leading-tight">{formatNumber(candidate.score, 1)}</div>
          <div className="text-[11px] text-ink-3 group-hover/score:text-ink-2">балл</div>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[440px]">
        <div className="mb-2 font-medium">Балл {formatNumber(candidate.score, 1)} из 100 — сумма вкладов</div>
        <table className="w-full text-xs">
          <thead className="text-ink-3">
            <tr>
              <th className="pb-1 text-left font-normal">Критерий</th>
              <th className="pb-1 pl-3 text-right font-normal">Вес</th>
              <th className="pb-1 pl-3 text-right font-normal">Баллы</th>
              <th className="pb-1 pl-3 text-right font-normal">Вклад</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((c) => (
              <tr key={c.criterion} className="border-t border-line align-top">
                <td className="py-1.5 pr-2">
                  <div className="font-medium">{c.name || CRITERION_LABEL[c.criterion] || c.criterion}</div>
                  <div className="text-ink-3">{c.explanation}</div>
                </td>
                <td className="num py-1.5 pl-3 text-right">{formatPct(c.weight, { share: true, digits: 0 })}</td>
                <td className="num py-1.5 pl-3 text-right">{formatNumber(c.points, 1)}</td>
                <td className="num py-1.5 pl-3 text-right font-medium">{formatNumber(c.contribution, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-ink-3">Вклад = вес × баллы. Веса меняются кнопкой «Веса критериев».</p>
      </PopoverContent>
    </Popover>
  )
}

import { ArrowUpRight, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { BADGE_LABEL, PRODUCT_STATUS_LABEL } from '@/entities/catalog'
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
import { SEVERITY_LABEL, SEVERITY_ORDER } from './labels'
import { RobotPreview } from './RobotPreview'

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
  const meta = [
    product.manufacturer?.name,
    product.solution_type_name,
    isNum(product.trl) ? `УГТ ${product.trl}` : null,
    product.status !== 'operation' ? PRODUCT_STATUS_LABEL[product.status] : null,
  ].filter(Boolean)

  const price = product.price_from
  return (
    <article className="group card relative aspect-[5/6] w-full overflow-hidden">
      <RobotPreview solutionType={product.solution_type} productId={product.id} />

      <div className="absolute top-4 left-4 flex items-center gap-1.5">
        {candidate.rank != null && <Chip strong>№ {candidate.rank}</Chip>}
        <Chip>
          <span className={cn('size-1.5 rounded-full', STATUS_DOT[candidate.status])} />
          {CANDIDATE_STATUS_LABEL[candidate.status]}
        </Chip>
      </div>
      <label
        className={cn(
          'absolute top-4 right-4 flex cursor-pointer items-center gap-2 rounded-full bg-white/90 py-1 pr-2.5 pl-2 text-[12px] font-medium transition-opacity hover:bg-white',
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
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

      {/* В покое — только название и цена по краям; при наведении снизу выезжает панель с расчётом и проверками. */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 transition-opacity duration-200 group-focus-within:opacity-0 group-hover:opacity-0">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-[17px] leading-snug font-semibold tracking-[-0.01em]">{product.name}</h3>
          <p className="mt-0.5 truncate text-[13px] text-ink-3">{product.manufacturer?.name}</p>
        </div>
        <Price price={price} />
      </div>

      <div className="absolute inset-x-0 bottom-0 translate-y-full bg-card px-4 pt-3 pb-3.5 transition-[translate,box-shadow] group-focus-within:shadow-[0_-8px_24px_-12px_rgba(20,20,24,0.18)] group-hover:shadow-[0_-8px_24px_-12px_rgba(20,20,24,0.18)] duration-300 ease-out group-focus-within:translate-y-0 group-hover:translate-y-0">
        <div className="flex items-center justify-between gap-3">
          <Link
            to={`/catalog/${product.id}`}
            title={[product.name, ...meta].join(' · ')}
            className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.01em] transition-colors hover:text-info"
          >
            {product.name}
          </Link>
          <ScoreButton candidate={candidate} />
        </div>

        <dl className="mt-2.5 grid grid-cols-3 gap-x-3">
          <Figure
            value={isNum(estimate?.robots_count) ? formatNumber(estimate.robots_count) : '—'}
            label={isNum(estimate?.robots_count) ? 'роботов нужно' : 'роботов: не оценено'}
          />
          <Figure value={isNum(estimate?.capex_rub) ? formatRub(estimate.capex_rub) : '—'} label="CAPEX" />
          <Figure
            value={isNum(estimate?.payback_years) ? formatYears(estimate.payback_years) : '—'}
            label="окупаемость"
          />
        </dl>

        <Verdict candidate={candidate} extra={verified.map((b) => BADGE_LABEL[b] ?? b).join(' · ')} />

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <WhyPopover candidate={candidate} />
          {excluded ? (
            <ManualAdd projectId={projectId} processKey={processKey} candidate={candidate} />
          ) : (
            <Link
              to={`/catalog/${product.id}`}
              className="flex items-center gap-1 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"
            >
              Карточка <ArrowUpRight className="size-3.5" />
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}

function Price({ price }: { price: Candidate['product']['price_from'] }) {
  if (!price) return <span className="shrink-0 pb-0.5 text-[13px] text-ink-3">цена не указана</span>
  return (
    <div className="shrink-0 text-right">
      <div className="display num text-[20px] leading-tight">{formatRub(price.amount_rub)}</div>
      <div className="mt-0.5 text-[12px] text-ink-3">от, {price.vat_included ? 'с НДС' : 'без НДС'}</div>
    </div>
  )
}

function Chip({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium',
        strong ? 'num bg-ink text-white' : 'bg-white/90 text-ink',
      )}
    >
      {children}
    </span>
  )
}

function Figure({ value, label }: { value: ReactNode; label: string }) {
  // dt раньше dd по смыслу, а визуально число сверху — поэтому колонка развёрнута.
  return (
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="truncate text-[11.5px] text-ink-3" title={label}>
        {label}
      </dt>
      <dd className="num truncate text-[15px] leading-tight font-semibold tracking-[-0.01em]">{value}</dd>
    </div>
  )
}

/* Одна строка итога проверок: для исключённого — главная блокирующая причина, для «проверить» — чего не хватает. */
function Verdict({ candidate, extra }: { candidate: Candidate; extra?: string }) {
  const blocking = candidate.reasons.find((r) => r.severity === 'blocking')
  const warning = candidate.reasons.find((r) => r.severity === 'warning')
  const missing = candidate.missing_data?.[0]
  const line = blocking
    ? { tone: 'crit', text: blocking.text }
    : warning
      ? { tone: 'warn', text: warning.text }
      : missing
        ? { tone: 'warn', text: `Нет данных производителя: ${missing.name.toLowerCase()}` }
        : { tone: 'ok', text: extra ? `Все проверки пройдены · ${extra}` : 'Все проверки объекта пройдены' }
  return (
    <p
      className={cn(
        'mt-2.5 flex items-start gap-2 border-t border-line pt-2.5 text-[12.5px] leading-snug',
        line.tone === 'crit' ? 'text-crit' : line.tone === 'warn' ? 'text-warn' : 'text-ink-2',
      )}
    >
      <span
        className={cn(
          'mt-1.5 size-1.5 shrink-0 rounded-full',
          line.tone === 'crit' ? 'bg-crit' : line.tone === 'warn' ? 'bg-warn' : 'bg-ok',
        )}
      />
      <span className="truncate" title={line.text}>
        {line.text}
      </span>
    </p>
  )
}

function WhyPopover({ candidate }: { candidate: Candidate }) {
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
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-[13px] font-medium text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink-3"
        >
          Почему · {checks} {pluralRu(checks, ['проверка', 'проверки', 'проверок'])}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[420px] space-y-3">
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

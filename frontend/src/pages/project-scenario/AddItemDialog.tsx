import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { CANDIDATE_STATUS_LABEL, useMatching } from '@/entities/matching'
import type { Candidate, CandidateStatus } from '@/shared/api/types'
import { formatRub, formatYears } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { ToneBadge, type Tone } from '@/shared/ui/tone'
import { RobotStage } from '@/widgets/robot-card'
import type { ItemDraft } from './draft'

const STATUS_TONE: Record<CandidateStatus, Tone> = { fit: 'ok', check: 'warn', manual: 'info', excluded: 'crit' }

export function AddItemDialog({
  projectId,
  items,
  onAdd,
}: {
  projectId: string
  items: ItemDraft[]
  onAdd: (processKey: string, candidate: Candidate) => void
}) {
  const [open, setOpen] = useState(false)
  const matching = useMatching(projectId)
  const [processKey, setProcessKey] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const processes = matching.data?.processes ?? []
  const current = processes.find((p) => p.process_key === processKey) ?? processes[0]
  const existing = items.find((i) => i.process_key === current?.process_key)
  const candidates = (current?.candidates ?? []).filter(
    (c) =>
      c.status !== 'excluded' &&
      `${c.product.name} ${c.product.manufacturer.name}`
        .toLocaleLowerCase('ru')
        .includes(search.trim().toLocaleLowerCase('ru')),
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus /> Добавить решение
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Решения для вашего сценария</DialogTitle>
          <DialogDescription>
            Те же кандидаты, что в подборе. Выберите процесс и робота. Для сравнения двух решений на один процесс
            создайте копию сценария.
          </DialogDescription>
        </DialogHeader>
        {matching.isPending && <LoadingBlock rows={3} />}
        {matching.isError && <ErrorBlock error={matching.error} onRetry={() => matching.refetch()} />}
        {current && (
          <div className="grid max-h-[70vh] min-h-0 gap-5 sm:grid-cols-[220px_1fr]">
            <nav className="space-y-1 overflow-y-auto" aria-label="Процесс для решения">
              {processes.map((p) => (
                <button
                  key={p.process_key}
                  type="button"
                  onClick={() => {
                    setProcessKey(p.process_key)
                    setSearch('')
                  }}
                  aria-current={p.process_key === current.process_key ? 'true' : undefined}
                  className={cn(
                    'w-full rounded-lg px-3 py-2.5 text-left hover:bg-raised',
                    p.process_key === current.process_key && 'bg-raised font-medium',
                  )}
                >
                  <span className="block text-sm leading-snug">{p.name}</span>
                  <span className="mt-1 block text-xs text-ink-3">
                    {items.some((i) => i.process_key === p.process_key)
                      ? 'Есть в составе · можно заменить'
                      : 'Ещё не добавлен'}
                  </span>
                </button>
              ))}
            </nav>
            <div className="flex min-h-0 flex-col gap-3">
              <div className="relative">
                <Search className="absolute top-2.5 left-3 size-4 text-ink-3" />
                <Input
                  aria-label="Поиск решения"
                  placeholder="Название робота или производителя"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {current.demand_summary && (
                <p className="text-xs text-ink-3">Нагрузка процесса: {current.demand_summary}</p>
              )}
              {existing && (
                <p className="text-sm text-warn">
                  Сейчас: «{existing.product_name}». Кнопка «Заменить» поменяет только решение для этого процесса.
                </p>
              )}
              <div className="min-h-0 space-y-3 overflow-y-auto pr-2">
                {candidates.length === 0 && (
                  <p className="py-6 text-sm text-ink-3">
                    {search
                      ? 'По этому запросу решений нет. Измените название.'
                      : (current.no_fit_message ?? 'Нет доступных кандидатов.')}
                  </p>
                )}
                {candidates.map((c) => (
                  <article
                    key={c.product.id}
                    aria-label={c.product.name}
                    className="overflow-hidden rounded-xl border border-line"
                  >
                    <div className="grid grid-cols-[150px_1fr]">
                      <div className="relative min-h-40" aria-label={`3D-модель: ${c.product.name}`}>
                        <RobotStage productId={c.product.id} solutionType={c.product.solution_type} />
                      </div>
                      <div className="min-w-0 space-y-2 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <ToneBadge tone={STATUS_TONE[c.status]}>{CANDIDATE_STATUS_LABEL[c.status]}</ToneBadge>
                          {current.recommended_product_id === c.product.id && (
                            <span className="text-xs font-medium">Выбор алгоритма</span>
                          )}
                        </div>
                        <Link
                          to={`/catalog/${c.product.id}`}
                          target="_blank"
                          className="block text-sm font-semibold hover:underline"
                        >
                          {c.product.name}
                        </Link>
                        <p className="text-xs text-ink-3">
                          {c.product.manufacturer.name} · {c.product.solution_type_name}
                        </p>
                        <p className="text-sm">
                          От {formatRub(c.product.price_from.amount_rub)} за единицу
                          {c.estimate?.robots_count != null && ` · ≈ ${c.estimate.robots_count} шт.`}
                        </p>
                        {c.estimate?.npv_rub != null && (
                          <p className="text-xs text-ink-3">
                            NPV покупки: {formatRub(c.estimate.npv_rub)} · окупаемость{' '}
                            {formatYears(c.estimate.payback_years)}
                          </p>
                        )}
                        {c.estimate?.sizing_issue && (
                          <p className="text-xs text-warn">
                            {c.estimate.sizing_issue} Количество задайте вручную после добавления.
                          </p>
                        )}
                        <div className="flex items-end justify-between gap-3">
                          <details className="min-w-0 flex-1 text-xs text-ink-3">
                            <summary className="cursor-pointer">Условия и недостающие данные</summary>
                            <ul className="mt-2 space-y-1">
                              {c.reasons
                                .filter((r) => r.severity !== 'info')
                                .map((r, i) => (
                                  <li key={`${r.code}-${i}`}>{r.text}</li>
                                ))}
                              {!c.reasons.some((r) => r.severity !== 'info') && (
                                <li>В известных данных ограничений не найдено.</li>
                              )}
                            </ul>
                          </details>
                          <Button
                            size="sm"
                            disabled={existing?.product_id === c.product.id}
                            onClick={() => {
                              onAdd(current.process_key, c)
                              setOpen(false)
                            }}
                          >
                            {existing?.product_id === c.product.id ? 'В составе' : existing ? 'Заменить' : 'Добавить'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

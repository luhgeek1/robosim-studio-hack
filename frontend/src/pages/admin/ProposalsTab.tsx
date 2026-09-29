import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Check, ChevronDown, Inbox, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PROPOSAL_STATUS_LABEL, PROPOSAL_STATUS_TONE, useProposalQueue, useReviewProposal } from '@/entities/vendor'
import type { Proposal } from '@/shared/api/types'
import { formatDateTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { EmptyState, ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { Switch } from '@/shared/ui/switch'
import { Textarea } from '@/shared/ui/textarea'
import { Pill, Segmented } from '@/shared/ui/v0'
import { ProposalDiff } from '@/pages/vendor/ProposalDiff'
import { proposalSummary } from '@/pages/vendor/proposal'
import { Note } from '@/pages/vendor/VendorProposalsTab'
import { SPRING, stagger } from './motion'

type Filter = 'pending' | 'all'

export function ProposalsTab() {
  const [filter, setFilter] = useState<Filter>('pending')
  const queue = useProposalQueue(filter === 'pending' ? 'pending' : undefined)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="meta max-w-xl">
          Производители предлагают правки своих карточек. Одобренная правка попадает в каталог с источником и поднимает
          его версию — сохранённые расчёты предложат пересчёт.
        </p>
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'pending', label: 'На модерации' },
            { value: 'all', label: 'Все' },
          ]}
        />
      </div>
      {queue.isPending && <LoadingBlock label="Загружаем заявки…" />}
      {queue.isError && <ErrorBlock error={queue.error} onRetry={() => queue.refetch()} />}
      {queue.data && queue.data.items.length === 0 && (
        <EmptyState
          icon={<Inbox size={22} />}
          title={filter === 'pending' ? 'Очередь пуста' : 'Заявок ещё не было'}
          description="Заявки появляются, когда производитель правит карточку в своём кабинете."
        />
      )}
      {queue.data && queue.data.items.length > 0 && (
        <ul className="space-y-2.5">
          <AnimatePresence initial={false}>
            {queue.data.items.map((proposal, i) => (
              <ReviewCard key={proposal.id} proposal={proposal} index={i} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}

function ReviewCard({ proposal, index }: { proposal: Proposal; index: number }) {
  const pending = proposal.status === 'pending'
  const [open, setOpen] = useState(pending && index === 0)
  const [comment, setComment] = useState('')
  const [confirmSpecs, setConfirmSpecs] = useState(false)
  const review = useReviewProposal()

  const decide = (decision: 'approve' | 'reject') =>
    review.mutate(
      {
        id: proposal.id,
        body: {
          decision,
          comment: comment.trim() || null,
          specs_status: confirmSpecs ? 'confirmed' : 'vendor_claim',
        },
      },
      {
        onSuccess: () =>
          decision === 'approve'
            ? toast.success(`«${proposal.product_name}»: правка в каталоге`, {
                description: 'Версия каталога обновлена, расчёты помечены устаревшими.',
              })
            : toast.success('Заявка отклонена', { description: 'Производитель увидит причину в своём кабинете.' }),
      },
    )

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -24, transition: { duration: 0.18 } }}
      transition={stagger(index)}
      className="card overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto_20px] items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-surface-2"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-medium">{proposal.product_name}</span>
          <span className="block truncate text-[12.5px] text-ink-3">
            {proposal.manufacturer.name} · {proposalSummary(proposal)} · {formatDateTime(proposal.created_at)}
          </span>
        </span>
        <Pill tone={PROPOSAL_STATUS_TONE[proposal.status]}>{PROPOSAL_STATUS_LABEL[proposal.status]}</Pill>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={SPRING} className="text-ink-4">
          <ChevronDown size={16} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-line px-5 pt-4 pb-5">
              {proposal.product_changed_since && (
                <div className="flex items-start gap-2 rounded-[12px] bg-warn-soft px-3.5 py-2.5 text-[13px] text-warn">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  Карточку меняли после подачи заявки: «было» ниже — текущее состояние, а не то, что видел
                  производитель.
                </div>
              )}
              <Note label={`Комментарий производителя${proposal.author ? ` · ${proposal.author.name}` : ''}`}>
                {proposal.comment}
              </Note>
              {proposal.review_comment && (
                <Note
                  label={`Решение${proposal.reviewer_name ? ` · ${proposal.reviewer_name}` : ''}`}
                  tone={proposal.status === 'rejected' ? 'crit' : 'ok'}
                >
                  {proposal.review_comment}
                </Note>
              )}
              <ProposalDiff proposal={proposal} />
              {pending && (
                <div className="space-y-3 rounded-[12px] bg-surface-2 px-4 py-3.5 ring-1 ring-line">
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Комментарий производителю — обязателен при отказе"
                    className="min-h-16 rounded-[10px] bg-card"
                    maxLength={2000}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {proposal.specs.length > 0 ? (
                      <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
                        <Switch size="sm" checked={confirmSpecs} onCheckedChange={setConfirmSpecs} />
                        Источник проверен — ТТХ подтверждены
                      </label>
                    ) : (
                      <span />
                    )}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        disabled={!comment.trim() || review.isPending}
                        onClick={() => decide('reject')}
                        title={comment.trim() ? undefined : 'Напишите причину отказа'}
                      >
                        <X /> Отклонить
                      </Button>
                      <Button disabled={review.isPending} onClick={() => decide('approve')}>
                        {review.isPending ? <Spinner /> : <Check />} Принять в каталог
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  )
}

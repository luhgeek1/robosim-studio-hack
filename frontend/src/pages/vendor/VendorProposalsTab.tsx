import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, FileClock, Undo2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { PROPOSAL_STATUS_LABEL, PROPOSAL_STATUS_TONE, useMyProposals, useWithdrawProposal } from '@/entities/vendor'
import type { Proposal } from '@/shared/api/types'
import { formatDateTime } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm'
import { EmptyState, ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { Pill } from '@/shared/ui/v0'
import { SPRING, stagger } from '@/pages/admin/motion'
import { proposalSummary } from './proposal'
import { ProposalDiff } from './ProposalDiff'

export function VendorProposalsTab() {
  const proposals = useMyProposals()
  if (proposals.isPending) return <LoadingBlock label="Загружаем заявки…" />
  if (proposals.isError) return <ErrorBlock error={proposals.error} onRetry={() => proposals.refetch()} />
  if (proposals.data.items.length === 0)
    return (
      <EmptyState
        icon={<FileClock size={22} />}
        title="Заявок пока нет"
        description="Предложите правку карточки во вкладке «Продукты» — здесь появится её статус и решение модератора."
      />
    )
  return (
    <ul className="space-y-2.5">
      {proposals.data.items.map((proposal, i) => (
        <ProposalCard key={proposal.id} proposal={proposal} index={i} />
      ))}
    </ul>
  )
}

function ProposalCard({ proposal, index }: { proposal: Proposal; index: number }) {
  const [open, setOpen] = useState(false)
  const withdraw = useWithdrawProposal()
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
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
            {proposalSummary(proposal)} · {formatDateTime(proposal.created_at)}
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
              <Note label="Ваш комментарий">{proposal.comment}</Note>
              {proposal.review_comment && (
                <Note
                  label={`Решение модератора${proposal.reviewer_name ? ` · ${proposal.reviewer_name}` : ''}`}
                  tone={proposal.status === 'rejected' ? 'crit' : 'ok'}
                >
                  {proposal.review_comment}
                </Note>
              )}
              <ProposalDiff proposal={proposal} />
              {proposal.status === 'pending' && (
                <div className="flex justify-end">
                  <ConfirmDialog
                    title="Отозвать заявку?"
                    description="Модератор её не увидит. Правку можно будет отправить заново."
                    confirmText="Отозвать"
                    onConfirm={() => withdraw.mutateAsync(proposal.id).then(() => toast.success('Заявка отозвана'))}
                    trigger={
                      <Button variant="ghost" size="sm">
                        <Undo2 /> Отозвать
                      </Button>
                    }
                  />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  )
}

export function Note({ label, tone, children }: { label: string; tone?: 'ok' | 'crit' | 'warn'; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-[12px] px-3.5 py-2.5 text-[13.5px] leading-relaxed',
        tone === 'crit' && 'bg-crit-soft',
        tone === 'ok' && 'bg-ok-soft',
        tone === 'warn' && 'bg-warn-soft',
        !tone && 'bg-surface-2',
      )}
    >
      <div className="hud mb-0.5">{label}</div>
      {children}
    </div>
  )
}

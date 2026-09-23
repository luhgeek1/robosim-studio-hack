import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import type { Candidate } from '@/api/types'
import { Button, Modal } from '@/components/ui'
import { useStore } from '@/store'
import { groupReasons, shortName } from './model'
import { RiskList } from './Reasons'

const firstProblem = (c: Candidate) =>
  c.reasons.find((r) => r.severity === 'blocking')?.text ?? c.reasons.find((r) => r.severity === 'warning')?.text ?? ''

export function ExcludedList({ candidates, onAdd }: { candidates: Candidate[]; onAdd: (c: Candidate) => void }) {
  const [open, setOpen] = useState(false)
  const openProduct = useStore((s) => s.openProduct)
  if (!candidates.length) return null
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink"
        aria-expanded={open}
      >
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        Не подходят по жёстким ограничениям: <span className="num">{candidates.length}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-2 divide-y divide-line overflow-hidden rounded-[12px] border border-line bg-surface"
          >
            {candidates.map((c) => {
              const problem = firstProblem(c)
              return (
                <li key={c.product.id} className="flex items-center gap-4 px-4 py-2.5 text-[13px]">
                  <span className="w-[150px] shrink-0 truncate font-medium text-ink-2" title={c.product.name}>
                    {shortName(c.product.name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink-3" title={problem}>
                    {problem}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 text-accent hover:underline"
                    onClick={() => openProduct(c.product.id)}
                  >
                    детали
                  </button>
                  <button
                    type="button"
                    className="shrink-0 font-medium text-ink-2 hover:text-ink hover:underline"
                    onClick={() => onAdd(c)}
                  >
                    Всё равно добавить
                  </button>
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

// ТЗ 3.4.4: the user sees every reason for exclusion before the product joins the comparison.
export function ManualAddModal({
  candidate,
  pending,
  onCancel,
  onConfirm,
}: {
  candidate: Candidate | null
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal
      open={Boolean(candidate)}
      onClose={onCancel}
      title={candidate ? `Добавить «${shortName(candidate.product.name)}» вручную?` : ''}
      lead="Решение не прошло жёсткие проверки объекта. Его можно добавить в сравнение: оно останется в списке с пометкой «добавлен вручную» и с причинами исключения."
    >
      {candidate && (
        <>
          <div className="mb-2 text-[13px] font-medium text-ink-2">Почему не подходит</div>
          <RiskList groups={groupReasons(candidate)} />
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>
              Отмена
            </Button>
            <Button variant="primary" disabled={pending} onClick={onConfirm}>
              {pending ? 'Добавляем…' : 'Добавить с предупреждением'}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}

import { AnimatePresence, motion } from 'framer-motion'
import { GitCompareArrows, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui'
import { COMPARE_LIMIT, compareUrl, useCompareSelection } from './compareSelection'

export function CompareBar() {
  const selection = useCompareSelection()
  const navigate = useNavigate()
  const enough = selection.items.length >= 2
  return (
    <AnimatePresence>
      {selection.items.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ type: 'spring', stiffness: 400, damping: 34 }}
          className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-4"
        >
          <div className="pointer-events-auto flex w-full max-w-[920px] items-center gap-4 rounded-[14px] border border-line bg-surface/95 px-4 py-2.5 shadow-float backdrop-blur">
            <div className="shrink-0 text-[12px] leading-tight text-ink-3">
              Сравнение
              <div className="num text-[14px] font-medium text-ink">
                {selection.items.length} из {COMPARE_LIMIT}
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {selection.items.map((item) => (
                <span
                  key={item.id}
                  className="inline-flex max-w-[220px] items-center gap-1 rounded-full bg-black/[0.05] py-0.5 pr-1 pl-2.5 text-[12.5px]"
                >
                  <Link to={`/catalog/${item.id}`} className="truncate hover:underline" title={item.name}>
                    {item.name}
                  </Link>
                  <button
                    type="button"
                    onClick={() => selection.remove(item.id)}
                    className="rounded-full p-0.5 text-ink-3 hover:bg-black/[0.06] hover:text-ink"
                    aria-label={`Убрать «${item.name}» из сравнения`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={() => selection.clear()}>
              Очистить
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<GitCompareArrows size={14} />}
              disabled={!enough}
              title={enough ? undefined : 'Выберите ещё хотя бы одно решение'}
              onClick={() => navigate(compareUrl(selection.ids))}
            >
              Сравнить
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

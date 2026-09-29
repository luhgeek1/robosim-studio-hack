import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpRight, Clock, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useVendorOverview } from '@/entities/vendor'
import type { VendorProduct } from '@/shared/api/types'
import { formatNumber, formatPct, formatRub, pluralRu } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { EmptyState } from '@/shared/ui/states'
import { Switch } from '@/shared/ui/switch'
import { ConfidenceRing, Pill } from '@/shared/ui/v0'
import { ProductStatusMark } from '@/pages/catalog/parts'
import { stagger } from '@/pages/admin/motion'
import { ProposalEditor, type ProposalTarget } from './ProposalEditor'

const COLUMNS = 'grid-cols-[minmax(0,1fr)_110px_110px_84px_176px]'
const GAP_CHIPS = 3

export function VendorProductsTab() {
  const overview = useVendorOverview()
  const [params, setParams] = useSearchParams()
  const onlyGaps = params.get('gaps') === '1'
  const [target, setTarget] = useState<ProposalTarget | null>(null)
  if (!overview.data) return null

  const products = overview.data.products.filter((p) => !onlyGaps || p.missing_key_specs.length > 0)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="meta max-w-xl">
          Правки не меняют каталог сразу: администратор сверяет их с источником, и после одобрения карточка обновится у
          всех покупателей, а их расчёты предложат пересчёт.
        </p>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
            <Switch
              size="sm"
              checked={onlyGaps}
              onCheckedChange={(checked) => setParams(checked ? { gaps: '1' } : {}, { replace: true })}
            />
            только с пробелами
          </label>
          <Button onClick={() => setTarget({ mode: 'new' })}>
            <Plus /> Предложить новый продукт
          </Button>
        </div>
      </div>

      {products.length === 0 ? (
        <EmptyState
          title={onlyGaps ? 'Пробелов нет' : 'Продуктов в каталоге нет'}
          description={
            onlyGaps
              ? 'Ключевые характеристики заполнены у всех продуктов.'
              : 'Предложите первый продукт — после одобрения он появится в каталоге и подборе.'
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div
            className={`grid ${COLUMNS} items-center gap-4 border-b border-line bg-surface-2 px-5 py-2.5 text-[12px] text-ink-3`}
          >
            <span>Продукт</span>
            <span className="text-right">Цена от</span>
            <span className="text-right">Проектов / сценариев</span>
            <span className="text-right">Полнота</span>
            <span />
          </div>
          <ul className="divide-y divide-line">
            <AnimatePresence initial={false}>
              {products.map((item, i) => (
                <ProductRow
                  key={item.product.id}
                  item={item}
                  index={i}
                  onPropose={(tab) => setTarget({ mode: 'edit', id: item.product.id, tab })}
                />
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}

      <ProposalEditor target={target} onClose={() => setTarget(null)} />
    </div>
  )
}

function ProductRow({
  item,
  index,
  onPropose,
}: {
  item: VendorProduct
  index: number
  onPropose: (tab?: 'card' | 'specs') => void
}) {
  const { product, missing_key_specs: gaps } = item
  const pending = Boolean(item.pending_proposal_id)
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={stagger(index)}
      className={`grid ${COLUMNS} items-center gap-4 px-5 py-3.5`}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <Link
            to={`/catalog/${product.id}`}
            className="truncate text-[14px] font-medium underline-offset-2 hover:underline"
          >
            {product.name}
          </Link>
          <ArrowUpRight size={13} className="shrink-0 text-ink-4" />
        </span>
        <span className="flex items-center gap-1.5 truncate text-[12.5px] text-ink-3">
          {product.solution_type_name} · <ProductStatusMark status={product.status} />
        </span>
        {gaps.length > 0 && (
          <span className="mt-1.5 flex flex-wrap items-center gap-1">
            {gaps.slice(0, GAP_CHIPS).map((gap) => (
              <span
                key={gap.key}
                className="rounded-full bg-crit-soft px-2 py-0.5 text-[11.5px] font-medium text-crit"
                title="Ключевая характеристика без значения"
              >
                {gap.name}
              </span>
            ))}
            {gaps.length > GAP_CHIPS && (
              <span className="text-[11.5px] text-ink-3">
                ещё {gaps.length - GAP_CHIPS} {pluralRu(gaps.length - GAP_CHIPS, ['пробел', 'пробела', 'пробелов'])}
              </span>
            )}
          </span>
        )}
      </span>
      <span className="num text-right text-[13.5px]">
        {product.price_from.amount_rub > 0 ? formatRub(product.price_from.amount_rub) : '—'}
      </span>
      <span className="num text-right text-[13px] text-ink-2">
        {formatNumber(item.relevant_projects)} / {formatNumber(item.scenarios_count)}
      </span>
      <span className="flex items-center justify-end gap-1.5 text-[12.5px] text-ink-2">
        <ConfidenceRing value={product.completeness * 100} size={14} />
        <span className="num">{formatPct(product.completeness, { share: true, digits: 0 })}</span>
      </span>
      <span className="flex justify-end">
        {pending ? (
          <Pill tone="warn">
            <Clock /> На модерации
          </Pill>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="rounded-[9px]"
            onClick={() => onPropose(gaps.length ? 'specs' : 'card')}
          >
            <Pencil /> {gaps.length ? 'Заполнить ТТХ' : 'Предложить правку'}
          </Button>
        )}
      </span>
    </motion.li>
  )
}

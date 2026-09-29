import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { useVendorFit } from '@/entities/vendor'
import type { VendorProduct } from '@/shared/api/types'
import { formatNumber, pluralRu } from '@/shared/lib/format'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { stagger } from '@/pages/admin/motion'
import { Empty, Panel } from '@/pages/admin/panels'

const SEGMENTS = [
  { key: 'fit', label: 'подходит', className: 'bg-ok' },
  { key: 'check', label: 'требует проверки', className: 'bg-warn' },
  { key: 'excluded', label: 'исключён', className: 'bg-crit' },
  { key: 'manual', label: 'добавлен вручную', className: 'bg-ink-4' },
] as const

/* Как продукты проходят подбор в проектах платформы: вердикты, частые причины исключения и ТТХ, которых не хватило
   для проверки. Только счётчики — чьи это проекты, вендор не видит. */
export function FitPanel({ products }: { products: VendorProduct[] }) {
  const fit = useVendorFit()
  const names = new Map(products.map((p) => [p.product.id, p.product.name]))
  const note = fit.data
    ? `По ${formatNumber(fit.data.projects_analysed)} ${pluralRu(fit.data.projects_analysed, ['последнему проекту', 'последним проектам', 'последним проектам'])} платформы с вашими объектами`
    : 'Прогоняем подбор по проектам платформы'
  const rows = (fit.data?.products ?? []).filter((p) => p.appearances > 0).sort((a, b) => b.appearances - a.appearances)
  const absent = (fit.data?.products ?? []).filter((p) => p.appearances === 0)

  return (
    <Panel title="Как продукты проходят подбор" note={note}>
      {fit.isPending && <LoadingBlock label="Считаем подбор по проектам…" />}
      {fit.isError && <ErrorBlock error={fit.error} onRetry={() => fit.refetch()} />}
      {fit.data && rows.length === 0 && <Empty>Ваши продукты пока не попадали в подбор проектов</Empty>}
      {rows.length > 0 && (
        <>
          <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
            {SEGMENTS.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5">
                <span className={`size-2 rounded-full ${s.className}`} /> {s.label}
              </span>
            ))}
          </div>
          <ul className="divide-y divide-line">
            {rows.map((item, i) => (
              <motion.li
                key={item.product_id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={stagger(i)}
                className="grid gap-x-6 gap-y-2 py-3 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
              >
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13.5px] font-medium">{names.get(item.product_id)}</span>
                    <span className="num shrink-0 text-[12px] text-ink-3">
                      {formatNumber(item.appearances)} {pluralRu(item.appearances, ['раз', 'раза', 'раз'])} в подборе
                      {item.top3 > 0 && ` · в тройке лучших ${formatNumber(item.top3)}`}
                    </span>
                  </div>
                  <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-black/5">
                    {SEGMENTS.map((s) =>
                      item[s.key] > 0 ? (
                        <motion.span
                          key={s.key}
                          initial={{ width: 0 }}
                          animate={{ width: `${(item[s.key] / item.appearances) * 100}%` }}
                          transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                          className={s.className}
                          title={`${s.label}: ${item[s.key]}`}
                        />
                      ) : null,
                    )}
                  </div>
                </div>
                <div className="min-w-0 space-y-1 text-[12.5px]">
                  {item.blocking.slice(0, 2).map((r) => (
                    <div key={`${r.code}-${r.spec_key}`} className="flex gap-2">
                      <span className="num shrink-0 text-crit">×{r.count}</span>
                      <span className="min-w-0 text-ink-2">{r.text}</span>
                    </div>
                  ))}
                  {item.missing.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-3">
                      Не хватило для проверки:
                      {item.missing.slice(0, 3).map((m) => (
                        <span
                          key={m.spec_key}
                          className="rounded-full bg-warn-soft px-2 py-0.5 text-[11.5px] text-warn"
                        >
                          {m.name} ×{m.count}
                        </span>
                      ))}
                      <Link
                        to="/vendor/products?gaps=1"
                        className="inline-flex items-center gap-0.5 font-medium text-ink-2 hover:text-ink"
                      >
                        заполнить <ArrowRight size={12} />
                      </Link>
                    </div>
                  )}
                  {item.blocking.length === 0 && item.missing.length === 0 && (
                    <span className="text-ink-3">Проверки подбора пройдены без замечаний</span>
                  )}
                </div>
              </motion.li>
            ))}
          </ul>
          {absent.length > 0 && (
            <p className="meta mt-3">
              Не были кандидатами: {absent.map((p) => names.get(p.product_id)).join(', ')} — объекты или процессы этих
              проектов не совпадают с карточкой.
            </p>
          )}
        </>
      )}
    </Panel>
  )
}

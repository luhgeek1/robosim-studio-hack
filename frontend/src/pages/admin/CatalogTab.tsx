import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  EyeOff,
  FileUp,
  MoreHorizontal,
  Pencil,
  Plus,
  Ruler,
  Search,
  SearchX,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useDeleteProduct, useSolutionTypes } from '@/entities/admin'
import { useProducts } from '@/entities/catalog'
import type { Product } from '@/shared/api/types'
import { formatDate, formatNumber, formatPct, formatRub } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { EmptyState, ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { ConfidenceRing } from '@/shared/ui/v0'
import { ProductStatusMark } from '@/pages/catalog/parts'
import { CatalogImportDialog } from './CatalogImportDialog'
import { stagger } from './motion'
import { ProductEditor, type EditorTarget } from './ProductEditor'

const PAGE_SIZE = 25
const ALL = '__all'
const SEARCH_DEBOUNCE_MS = 300
const COLUMNS = 'grid-cols-[minmax(0,1fr)_200px_120px_120px_84px_36px]'

export function CatalogTab() {
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [type, setType] = useState(ALL)
  const [page, setPage] = useState(1)
  const [target, setTarget] = useState<EditorTarget | null>(null)
  const [importing, setImporting] = useState(false)
  const solutionTypes = useSolutionTypes()

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(search.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [search])

  const products = useProducts({
    q: q || undefined,
    solution_type: type === ALL ? undefined : [type],
    sort: q ? 'relevance' : 'updated',
    page,
    page_size: PAGE_SIZE,
  })
  const total = products.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-80 max-w-full max-sm:w-full">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-4" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Название или описание"
            className="h-9 rounded-[10px] bg-card pl-9"
            aria-label="Поиск решения"
          />
        </div>
        <Select
          value={type}
          onValueChange={(value) => {
            setType(value)
            setPage(1)
          }}
        >
          <SelectTrigger
            className="h-9 w-64 rounded-[10px] bg-card max-sm:min-w-0 max-sm:flex-1"
            aria-label="Тип решения"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value={ALL}>Все типы решений</SelectItem>
            {(solutionTypes.data ?? []).map((t) => (
              <SelectItem key={t.key} value={t.key}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button className="ml-auto" variant="outline" onClick={() => setImporting(true)}>
          <FileUp /> Обновить из файла
        </Button>
        <Button onClick={() => setTarget({ mode: 'create' })}>
          <Plus /> Добавить решение
        </Button>
      </div>

      {products.isPending && <LoadingBlock label="Загружаем каталог…" />}
      {products.isError && <ErrorBlock error={products.error} onRetry={() => products.refetch()} />}
      {products.data && products.data.items.length === 0 && (
        <EmptyState
          icon={<SearchX size={22} />}
          title="Ничего не нашли"
          description="Измените запрос или тип решения."
        />
      )}
      {products.data && products.data.items.length > 0 && (
        <>
          <div className="card overflow-hidden">
            {/* Шесть колонок не сжимаются в столбик по слову: на узком экране таблица листается вбок внутри карточки. */}
            <div className="scroll-thin overflow-x-auto overscroll-x-contain">
              <div className="min-w-[880px]">
                <div
                  className={`grid ${COLUMNS} items-center gap-4 border-b border-line bg-surface-2 px-5 py-2.5 text-[12px] text-ink-3`}
                >
                  <span>Решение</span>
                  <span>Тип</span>
                  <span>Стадия</span>
                  <span className="text-right">Цена от</span>
                  <span className="text-right">Полнота</span>
                  <span />
                </div>
                <ul className="divide-y divide-line">
                  <AnimatePresence initial={false} mode="popLayout">
                    {products.data.items.map((product, i) => (
                      <ProductRow
                        key={product.id}
                        product={product}
                        index={i}
                        onEdit={(tab) => setTarget({ mode: 'edit', id: product.id, tab })}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12.5px] text-ink-3">
            <span className="num">
              {formatNumber((page - 1) * PAGE_SIZE + 1)}–{formatNumber(Math.min(page * PAGE_SIZE, total))} из{' '}
              {formatNumber(total)} · сначала изменённые недавно
            </span>
            {pages > 1 && (
              <span className="flex items-center gap-1">
                <span className="num mr-1">
                  {page} / {pages}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  aria-label="Назад"
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={page >= pages}
                  onClick={() => setPage(page + 1)}
                  aria-label="Дальше"
                >
                  <ChevronRight />
                </Button>
              </span>
            )}
          </div>
        </>
      )}

      <ProductEditor target={target} onClose={() => setTarget(null)} />
      <CatalogImportDialog open={importing} onOpenChange={setImporting} />
    </div>
  )
}

function ProductRow({
  product,
  index,
  onEdit,
}: {
  product: Product
  index: number
  onEdit: (tab?: 'card' | 'offers' | 'specs') => void
}) {
  const navigate = useNavigate()
  const remove = useDeleteProduct()
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -24, transition: { duration: 0.18 } }}
      transition={stagger(index)}
      className={`group grid ${COLUMNS} cursor-pointer items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-2`}
      onClick={() => onEdit()}
    >
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium group-hover:text-ink">{product.name}</span>
        <span className="block truncate text-[12.5px] text-ink-3">
          {product.manufacturer.name} · {formatDate(product.updated_at)}
        </span>
      </span>
      <span className="truncate text-[13px] text-ink-2" title={product.solution_type_name}>
        {product.solution_type_name}
      </span>
      <ProductStatusMark status={product.status} className="text-[13px] text-ink-2" />
      <span className="num text-right text-[13.5px]">
        {product.price_from.amount_rub > 0 ? formatRub(product.price_from.amount_rub) : '—'}
      </span>
      <span className="flex items-center justify-end gap-1.5 text-[12.5px] text-ink-2">
        <ConfidenceRing value={product.completeness * 100} size={14} />
        <span className="num">{formatPct(product.completeness, { share: true, digits: 0 })}</span>
      </span>
      <span onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="text-ink-4" aria-label="Действия с решением">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-48">
            <DropdownMenuItem onSelect={() => onEdit('card')}>
              <Pencil /> Редактировать карточку
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onEdit('specs')}>
              <Ruler /> Характеристики
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate(`/catalog/${product.id}`)}>Открыть в каталоге</DropdownMenuItem>
            <DropdownMenuSeparator />
            <ConfirmDialog
              title={`Скрыть «${product.name}»?`}
              description="Решение пропадёт из каталога и подбора. Сохранённые расчёты, где оно использовано, останутся как были."
              confirmText="Скрыть"
              onConfirm={() =>
                remove.mutateAsync(product.id).then(() => toast.success(`«${product.name}» скрыт из каталога`))
              }
              trigger={
                <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                  <EyeOff /> Скрыть из каталога
                </DropdownMenuItem>
              }
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </motion.li>
  )
}

import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { useCreateProduct, useUpdateProduct } from '@/entities/admin'
import { useProduct } from '@/entities/catalog'
import type { ProductWrite } from '@/shared/api/types'
import { formatDateTime, formatPct } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/shared/ui/sheet'
import { ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { ConfidenceRing, Segmented } from '@/shared/ui/v0'
import { CardForm } from './CardForm'
import { OffersEditor } from './OffersEditor'
import { clean, emptyProduct, toProductWrite, validateProduct, type ProductErrors } from './productForm'
import { SpecsEditor } from './SpecsEditor'

type Tab = 'card' | 'offers' | 'specs'
export type EditorTarget = { mode: 'create' } | { mode: 'edit'; id: string; tab?: Tab }

export function ProductEditor({ target, onClose }: { target: EditorTarget | null; onClose: () => void }) {
  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 p-0 data-[side=right]:sm:max-w-170">
        {target && <EditorBody key={target.mode === 'edit' ? target.id : 'new'} target={target} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  )
}

function EditorBody({ target, onClose }: { target: EditorTarget; onClose: () => void }) {
  const [createdId, setCreatedId] = useState<string | null>(null)
  const id = target.mode === 'edit' ? target.id : createdId
  const product = useProduct(id ?? undefined)
  const create = useCreateProduct()
  const update = useUpdateProduct()
  const [tab, setTab] = useState<Tab>(target.mode === 'edit' ? (target.tab ?? 'card') : 'card')
  // Пока администратор ничего не менял, форма — это карточка с сервера; первая правка делает её черновиком.
  const [draft, setDraft] = useState<ProductWrite | null>(target.mode === 'create' ? emptyProduct() : null)
  const [errors, setErrors] = useState<ProductErrors>({})
  const [dirty, setDirty] = useState(false)

  const form = draft ?? (product.data ? toProductWrite(product.data) : null)

  const change = (patch: Partial<ProductWrite>) => {
    if (form) setDraft({ ...form, ...patch })
    setDirty(true)
    setErrors((prev) => {
      const next = { ...prev }
      for (const key of Object.keys(patch)) delete next[key as keyof ProductErrors]
      return next
    })
  }

  const save = () => {
    if (!form) return
    const found = validateProduct(form)
    setErrors(found)
    if (Object.keys(found).length) {
      if (found.offers && !found.name && !found.manufacturer_name && !found.solution_type) setTab('offers')
      else setTab('card')
      return
    }
    const body = clean(form)
    if (id) {
      update.mutate(
        { id, body },
        {
          onSuccess: (saved) => {
            setDraft(toProductWrite(saved))
            setDirty(false)
            toast.success('Карточка сохранена', {
              description: 'Версия каталога обновлена, расчёты помечены устаревшими.',
            })
          },
        },
      )
    } else {
      create.mutate(body, {
        onSuccess: (saved) => {
          setCreatedId(saved.id)
          setDraft(toProductWrite(saved))
          setDirty(false)
          setTab('specs')
          toast.success(`«${saved.name}» добавлен в каталог`, {
            description: 'Заполните ключевые ТТХ — от них зависит подбор.',
          })
        },
      })
    }
  }

  const detail = product.data
  const title = form?.name.trim() || detail?.name || 'Новое решение'
  const pending = create.isPending || update.isPending

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-line px-6 pt-5 pb-4">
        <div className="flex items-start justify-between gap-4 pr-8">
          <div className="min-w-0">
            <SheetTitle className="truncate text-[20px] font-semibold tracking-[-0.02em]">{title}</SheetTitle>
            <SheetDescription className="mt-0.5 text-[12.5px]">
              {detail
                ? `${detail.manufacturer.name} · изменён ${formatDateTime(detail.updated_at)}`
                : 'Ручное добавление решения в каталог (ТЗ 3.3.5)'}
            </SheetDescription>
          </div>
          {detail && (
            <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-ink-2" title="Полнота карточки">
              <ConfidenceRing value={detail.completeness * 100} size={16} />
              <span className="num">{formatPct(detail.completeness, { share: true, digits: 0 })}</span>
            </span>
          )}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <Segmented
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'card', label: 'Карточка' },
              { value: 'offers', label: `Цены${form?.offers?.length ? ` · ${form.offers.length}` : ''}` },
              { value: 'specs', label: 'ТТХ', disabled: !id, hint: id ? undefined : 'Сначала сохраните карточку' },
            ]}
          />
          {id && (
            <Link
              to={`/catalog/${id}`}
              className="flex items-center gap-1 text-[12.5px] font-medium text-ink-3 transition-colors hover:text-ink"
            >
              В каталоге <ArrowUpRight size={13} />
            </Link>
          )}
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 pt-5">
        {id && product.isPending && <LoadingBlock label="Загружаем карточку…" />}
        {product.isError && <ErrorBlock error={product.error} onRetry={() => product.refetch()} />}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12, transition: { duration: 0.1 } }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="pb-6"
          >
            {form && tab === 'card' && <CardForm form={form} errors={errors} onChange={change} />}
            {form && tab === 'offers' && (
              <OffersEditor
                offers={form.offers ?? []}
                error={errors.offers}
                onChange={(offers) => change({ offers })}
              />
            )}
            {tab === 'specs' && detail && <SpecsEditor product={detail} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {tab !== 'specs' && (
        <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-2 px-6 py-3.5">
          <span className="text-[12.5px] text-ink-3">
            {dirty ? 'Есть несохранённые изменения' : id ? 'Все изменения сохранены' : 'Заполните карточку и цены'}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Закрыть
            </Button>
            <Button onClick={save} disabled={pending || (!dirty && Boolean(id))}>
              {pending && <Spinner />} {id ? 'Сохранить' : 'Добавить в каталог'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

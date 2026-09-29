import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { toast } from 'sonner'
import { useSpecKeys } from '@/entities/admin'
import { useProduct } from '@/entities/catalog'
import { useCreateProposal, useVendorOverview } from '@/entities/vendor'
import type { ProductDetail, ProductWrite } from '@/shared/api/types'
import { pluralRu } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/shared/ui/sheet'
import { ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { Switch } from '@/shared/ui/switch'
import { Textarea } from '@/shared/ui/textarea'
import { Segmented } from '@/shared/ui/v0'
import { CardForm } from '@/pages/admin/CardForm'
import { Field } from '@/pages/admin/fields'
import { OffersEditor } from '@/pages/admin/OffersEditor'
import { clean, emptyProduct, toProductWrite, validateProduct, type ProductErrors } from '@/pages/admin/productForm'
import { SourceFields, SpecsList } from '@/pages/admin/SpecsForm'
import { changedEdits, emptySource, toSpecWrites, type SpecEdit, type SpecEdits } from '@/pages/admin/specs'

type Tab = 'card' | 'offers' | 'specs'
export type ProposalTarget = { mode: 'new' } | { mode: 'edit'; id: string; tab?: Tab }

export function ProposalEditor({ target, onClose }: { target: ProposalTarget | null; onClose: () => void }) {
  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 p-0 data-[side=right]:sm:max-w-170">
        {target && <EditorBody key={target.mode === 'edit' ? target.id : 'new'} target={target} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  )
}

function EditorBody({ target, onClose }: { target: ProposalTarget; onClose: () => void }) {
  const product = useProduct(target.mode === 'edit' ? target.id : undefined)
  if (target.mode === 'edit' && product.isPending) return <LoadingBlock className="p-8" label="Загружаем карточку…" />
  if (product.isError) return <ErrorBlock error={product.error} onRetry={() => product.refetch()} />
  return <Form target={target} detail={product.data ?? null} onClose={onClose} />
}

function Form({
  target,
  detail,
  onClose,
}: {
  target: ProposalTarget
  detail: ProductDetail | null
  onClose: () => void
}) {
  const overview = useVendorOverview()
  const specKeys = useSpecKeys()
  const create = useCreateProposal()
  const company = overview.data?.manufacturer
  const [original] = useState<ProductWrite>(() =>
    detail
      ? toProductWrite(detail)
      : { ...emptyProduct(), manufacturer_name: company?.name ?? '', manufacturer_country: company?.country ?? 'RU' },
  )
  const [form, setForm] = useState<ProductWrite>(original)
  const [tab, setTab] = useState<Tab>(target.mode === 'edit' ? (target.tab ?? 'card') : 'card')
  const [errors, setErrors] = useState<ProductErrors>({})
  const [edits, setEdits] = useState<SpecEdits>({})
  const [source, setSource] = useState(emptySource)
  const [onlyMissing, setOnlyMissing] = useState(target.mode === 'edit' && target.tab === 'specs')
  const [comment, setComment] = useState('')

  const isNew = detail === null
  const cardChanged = isNew || JSON.stringify(clean(form)) !== JSON.stringify(clean(original))
  const specs = changedEdits(edits)
  const hasChanges = cardChanged || specs.length > 0
  const needsSource = specs.length > 0 && !source.title.trim()

  const change = (patch: Partial<ProductWrite>) => {
    setForm((prev) => ({ ...prev, ...patch }))
    setErrors((prev) => {
      const next = { ...prev }
      for (const key of Object.keys(patch)) delete next[key as keyof ProductErrors]
      return next
    })
  }
  const edit = (key: string, patch: Partial<SpecEdit>) =>
    setEdits((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { text: '', status: 'vendor_claim' }), ...patch } }))

  const submit = () => {
    if (cardChanged) {
      const found = validateProduct(form)
      setErrors(found)
      if (Object.keys(found).length) {
        setTab(found.offers && !found.name && !found.solution_type ? 'offers' : 'card')
        return
      }
    }
    create.mutate(
      {
        product_id: detail?.id ?? null,
        card: cardChanged ? clean(form) : null,
        specs: toSpecWrites(edits, source, specKeys.data),
        comment: comment.trim(),
      },
      {
        onSuccess: () => {
          toast.success('Заявка отправлена на модерацию', {
            description: 'Администратор сверит данные с источником; решение появится во вкладке «Заявки».',
          })
          onClose()
        },
      },
    )
  }

  const summary = [
    cardChanged && (isNew ? 'новая карточка' : 'карточка и цены'),
    specs.length > 0 &&
      `${specs.length} ${pluralRu(specs.length, ['характеристика', 'характеристики', 'характеристик'])}`,
  ]
    .filter(Boolean)
    .join(' и ')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-line px-6 pt-5 pb-4">
        <div className="hud mb-1.5">{isNew ? 'Новый продукт' : 'Правка карточки'} · на модерацию</div>
        <SheetTitle className="truncate pr-8 text-[20px] font-semibold tracking-[-0.02em]">
          {form.name.trim() || detail?.name || 'Новый продукт'}
        </SheetTitle>
        <SheetDescription className="mt-0.5 text-[12.5px]">
          {company?.name} · значения ТТХ уйдут со статусом «заявка производителя»
        </SheetDescription>
        <div className="mt-4">
          <Segmented
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'card', label: 'Карточка' },
              { value: 'offers', label: `Цены${form.offers?.length ? ` · ${form.offers.length}` : ''}` },
              {
                value: 'specs',
                label: `ТТХ${specs.length ? ` · ${specs.length}` : ''}`,
                disabled: isNew,
                hint: isNew ? 'Характеристики — после одобрения карточки' : undefined,
              },
            ]}
          />
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 pt-5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12, transition: { duration: 0.1 } }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="pb-6"
          >
            {tab === 'card' && <CardForm form={form} errors={errors} onChange={change} vendor />}
            {tab === 'offers' && (
              <OffersEditor
                offers={form.offers ?? []}
                error={errors.offers}
                onChange={(offers) => change({ offers })}
              />
            )}
            {tab === 'specs' && detail && (
              <>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="meta max-w-sm">
                    Укажите источник — паспорт изделия или страницу на сайте. Ключевые ТТХ участвуют в проверках
                    подбора.
                  </p>
                  <label className="flex shrink-0 items-center gap-2 text-[12.5px] text-ink-2">
                    <Switch checked={onlyMissing} onCheckedChange={setOnlyMissing} size="sm" /> только пустые
                  </label>
                </div>
                {specKeys.isPending ? (
                  <LoadingBlock label="Загружаем словарь характеристик…" />
                ) : (
                  <SpecsList
                    product={detail}
                    specKeys={specKeys.data ?? []}
                    edits={edits}
                    onEdit={edit}
                    onlyMissing={onlyMissing}
                    lockedStatus="vendor_claim"
                  />
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="space-y-3 border-t border-line bg-surface-2 px-6 pt-4 pb-4">
        <AnimatePresence initial={false}>
          {specs.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <SourceFields source={source} onChange={setSource} />
            </motion.div>
          )}
        </AnimatePresence>
        <Field label="Комментарий для модератора">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Что изменилось и почему: новая прошивка, прайс с 1 октября, паспорт 2026 года…"
            className="min-h-16 rounded-[10px] bg-card"
            maxLength={2000}
          />
        </Field>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12.5px] text-ink-3">
            {hasChanges ? `В заявке: ${summary}` : 'Измените карточку, цены или характеристики'}
            {needsSource && <span className="text-crit"> · укажите источник ТТХ</span>}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              Отмена
            </Button>
            <Button onClick={submit} disabled={!hasChanges || needsSource || !comment.trim() || create.isPending}>
              {create.isPending && <Spinner />} Отправить на модерацию
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

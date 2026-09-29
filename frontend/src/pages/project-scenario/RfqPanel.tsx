import { AnimatePresence, motion } from 'framer-motion'
import { Check, Send } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { RFQ_STATUS_LABEL, RFQ_STATUS_TONE, useCreateRfq, useProjectRfqs } from '@/entities/vendor'
import type { Rfq, Scenario } from '@/shared/api/types'
import { formatDate, formatRub, pluralRu } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Spinner } from '@/shared/ui/states'
import { Switch } from '@/shared/ui/switch'
import { Textarea } from '@/shared/ui/textarea'
import { Pill } from '@/shared/ui/v0'

const SPRING = { type: 'spring', stiffness: 320, damping: 24 } as const

/* Запрос КП у производителей решений сценария: цена и срок поставки приходят в проект, и цену можно подставить
   в расчёт как «свою» с причиной — экономика сразу считается на предложении, а не на цене каталога. */
export function RfqPanel({
  projectId,
  scenario,
  onApplyPrice,
}: {
  projectId: string
  scenario: Scenario
  onApplyPrice: (productId: string, price: number, reason: string) => void
}) {
  const rfqs = useProjectRfqs(projectId)
  const [open, setOpen] = useState(false)
  const mine = (rfqs.data?.items ?? []).filter((r) => r.scenario_id === scenario.id)
  const products = scenario.items.filter((item, i, all) => all.findIndex((x) => x.product_id === item.product_id) === i)
  if (scenario.is_baseline || products.length === 0) return null

  return (
    <section className="card px-5 pt-4 pb-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Коммерческие предложения</h2>
          <p className="meta mt-0.5">
            Производители получат параметры объекта и количество, но не название проекта. Цену из ответа можно
            подставить в расчёт.
          </p>
        </div>
        <Button variant="outline" onClick={() => setOpen(true)}>
          <Send /> Запросить КП
        </Button>
      </div>
      {mine.length > 0 && (
        <ul className="mt-4 divide-y divide-line">
          <AnimatePresence initial={false}>
            {mine.map((rfq, i) => (
              <RfqRow key={rfq.id} rfq={rfq} index={i} onApplyPrice={onApplyPrice} />
            ))}
          </AnimatePresence>
        </ul>
      )}
      <RequestDialog open={open} onOpenChange={setOpen} projectId={projectId} scenario={scenario} products={products} />
    </section>
  )
}

function RfqRow({
  rfq,
  index,
  onApplyPrice,
}: {
  rfq: Rfq
  index: number
  onApplyPrice: (productId: string, price: number, reason: string) => void
}) {
  const company = rfq.product.manufacturer.name
  const reason = `КП ${company} от ${formatDate(rfq.responded_at)}${rfq.lead_time_weeks ? `, поставка ${rfq.lead_time_weeks} нед.` : ''}`
  return (
    <motion.li
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay: Math.min(index, 12) * 0.022 }}
      className="grid items-center gap-x-4 gap-y-1.5 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
    >
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] font-medium">{rfq.product.name}</span>
        <span className="block truncate text-[12.5px] text-ink-3">
          {company} · запрошено {formatDate(rfq.created_at)}
          {rfq.quantity ? ` · ${rfq.quantity} шт.` : ''}
        </span>
        {rfq.response_message && <span className="mt-1 block text-[12.5px] text-ink-2">«{rfq.response_message}»</span>}
      </span>
      {rfq.price ? (
        <span className="num text-right text-[13.5px]">
          <span className="font-semibold">{formatRub(rfq.price.amount_rub)}</span>
          <span className="text-ink-3"> / шт.</span>
          {rfq.lead_time_weeks != null && (
            <span className="block text-[12px] text-ink-3">
              поставка {rfq.lead_time_weeks} {pluralRu(rfq.lead_time_weeks, ['неделя', 'недели', 'недель'])}
            </span>
          )}
        </span>
      ) : (
        <Pill tone={RFQ_STATUS_TONE[rfq.status]}>{RFQ_STATUS_LABEL[rfq.status]}</Pill>
      )}
      {rfq.price ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            onApplyPrice(rfq.product.id, rfq.price!.amount_rub, reason)
            toast.success('Цена из КП подставлена в сценарий', { description: 'Сохраните и пересчитайте сценарий.' })
          }}
        >
          <Check /> Применить цену
        </Button>
      ) : (
        <span />
      )}
    </motion.li>
  )
}

function RequestDialog({
  open,
  onOpenChange,
  projectId,
  scenario,
  products,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  scenario: Scenario
  products: Scenario['items']
}) {
  const create = useCreateRfq(projectId)
  const [selected, setSelected] = useState<string[]>(() => products.map((p) => p.product_id))
  const [message, setMessage] = useState('')
  const [shareContact, setShareContact] = useState(true)
  const quantity = (productId: string) =>
    scenario.items
      .filter((item) => item.product_id === productId)
      .reduce((sum, item) => sum + (item.count_result?.final ?? item.count_manual ?? 0), 0) || null

  const send = () =>
    create.mutate(
      {
        scenario_id: scenario.id,
        items: selected.map((product_id) => ({ product_id, quantity: quantity(product_id) })),
        message: message.trim() || null,
        share_contact: shareContact,
      },
      {
        onSuccess: (result) => {
          toast.success(
            `Запрос отправлен: ${result.total} ${pluralRu(result.total, ['производителю', 'производителям', 'производителям'])}`,
            { description: 'Ответ появится здесь и в сценарии.' },
          )
          onOpenChange(false)
        },
      },
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Запросить коммерческое предложение</DialogTitle>
          <DialogDescription>
            Производитель увидит тип объекта, обязательные параметры, процессы и количество из сценария.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5">
          {products.map((item) => {
            const n = quantity(item.product_id)
            return (
              <li key={item.product_id}>
                <label className="flex items-center gap-3 rounded-[10px] px-2 py-1.5 hover:bg-surface-2">
                  <Checkbox
                    checked={selected.includes(item.product_id)}
                    onCheckedChange={(checked) =>
                      setSelected((prev) =>
                        checked ? [...prev, item.product_id] : prev.filter((id) => id !== item.product_id),
                      )
                    }
                  />
                  <span className="min-w-0 flex-1 truncate text-[13.5px]">{item.product_name ?? item.product_id}</span>
                  <span className="num shrink-0 text-[12.5px] text-ink-3">
                    {n ? `${n} шт.` : 'кол-во после расчёта'}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Вопросы производителю: сроки, сервис, условия RaaS…"
          className="min-h-20 rounded-[10px]"
          maxLength={2000}
        />
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <Switch size="sm" checked={shareContact} onCheckedChange={setShareContact} />
          Показать производителю моё имя, почту и компанию
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={send} disabled={selected.length === 0 || create.isPending}>
            {create.isPending ? <Spinner /> : <Send />} Отправить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

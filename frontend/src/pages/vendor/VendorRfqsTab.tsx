import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Inbox, Send, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { RFQ_STATUS_LABEL, RFQ_STATUS_TONE, useReplyRfq, useVendorRfqs } from '@/entities/vendor'
import type { Rfq } from '@/shared/api/types'
import { formatDateTime, formatRub, formatValue } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { EmptyState, ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { Textarea } from '@/shared/ui/textarea'
import { Pill } from '@/shared/ui/v0'
import { Field } from '@/pages/admin/fields'
import { SPRING, stagger } from '@/pages/admin/motion'
import { parseNumber } from '@/pages/admin/parse'
import { Note } from './VendorProposalsTab'

export function VendorRfqsTab() {
  const rfqs = useVendorRfqs()
  if (rfqs.isPending) return <LoadingBlock label="Загружаем запросы…" />
  if (rfqs.isError) return <ErrorBlock error={rfqs.error} onRetry={() => rfqs.refetch()} />
  if (rfqs.data.items.length === 0)
    return (
      <EmptyState
        icon={<Inbox size={22} />}
        title="Запросов пока нет"
        description="Заказчики запрашивают КП из сценария, где считают экономику с вашим продуктом."
      />
    )
  return (
    <ul className="space-y-2.5">
      {rfqs.data.items.map((rfq, i) => (
        <RfqCard key={rfq.id} rfq={rfq} index={i} />
      ))}
    </ul>
  )
}

function RfqCard({ rfq, index }: { rfq: Rfq; index: number }) {
  const [open, setOpen] = useState(rfq.status === 'sent' && index === 0)
  const [price, setPrice] = useState('')
  const [weeks, setWeeks] = useState('')
  const [message, setMessage] = useState('')
  const reply = useReplyRfq()
  const amount = parseNumber(price)

  const send = (decision: 'offer' | 'decline') =>
    reply.mutate(
      {
        id: rfq.id,
        body: {
          decision,
          price: decision === 'offer' && amount ? { amount_rub: amount, vat_included: true } : null,
          lead_time_weeks: parseNumber(weeks),
          message: message.trim() || null,
        },
      },
      {
        onSuccess: () =>
          toast.success(decision === 'offer' ? 'Предложение отправлено заказчику' : 'Отказ отправлен', {
            description: 'Заказчик увидит ответ в своём сценарии.',
          }),
      },
    )

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
          <span className="block truncate text-[14px] font-medium">
            {rfq.product.name}
            {rfq.quantity ? <span className="num font-normal text-ink-3"> · {rfq.quantity} шт.</span> : null}
          </span>
          <span className="block truncate text-[12.5px] text-ink-3">
            {rfq.object.object_type_name} · {rfq.object.industry} · {formatDateTime(rfq.created_at)}
          </span>
        </span>
        <Pill tone={RFQ_STATUS_TONE[rfq.status]}>
          {rfq.price ? formatRub(rfq.price.amount_rub) : RFQ_STATUS_LABEL[rfq.status]}
        </Pill>
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
              {rfq.contact ? (
                <Note label="Заказчик">
                  {rfq.contact.name} · {rfq.contact.email}
                  {rfq.contact.organization ? ` · ${rfq.contact.organization}` : ''}
                </Note>
              ) : (
                <Note label="Заказчик">Скрыл контакты — ответьте здесь, он увидит предложение в проекте.</Note>
              )}
              {rfq.message && <Note label="Вопрос заказчика">{rfq.message}</Note>}
              <section>
                <h3 className="mb-1.5 text-[12px] font-medium tracking-wide text-ink-3 uppercase">Объект</h3>
                <dl className="grid gap-x-6 gap-y-1.5 rounded-[12px] border border-line bg-card px-3.5 py-3 text-[13px] sm:grid-cols-2">
                  {rfq.object.params.map((p) => (
                    <div key={p.key} className="flex justify-between gap-3">
                      <dt className="truncate text-ink-3">{p.name}</dt>
                      <dd className="num shrink-0 text-right font-medium">{formatValue(p.value, p.unit)}</dd>
                    </div>
                  ))}
                </dl>
                {rfq.object.processes.length > 0 && (
                  <p className="meta mt-2">Процессы: {rfq.object.processes.map((p) => p.name).join(', ')}</p>
                )}
              </section>
              {rfq.status === 'sent' ? (
                <div className="space-y-3 rounded-[12px] bg-surface-2 px-4 py-3.5 ring-1 ring-line">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Цена за единицу, ₽ с НДС">
                      <Input
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        inputMode="decimal"
                        placeholder="2 450 000"
                        className="num h-9 rounded-[10px] bg-card"
                      />
                    </Field>
                    <Field label="Срок поставки, недель">
                      <Input
                        value={weeks}
                        onChange={(e) => setWeeks(e.target.value)}
                        inputMode="numeric"
                        placeholder="8"
                        className="num h-9 rounded-[10px] bg-card"
                      />
                    </Field>
                  </div>
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Условия: сервис, гарантия, скидка за объём; при отказе — причина"
                    className="min-h-16 rounded-[10px] bg-card"
                    maxLength={2000}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      disabled={!message.trim() || reply.isPending}
                      onClick={() => send('decline')}
                      title={message.trim() ? undefined : 'Напишите причину отказа'}
                    >
                      <X /> Отказать
                    </Button>
                    <Button disabled={!amount || amount <= 0 || reply.isPending} onClick={() => send('offer')}>
                      {reply.isPending ? <Spinner /> : <Send />} Отправить предложение
                    </Button>
                  </div>
                </div>
              ) : (
                <Note label={`Ваш ответ · ${formatDateTime(rfq.responded_at)}`} tone={rfq.price ? 'ok' : 'crit'}>
                  {rfq.price && `${formatRub(rfq.price.amount_rub)} за единицу`}
                  {rfq.lead_time_weeks != null && `, поставка ${rfq.lead_time_weeks} нед.`}
                  {rfq.response_message && <span className="block">{rfq.response_message}</span>}
                </Note>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  )
}

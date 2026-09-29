import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Trash2 } from 'lucide-react'
import { useIndustries } from '@/entities/admin'
import { formatRub } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Field } from './fields'
import { SPRING } from './motion'
import type { Offer } from './productForm'

const ADMIN_SOURCE = { kind: 'user_input' as const, title: 'Ввод администратора каталога' }

const groupDigits = (value: number) => (value > 0 ? Math.round(value).toLocaleString('ru-RU') : '')
const digitsOnly = (text: string) => Number(text.replace(/\D/g, '')) || 0

export function OffersEditor({
  offers,
  error,
  onChange,
}: {
  offers: Offer[]
  error?: string
  onChange: (offers: Offer[]) => void
}) {
  const industries = useIndustries()
  const patch = (index: number, next: Partial<Offer>) =>
    onChange(offers.map((offer, i) => (i === index ? { ...offer, ...next } : offer)))
  const add = () =>
    onChange([
      ...offers,
      {
        industry: industries.data?.[0]?.name ?? '',
        scenario: '',
        price: { amount_rub: 0, vat_included: true },
        source: ADMIN_SOURCE,
      },
    ])
  const minPrice = Math.min(...offers.map((o) => o.price.amount_rub).filter((p) => p > 0))

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-[13.5px] font-semibold">Цены по отраслям</h3>
          <p className="meta">
            Цена изделия с НДС, без доставки и внедрения. В каталоге показывается минимальная
            {Number.isFinite(minPrice) && <> — сейчас {formatRub(minPrice)}</>}.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={add}>
          <Plus /> Предложение
        </Button>
      </div>

      {error && <p className="mb-3 text-[12.5px] text-crit">{error}</p>}
      {offers.length === 0 && (
        <div className="rounded-[12px] border border-dashed border-line px-4 py-8 text-center text-[13.5px] text-ink-3">
          Предложений нет — без цены решение не попадёт в экономику сценария.
        </div>
      )}

      <ul className="space-y-3">
        <AnimatePresence initial={false}>
          {offers.map((offer, index) => (
            <motion.li
              key={index}
              layout="position"
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.14 } }}
              transition={SPRING}
              className="rounded-[12px] border border-line bg-card p-3.5"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_150px_auto] items-end gap-3">
                <Field label="Отрасль">
                  <Select value={offer.industry || undefined} onValueChange={(industry) => patch(index, { industry })}>
                    <SelectTrigger className="h-9 w-full rounded-[10px]">
                      <SelectValue placeholder="Отрасль" />
                    </SelectTrigger>
                    <SelectContent>
                      {(industries.data ?? []).map((industry) => (
                        <SelectItem key={industry.key} value={industry.name}>
                          {industry.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Цена, ₽">
                  <Input
                    inputMode="numeric"
                    value={groupDigits(offer.price.amount_rub)}
                    onChange={(e) =>
                      patch(index, { price: { ...offer.price, amount_rub: digitsOnly(e.target.value) } })
                    }
                    placeholder="2 500 000"
                    className="num h-9 rounded-[10px] text-right"
                  />
                </Field>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mb-0.5 text-ink-4 hover:text-crit"
                  onClick={() => onChange(offers.filter((_, i) => i !== index))}
                  aria-label="Удалить предложение"
                >
                  <Trash2 />
                </Button>
              </div>
              <Field label="Сценарий применения" className="mt-3">
                <Input
                  value={offer.scenario}
                  onChange={(e) => patch(index, { scenario: e.target.value })}
                  placeholder="Перемещение паллет между зонами склада"
                  className="h-9 rounded-[10px]"
                />
              </Field>
              <div className="mt-2 text-[12px] text-ink-3">Источник: {offer.source?.title ?? ADMIN_SOURCE.title}</div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  )
}

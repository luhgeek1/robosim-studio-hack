import { Check, KeyRound, Plus } from 'lucide-react'
import type { Badge, Product, ProductStatus } from '@/api/types'
import { Bar, Button, Hint, Pill, type Tone } from '@/components/ui'
import { formatPct, formatRub } from '@/lib/format'
import { BADGE_LABEL, PRODUCT_STATUS_LABEL } from '@/lib/labels'
import { useStore } from '@/store'
import { COMPARE_LIMIT, useCompareSelection } from './compareSelection'

const STATUS_TONE: Record<ProductStatus, Tone> = { operation: 'ok', piloting: 'accent', rnd: 'neutral' }

export function StatusPill({ status }: { status: ProductStatus }) {
  return <Pill tone={STATUS_TONE[status]}>{PRODUCT_STATUS_LABEL[status]}</Pill>
}

export function TrlPill({ trl }: { trl: number | null | undefined }) {
  if (trl === null || trl === undefined) return null
  return (
    <Hint content="Уровень готовности технологии (УГТ) по каталогу организатора, шкала 1–9">
      <span className="cursor-help">
        <Pill className="num">УГТ {trl}</Pill>
      </span>
    </Hint>
  )
}

const BADGE_TONE: Record<Badge, Tone> = {
  tested_fcbas: 'ok',
  specs_confirmed: 'ok',
  in_registry_719: 'accent',
  domestic: 'neutral',
  has_cases: 'neutral',
}

export function BadgePills({ badges, limit }: { badges: Badge[]; limit?: number }) {
  if (!badges.length) return null
  const shown = limit ? badges.slice(0, limit) : badges
  const rest = badges.length - shown.length
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((badge) => (
        <Pill key={badge} tone={BADGE_TONE[badge]} className="!h-[22px] !text-[11.5px]">
          {BADGE_LABEL[badge]}
        </Pill>
      ))}
      {rest > 0 && (
        <Hint
          content={badges
            .slice(shown.length)
            .map((b) => BADGE_LABEL[b])
            .join(', ')}
        >
          <span className="cursor-help">
            <Pill className="!h-[22px] !text-[11.5px]">+{rest}</Pill>
          </span>
        </Hint>
      )}
    </div>
  )
}

export function PriceFrom({ price, size = 'md' }: { price: Product['price_from']; size?: 'md' | 'lg' }) {
  return (
    <span className="whitespace-nowrap">
      <span className={`num font-semibold ${size === 'lg' ? 'display text-[26px]' : 'text-[15px]'}`}>
        от {formatRub(price.amount_rub)}
      </span>
      <span className="ml-1 text-[12px] text-ink-3">{price.vat_included === false ? 'без НДС' : 'с НДС'}</span>
    </span>
  )
}

// Completeness is the API's share of filled required specs; the colour only helps scanning the grid.
export function CompletenessBar({ value, label = 'Полнота карточки' }: { value: number; label?: string }) {
  const tone: Tone = value >= 0.8 ? 'ok' : value >= 0.5 ? 'accent' : 'warn'
  return (
    <Hint content="Доля заполненных обязательных характеристик для этого типа решения">
      <div className="cursor-help space-y-1">
        <div className="flex items-center justify-between gap-2 text-[12px] text-ink-3">
          <span>{label}</span>
          <span className="num text-ink-2">{formatPct(value, { share: true, digits: 0 })}</span>
        </div>
        <Bar value={value * 100} tone={tone} height={4} />
      </div>
    </Hint>
  )
}

export function KeyMark() {
  return (
    <Hint content="Ключевое ограничение для подбора: участвует в жёстких проверках совместимости с объектом">
      <KeyRound size={13} className="shrink-0 cursor-help text-accent" aria-label="Ключевое ограничение для подбора" />
    </Hint>
  )
}

export function CompareToggle({
  product,
  size = 'sm',
  className = '',
}: {
  product: { id: string; name: string }
  size?: 'sm' | 'md'
  className?: string
}) {
  const selection = useCompareSelection()
  const toast = useStore((s) => s.toast)
  const selected = selection.has(product.id)
  return (
    <Button
      type="button"
      size={size}
      variant="secondary"
      aria-pressed={selected}
      className={`${selected ? '!border-accent/40 !bg-accent-soft !text-accent-ink' : ''} ${className}`}
      icon={selected ? <Check size={14} /> : <Plus size={14} />}
      onClick={() => {
        if (!selection.toggle({ id: product.id, name: product.name }))
          toast(`В сравнении уже ${COMPARE_LIMIT} решений — уберите одно, чтобы добавить новое`, 'error')
      }}
    >
      {selected ? 'В сравнении' : 'В сравнение'}
    </Button>
  )
}

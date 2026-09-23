import { Link } from 'react-router'
import { BADGE_LABEL, PRODUCT_STATUS_LABEL } from '@/entities/catalog'
import type { Badge, Product, ProductStatus } from '@/shared/api/types'
import { formatPct, formatRub } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { ToneBadge, type Tone } from '@/shared/ui/tone'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'

const STATUS_TONE: Record<ProductStatus, Tone> = { operation: 'ok', piloting: 'info', rnd: 'muted' }

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return <ToneBadge tone={STATUS_TONE[status]}>{PRODUCT_STATUS_LABEL[status]}</ToneBadge>
}

export function TrlBadge({ trl }: { trl: number | null | undefined }) {
  if (trl === null || trl === undefined) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <ToneBadge tone="muted" className="num">
          УГТ {trl}
        </ToneBadge>
      </TooltipTrigger>
      <TooltipContent>Уровень готовности технологии по каталогу организатора (1–9)</TooltipContent>
    </Tooltip>
  )
}

const BADGE_TONE: Record<Badge, Tone> = {
  in_registry_719: 'info',
  tested_fcbas: 'ok',
  specs_confirmed: 'ok',
  domestic: 'muted',
  has_cases: 'muted',
}

// «Отечественный» и «есть внедрения» стоят почти у всех продуктов, поэтому в списках показываем только отметки о проверке.
const VERIFIED_BADGES = new Set<Badge>(['in_registry_719', 'tested_fcbas', 'specs_confirmed'])

export function ProductBadges({
  badges,
  className,
  verifiedOnly,
}: {
  badges: Badge[]
  className?: string
  verifiedOnly?: boolean
}) {
  const shown = verifiedOnly ? badges.filter((badge) => VERIFIED_BADGES.has(badge)) : badges
  if (!shown.length) return null
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {shown.map((badge) => (
        <ToneBadge key={badge} tone={BADGE_TONE[badge]}>
          {BADGE_LABEL[badge]}
        </ToneBadge>
      ))}
    </div>
  )
}

export function PriceFrom({ price, className }: { price: Product['price_from']; className?: string }) {
  return (
    <div className={cn('num font-semibold', className)}>
      от {formatRub(price.amount_rub)}
      <span className="ml-1 text-xs font-normal text-muted-foreground">
        {price.vat_included === false ? 'без НДС' : 'с НДС'}
      </span>
    </div>
  )
}

// Completeness is the API's share of filled required specs; the colour bands only help scanning the list.
export function CompletenessMeter({
  value,
  className,
  label = 'Полнота карточки',
}: {
  value: number
  className?: string
  label?: string
}) {
  const tone = value >= 0.8 ? 'bg-ok' : value >= 0.5 ? 'bg-warn' : 'bg-crit'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn('space-y-1', className)}>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{label}</span>
            <span className="num text-foreground">{formatPct(value, { share: true, digits: 0 })}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className={cn('h-full rounded-full', tone)} style={{ width: `${Math.round(value * 100)}%` }} />
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent>Доля заполненных обязательных характеристик для этого типа решения</TooltipContent>
    </Tooltip>
  )
}

// nested marks a product opened from another product page, where history back would not lead to the catalog.
export type CatalogLinkState = { catalogSearch?: string; nested?: boolean }

export function ProductMiniCard({ product, state }: { product: Product; state?: CatalogLinkState }) {
  return (
    <div className="relative space-y-2 rounded-lg border bg-surface p-4 transition-colors hover:border-primary/50">
      <Link
        to={`/catalog/${product.id}`}
        state={state}
        className="line-clamp-2 font-medium after:absolute after:inset-0"
      >
        {product.name}
      </Link>
      <div className="truncate text-xs text-muted-foreground">{product.manufacturer.name}</div>
      <div className="flex flex-wrap items-center gap-1">
        <ProductStatusBadge status={product.status} />
        <TrlBadge trl={product.trl} />
      </div>
      <PriceFrom price={product.price_from} className="text-sm" />
    </div>
  )
}

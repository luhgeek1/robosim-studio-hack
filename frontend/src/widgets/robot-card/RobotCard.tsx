import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { Product } from '@/shared/api/types'
import { formatRub } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { RobotPreview3D } from '@/widgets/robot-3d'

/* Карточка робота для подбора, каталога и сравнения: 3D-модель на всю карточку, сверху плашки, снизу название
   и цена по краям. При наведении снизу выезжает белая панель с цифрами — в покое карточка остаётся чистой. */
export function RobotCard({
  productId,
  solutionType,
  name,
  to,
  linkState,
  subtitle,
  price,
  chips,
  corner,
  cornerPinned = false,
  accent,
  aside,
  details,
  className,
}: {
  productId: string
  solutionType: string
  name: string
  to: string
  linkState?: unknown
  subtitle?: string
  price: Product['price_from'] | null | undefined
  chips?: ReactNode
  corner?: ReactNode
  // Угловой элемент обычно появляется при наведении; закреплённый виден всегда (например, «уже в сравнении»).
  cornerPinned?: boolean
  accent?: string
  aside?: ReactNode
  details?: ReactNode
  className?: string
}) {
  return (
    <article className={cn('group card relative aspect-[5/6] w-full overflow-hidden', className)}>
      <RobotStage productId={productId} solutionType={solutionType} />
      {accent && <span aria-hidden className="absolute inset-x-0 top-0 z-10 h-1" style={{ background: accent }} />}

      {chips && <div className="absolute top-4 left-4 flex items-center gap-1.5">{chips}</div>}
      {corner && (
        <div
          className={cn(
            'absolute top-4 right-4 transition-opacity',
            cornerPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
          )}
        >
          {corner}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 transition-opacity duration-200 group-focus-within:opacity-0 group-hover:opacity-0">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-[17px] leading-snug font-semibold tracking-[-0.01em]">{name}</h3>
          {subtitle && <p className="mt-0.5 truncate text-[13px] text-ink-3">{subtitle}</p>}
        </div>
        <CardPrice price={price} />
      </div>

      <div className="absolute inset-x-0 bottom-0 translate-y-full bg-card px-4 pt-3 pb-3.5 transition-[translate,box-shadow] duration-300 ease-out group-focus-within:translate-y-0 group-focus-within:shadow-[0_-8px_24px_-12px_rgba(20,20,24,0.18)] group-hover:translate-y-0 group-hover:shadow-[0_-8px_24px_-12px_rgba(20,20,24,0.18)]">
        <div className="flex items-center justify-between gap-3">
          <Link
            to={to}
            state={linkState}
            title={[name, subtitle].filter(Boolean).join(' · ')}
            className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.01em] transition-colors hover:text-info"
          >
            {name}
          </Link>
          {aside}
        </div>
        {details && <div className="mt-2.5">{details}</div>}
      </div>
    </article>
  )
}

/* Сцена под моделью: мягкий свет сверху и модель класса решения, форма — по ТТХ продукта (widgets/robot-3d). */
export function RobotStage({ productId, solutionType }: { productId: string; solutionType: string }) {
  return (
    <div className="absolute inset-0 bg-surface-2" data-solution-type={solutionType} data-product-id={productId}>
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(110% 80% at 50% 38%, #ffffff 0%, #f1f4f6 60%, #e9edf0 100%)' }}
        aria-hidden
      />
      <RobotPreview3D productId={productId} framing={{ scale: 1.3, lower: 0.12 }} />
    </div>
  )
}

export function CardChip({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium whitespace-nowrap',
        strong ? 'num bg-ink text-white' : 'bg-white/90 text-ink',
      )}
    >
      {children}
    </span>
  )
}

/* Три-четыре цифры в панели: число сверху, подпись снизу. */
export function CardFigures({ items }: { items: { value: ReactNode; label: string }[] }) {
  return (
    <dl className="grid gap-x-3" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((item) => (
        // dt раньше dd по смыслу, а визуально число сверху — поэтому колонка развёрнута.
        <div key={item.label} className="flex min-w-0 flex-col-reverse">
          <dt className="truncate text-[11.5px] text-ink-3" title={item.label}>
            {item.label}
          </dt>
          <dd className="num truncate text-[15px] leading-tight font-semibold tracking-[-0.01em]">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function CardPrice({ price }: { price: Product['price_from'] | null | undefined }) {
  if (!price) return <span className="shrink-0 pb-0.5 text-[13px] text-ink-3">цена не указана</span>
  return (
    <div className="shrink-0 text-right">
      <div className="display num text-[20px] leading-tight">{formatRub(price.amount_rub)}</div>
      <div className="mt-0.5 text-[12px] text-ink-3">от, {price.vat_included === false ? 'без НДС' : 'с НДС'}</div>
    </div>
  )
}

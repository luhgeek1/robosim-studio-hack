import { useRef, type MouseEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import type { Product } from '@/shared/api/types'
import { formatRub } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { RobotPreview3D } from '@/widgets/robot-3d'

/* Карточка робота для подбора, каталога и сравнения: 3D-модель на всю карточку, сверху плашки, снизу название
   и цена по краям. При наведении снизу выезжает белая панель с цифрами — в покое карточка остаётся чистой.
   Клик в любом месте открывает страницу робота; поворот модели перетаскиванием переходом не считается. */
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
  const navigate = useNavigate()
  const press = useRef<{ x: number; y: number } | null>(null)
  const open = (e: MouseEvent<HTMLElement>) => {
    const start = press.current
    press.current = null
    if ((e.target as HTMLElement).closest('a, button, input, label, [role="button"]')) return
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) return
    navigate(to, { state: linkState })
  }

  return (
    <article
      className={cn(
        // На сенсорном экране наведения нет: панель с цифрами стоит под сценой постоянно, карточка растёт по высоте.
        'group card relative aspect-[5/6] w-full cursor-pointer overflow-hidden pointer-coarse:flex pointer-coarse:h-auto pointer-coarse:flex-col pointer-coarse:aspect-auto',
        className,
      )}
      onPointerDownCapture={(e) => (press.current = { x: e.clientX, y: e.clientY })}
      onClick={open}
    >
      <div className="absolute inset-0 pointer-coarse:relative pointer-coarse:inset-auto pointer-coarse:aspect-[5/4] pointer-coarse:shrink-0">
        <RobotStage productId={productId} solutionType={solutionType} className="cursor-pointer" />
        {accent && <span aria-hidden className="absolute inset-x-0 top-0 z-10 h-1" style={{ background: accent }} />}

        {chips && <div className="absolute top-4 left-4 flex items-center gap-1.5">{chips}</div>}
        {corner && (
          <div
            className={cn(
              'absolute top-4 right-4 transition-opacity',
              cornerPinned
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100',
            )}
          >
            {corner}
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 transition-opacity duration-200 group-focus-within:opacity-0 group-hover:opacity-0 pointer-coarse:opacity-100! max-sm:p-4">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-[17px] leading-snug font-semibold tracking-[-0.01em]">{name}</h3>
            {subtitle && <p className="mt-0.5 truncate text-[13px] text-ink-3">{subtitle}</p>}
          </div>
          <CardPrice price={price} />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 translate-y-full bg-card px-4 pt-3 pb-3.5 transition-[translate,box-shadow] duration-300 ease-out group-focus-within:translate-y-0 group-focus-within:shadow-[0_-8px_24px_-12px_rgba(20,20,19,0.18)] group-hover:translate-y-0 group-hover:shadow-[0_-8px_24px_-12px_rgba(20,20,19,0.18)] pointer-coarse:static pointer-coarse:flex-1 pointer-coarse:translate-y-0 pointer-coarse:border-t pointer-coarse:border-line pointer-coarse:shadow-none">
        {/* Название на сенсорном экране уже подписано на сцене — здесь остаётся только то, что стоит рядом с ним. */}
        <div className={cn('flex items-center justify-between gap-3', !aside && 'pointer-coarse:hidden')}>
          <Link
            to={to}
            state={linkState}
            title={[name, subtitle].filter(Boolean).join(' · ')}
            className="min-w-0 truncate text-[15px] font-semibold tracking-[-0.01em] transition-colors hover:text-info pointer-coarse:invisible"
          >
            {name}
          </Link>
          {aside}
        </div>
        {details && <div className={cn('mt-2.5', !aside && 'pointer-coarse:mt-1.5')}>{details}</div>}
      </div>
    </article>
  )
}

/* Сцена под моделью: мягкий свет сверху и модель класса решения, форма — по ТТХ продукта (widgets/robot-3d). */
export function RobotStage({
  productId,
  solutionType,
  className,
}: {
  productId: string
  solutionType: string
  className?: string
}) {
  return (
    <div className="absolute inset-0 bg-surface-2" data-solution-type={solutionType} data-product-id={productId}>
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(110% 80% at 50% 38%, #ffffff 0%, #f1f4f6 60%, #e9edf0 100%)' }}
        aria-hidden
      />
      <RobotPreview3D productId={productId} framing={{ scale: 1.3, lower: 0.12 }} className={className} />
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

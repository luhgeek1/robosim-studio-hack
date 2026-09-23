import { Box } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

/* Место под 3D-превью робота на всю карточку. Модель подставится по типу решения (и позже по конкретному
   продукту); пока слот держит сцену и показывает, что здесь будет. */
export function RobotPreview({
  solutionType,
  productId,
  className,
}: {
  solutionType: string
  productId: string
  className?: string
}) {
  return (
    <div
      className={cn('absolute inset-0 bg-surface-2', className)}
      data-solution-type={solutionType}
      data-product-id={productId}
    >
      <div className="absolute inset-x-14 top-[58%] h-8 rounded-[50%] bg-black/5 blur-lg" aria-hidden />
      <div className="absolute inset-x-0 top-[38%] flex flex-col items-center gap-1.5 text-ink-4">
        <Box className="size-8" strokeWidth={1.3} />
        <span className="text-[12px]">3D-модель</span>
      </div>
    </div>
  )
}

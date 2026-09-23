import { Box } from 'lucide-react'
import type { ReactNode } from 'react'

/* Место под 3D-превью робота. Модель подставится по типу решения (и позже по конкретному продукту);
   пока слот держит пропорции карточки и показывает, что здесь будет. */
export function RobotPreview({
  solutionType,
  productId,
  children,
}: {
  solutionType: string
  productId: string
  children?: ReactNode
}) {
  return (
    <div
      className="relative aspect-[16/10] overflow-hidden border-b border-line bg-surface-2"
      data-solution-type={solutionType}
      data-product-id={productId}
    >
      <div className="absolute inset-x-10 bottom-7 h-6 rounded-[50%] bg-black/5 blur-md" aria-hidden />
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center gap-1.5 text-ink-4">
          <Box className="size-7" strokeWidth={1.4} />
          <span className="text-[12px]">3D-модель</span>
        </div>
      </div>
      {children}
    </div>
  )
}

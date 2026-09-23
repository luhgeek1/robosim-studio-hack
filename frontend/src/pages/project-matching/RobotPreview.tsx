import { Box } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { RobotPreview3D } from '@/widgets/robot-3d'

/* 3D-превью на всю карточку: модель выбирается по классу решения, форма — по ТТХ продукта (widgets/robot-3d).
   Для класса без модели остаётся заглушка. Кадр ниже центра: сверху чипы, снизу название и цена. */
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
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(110% 80% at 50% 38%, #ffffff 0%, #f1f4f6 60%, #e9edf0 100%)' }}
        aria-hidden
      />
      <RobotPreview3D
        productId={productId}
        framing={{ scale: 1.3, lower: 0.12 }}
        fallback={
          <>
            <div className="absolute inset-x-14 top-[58%] h-8 rounded-[50%] bg-black/5 blur-lg" aria-hidden />
            <div className="absolute inset-x-0 top-[38%] flex flex-col items-center gap-1.5 text-ink-4">
              <Box className="size-8" strokeWidth={1.3} />
              <span className="text-[12px]">Модели для этого класса пока нет</span>
            </div>
          </>
        }
      />
    </div>
  )
}

import { cn } from '@/shared/lib/utils'
import { RobotPreview3D } from '@/widgets/robot-3d'

/* 3D-превью на всю карточку: модель выбирается по классу решения, форма — по ТТХ продукта (widgets/robot-3d).
   Класс без своей модели получает нейтрального робота. Кадр ниже центра: сверху чипы, снизу название и цена. */
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
      <RobotPreview3D productId={productId} framing={{ scale: 1.3, lower: 0.12 }} />
    </div>
  )
}

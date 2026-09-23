import { Check, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { COMPARE_LIMIT, useCompareSelection, type CompareItem } from './model'

export function CompareToggle({
  product,
  size = 'sm',
  className,
}: {
  product: CompareItem
  size?: 'sm' | 'default'
  className?: string
}) {
  const selection = useCompareSelection()
  const selected = selection.has(product.id)
  return (
    <Button
      type="button"
      size={size}
      variant={selected ? 'default' : 'outline'}
      aria-pressed={selected}
      className={cn('rounded-lg', !selected && 'bg-card', className)}
      onClick={() => {
        const ok = selection.toggle({ id: product.id, name: product.name })
        if (!ok) toast.warning(`В сравнении уже ${COMPARE_LIMIT} решений — уберите одно, чтобы добавить новое`)
      }}
    >
      {selected ? <Check /> : <Plus />}
      {selected ? 'В сравнении' : size === 'sm' ? 'Сравнить' : 'Добавить в сравнение'}
    </Button>
  )
}

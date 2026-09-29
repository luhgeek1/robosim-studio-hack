import type { AdminParameterDefault } from '@/shared/api/types'
import { formatValue } from '@/shared/lib/format'

// Значение списка показываем подписью («Стеллажи»), а не ключом (rack).
export function defaultText(item: AdminParameterDefault, value: unknown = item.default?.value): string {
  if (item.type === 'enum') {
    const label = item.enum_values?.find((option) => option.value === value)?.label
    if (label) return label
  }
  return formatValue(value, item.unit)
}

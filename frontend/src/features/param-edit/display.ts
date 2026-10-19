import type { ProjectParam } from '@/shared/api/types'
import { formatNumber, formatValue } from '@/shared/lib/format'
import type { ParamValue } from './parse'

export function displayParamValue(param: ProjectParam, value: ParamValue): string {
  if (typeof value === 'string' && param.definition?.type === 'enum') {
    const option = param.definition.enum_values?.find((o) => o.value === value)
    if (option?.label) return option.label
  }
  return formatValue(value, param.unit)
}

export function displayRange(param: ProjectParam): string | null {
  const min = param.definition?.min
  const max = param.definition?.max
  if (min == null && max == null) return null
  const unit = param.unit ? ` ${param.unit}` : ''
  if (min != null && max != null && min === max) return `${formatNumber(min)}${unit}`
  if (min != null && max != null) return `${formatNumber(min)}–${formatNumber(max)}${unit}`
  if (min != null) return `от ${formatNumber(min)}${unit}`
  return `до ${formatNumber(max)}${unit}`
}

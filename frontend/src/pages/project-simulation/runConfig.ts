import type { SizingResult } from '@/shared/api/types'

export type Mode = 'peak' | 'normal'
export type RunConfig = { count: number; mode: Mode; volume: boolean; failure: boolean }

export const COUNT_HINT: Record<SizingResult['count']['source'], string> = {
  simulated: 'в расчёте, проверено имитацией',
  analytic: 'в расчёте, по формуле цикла',
  manual: 'в расчёте, задано вручную',
}

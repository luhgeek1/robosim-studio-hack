import { SWEEP_SEED, isFinal, type SimulationRun } from '@/entities/simulation'
import type { SizingResult } from '@/shared/api/types'
import { pluralRu } from '@/shared/lib/format'

export type Mode = 'peak' | 'normal'
export type RunConfig = { count: number; mode: Mode; volume: boolean; failure: boolean }

export const SEED = SWEEP_SEED
// Стресс-тесты шага «Имитация» из docs/PRODUCT.md: +20 % объёма и отказ одного робота на 2 часа в начале смены.
export const STRESS = {
  volumeMultiplier: 1.2,
  failure: { robot_index: 0, at_hour: 1, duration_hours: 2 },
} as const

export const COUNT_HINT: Record<SizingResult['count']['source'], string> = {
  simulated: 'в расчёте, проверено имитацией',
  analytic: 'в расчёте, по формуле цикла',
  manual: 'в расчёте, задано вручную',
}

// Пиковые часы экрана — то же окно, что у перебора флота; прогоны «24 ч пика» из прежней версии экрана не подходят.
const PEAK_WINDOW_MAX_H = 12

const fleetOf = (run: SimulationRun, processKey: string) => run.fleet?.find((f) => f.process_key === processKey)?.count

export function configOf(run: SimulationRun, processKey: string): RunConfig | null {
  const count = fleetOf(run, processKey)
  if (count == null) return null
  if (run.config.mode === 'peak' && (run.summary?.duration_hours ?? 0) > PEAK_WINDOW_MAX_H) return null
  return {
    count,
    mode: run.config.mode === 'peak' ? 'peak' : 'normal',
    volume: (run.config.volume_multiplier ?? 1) > 1,
    failure: (run.config.failures?.length ?? 0) > 0,
  }
}

export const configKey = (c: RunConfig) => `${c.count}:${c.mode}:${c.volume ? 'v' : ''}:${c.failure ? 'f' : ''}`

// A usable run has the event log for the player; runs without it (record_events: false) are KPI-only.
export const usable = (run: SimulationRun) =>
  run.status !== 'failed' && run.status !== 'cancelled' && (!isFinal(run.status) || (run.events_count ?? 0) > 0)

export function runPayload(config: RunConfig, processKey: string) {
  return {
    mode: config.mode,
    // Пик — окно `sim_peak_duration_hours` бэкенда, то же, что у перебора флота; обычный день — сутки.
    ...(config.mode === 'normal' ? { duration_hours: 24 } : {}),
    seed: SEED,
    volume_multiplier: config.volume ? STRESS.volumeMultiplier : 1,
    fleet_override: [{ process_key: processKey, count: config.count }],
    failures: config.failure ? [STRESS.failure] : [],
    record_events: true,
    compare_baseline: false,
  }
}

// Рабочий парк сценария без резерва: по перебору флота, по формуле цикла или заданный вручную.
export function workingCount(sizing: SizingResult): number {
  const { count } = sizing
  if (count.source === 'simulated' && count.simulated) return count.simulated
  if (count.source === 'manual') return Math.max(1, Math.min(count.final, count.analytic || count.final))
  return count.analytic
}

/* Прогоны экрана — проверка «что если»: они не меняют сценарий. Меняет его только перебор флота (или выбор
   «по формуле / по имитации»), и это сказано прямо, чтобы новое число на экране не путали с расчётом. */
export function whatIfText(sizing: SizingResult, config: RunConfig, working: number): string | null {
  const changes = [
    config.count !== working ? `${config.count} роботов вместо ${working}` : null,
    config.mode !== 'peak' ? 'обычный день' : null,
    config.volume ? '+20 % объёма' : null,
    config.failure ? 'отказ робота на 2 ч' : null,
  ].filter(Boolean)
  if (!changes.length) return null
  return `Проверка «что если» (${changes.join(', ')}): сценарий не меняется, в расчёте ${working} ${pluralRu(working, ['робот', 'робота', 'роботов'])} в работе + резерв ${sizing.count.reserve}`
}

export type StressCheck = { key: string; title: string; note: string; config: RunConfig }

/* Три проверки, которые отвечают «выдержит ли парк сбои»: тот же пик с запасом объёма, отказ робота и парк
   без одного робота. Каждая — обычный прогон, его можно открыть в плеере. */
export function stressChecks(working: number): StressCheck[] {
  const base: RunConfig = { count: working, mode: 'peak', volume: false, failure: false }
  return [
    {
      key: 'volume',
      title: 'Пик +20 % объёма',
      note: 'поток задач на пятую часть больше',
      config: { ...base, volume: true },
    },
    {
      key: 'failure',
      title: 'Отказ робота на 2 ч',
      note: 'один робот выходит из строя в начале смены',
      config: { ...base, failure: true },
    },
    {
      key: 'lean',
      title: 'Без запаса',
      note: `на одного робота меньше: ${Math.max(1, working - 1)}`,
      config: { ...base, count: Math.max(1, working - 1) },
    },
  ]
}

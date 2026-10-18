import { create } from 'zustand'
import { DEMO_PROJECTS, demoStep, type DemoStep } from './navigation'

const STORAGE_KEY = 'robomera.demo-workspace'
type SavedWorkspace = { activeKey: string; steps: Record<string, DemoStep> }
const isDemoKey = (key: unknown): key is string => DEMO_PROJECTS.some((demo) => demo.key === key)

function load(): SavedWorkspace {
  const fallback = { activeKey: DEMO_PROJECTS[0].key, steps: {} }
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!saved || typeof saved !== 'object' || !('activeKey' in saved) || !isDemoKey(saved.activeKey)) return fallback
    const steps =
      'steps' in saved && saved.steps && typeof saved.steps === 'object'
        ? Object.fromEntries(
            Object.entries(saved.steps)
              .filter(([key, value]) => isDemoKey(key) && typeof value === 'string')
              .map(([key, value]) => [key, demoStep(value)]),
          )
        : {}
    return { activeKey: saved.activeKey, steps }
  } catch {
    return fallback
  }
}

// Все примеры открыты сразу; для каждого запоминаем только последний шаг, без копирования расчётов.
export const useDemoWorkspace = create<SavedWorkspace & { visit: (key: string, step: DemoStep) => void }>(
  (set, get) => ({
    ...load(),
    visit: (key, step) => {
      const { activeKey, steps } = get()
      if (!isDemoKey(key) || (activeKey === key && steps[key] === step)) return
      const next = { activeKey: key, steps: { ...steps, [key]: step } }
      set(next)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // При недоступном хранилище вкладки сохраняются до перезагрузки страницы.
      }
    },
  }),
)

import { useMatch } from 'react-router'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useSession } from '@/entities/session'
import { PROJECT_STEPS, type ProjectStep } from './steps'

const GUIDED_STEPS: ProjectStep[] = [
  { id: 'object', label: 'Объект', question: 'Исходные данные и модель объекта' },
  { id: 'matching', label: 'Роботы', question: 'Что выбрано и почему' },
  { id: 'comparison', label: 'Экономика', question: 'Купить, арендовать или оставить как есть' },
  { id: 'simulation', label: 'Имитация', question: 'Выдержит ли парк реальную нагрузку' },
  { id: 'report', label: 'Решение', question: 'Результат, отчёт и следующий шаг' },
]

type Journey = { demoKey: string; full: boolean }
type State = {
  projects: Record<string, Journey>
  open: (id: string, demoKey: string) => void
  setFull: (id: string, full: boolean) => void
}

export const useJourneyStore = create<State>()(
  persist(
    (set) => ({
      projects: {},
      open: (id, demoKey) =>
        set((s) => ({ projects: { ...s.projects, [id]: s.projects[id] ?? { demoKey, full: false } } })),
      setFull: (id, full) =>
        set((s) => {
          const current = s.projects[id]
          return current ? { projects: { ...s.projects, [id]: { ...current, full } } } : s
        }),
    }),
    { name: 'robomera-project-journey-v1' },
  ),
)

export function useJourney(projectId?: string) {
  const { user } = useSession()
  const storedJourney = useJourneyStore((s) => (projectId ? s.projects[projectId] : undefined))
  // Сохранённый демо-маршрут действует только для гостя: после входа проект становится полноценным.
  const journey = user?.role === 'guest' ? storedJourney : undefined
  const step = useMatch('/projects/:projectId/:step/*')?.params.step
  const guided = Boolean(journey && !journey.full && (!step || GUIDED_STEPS.some((s) => s.id === step)))
  return { journey, guided, steps: guided ? GUIDED_STEPS : PROJECT_STEPS }
}

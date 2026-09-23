import { useParams } from 'react-router'

export type StepId = 'object' | 'analysis' | 'robots' | 'simulation' | 'economics' | 'verdict'

// The story of one assessment: every step answers one question the director would ask.
export const STEPS: { id: StepId; label: string; question: string }[] = [
  { id: 'object', label: 'Объект', question: 'Вот мой объект' },
  { id: 'analysis', label: 'Анализ', question: 'Где сейчас уходят деньги' },
  { id: 'robots', label: 'Роботы', question: 'Какие роботы подходят' },
  { id: 'simulation', label: 'Симуляция', question: 'Сколько роботов и справятся ли' },
  { id: 'economics', label: 'Экономика', question: 'Сколько это стоит и принесёт' },
  { id: 'verdict', label: 'Решение', question: 'Что делать' },
]

export const stepPath = (projectId: string, step: StepId) => `/projects/${projectId}/${step}`

export function useProjectId(): string {
  const { projectId } = useParams()
  if (!projectId) throw new Error('useProjectId must be used under /projects/:projectId')
  return projectId
}

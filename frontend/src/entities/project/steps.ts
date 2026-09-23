export type ProjectStepId =
  'object' | 'processes' | 'matching' | 'layout' | 'scenarios' | 'comparison' | 'risks' | 'simulation' | 'report'

export type ProjectStep = { id: ProjectStepId; label: string; question: string; soon?: boolean }

// Путь оценки как последовательность вопросов заказчика — так был устроен прототип v0.
export const PROJECT_STEPS: ProjectStep[] = [
  { id: 'object', label: 'Объект', question: 'Вот мой объект' },
  { id: 'processes', label: 'Где деньги', question: 'Что в нём происходит' },
  { id: 'matching', label: 'Подбор', question: 'Какие роботы подходят' },
  { id: 'layout', label: 'Планировка', question: 'Как устроен объект' },
  { id: 'scenarios', label: 'Сценарии', question: 'Сколько роботов и что это стоит' },
  { id: 'comparison', label: 'Сравнение', question: 'Купить, арендовать или оставить как есть' },
  { id: 'risks', label: 'Риски', question: 'Насколько это надёжно' },
  { id: 'simulation', label: 'Имитация', question: 'Справятся ли роботы' },
  { id: 'report', label: 'Отчёт', question: 'Что делать', soon: true },
]

export const stepIndex = (id: string | undefined) => PROJECT_STEPS.findIndex((s) => s.id === id)

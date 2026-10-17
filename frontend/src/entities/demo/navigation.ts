export const DEMO_STEPS = [
  { id: 'object', label: 'Объект', question: 'Какую задачу решаем' },
  { id: 'decision', label: 'Подбор и экономика', question: 'Какие роботы нужны и что это даст' },
  { id: 'simulation', label: 'Имитация', question: 'Как парк работает на плане' },
  { id: 'report', label: 'Отчёт', question: 'Что получилось и как продолжить' },
] as const

export type DemoStep = (typeof DEMO_STEPS)[number]['id']
export const demoStep = (value: string | null): DemoStep =>
  value === 'evidence' ? 'decision' : (DEMO_STEPS.find((s) => s.id === value)?.id ?? 'object')
export const demoUrl = (key: string, step: DemoStep) => `/demo/${encodeURIComponent(key)}?step=${step}`

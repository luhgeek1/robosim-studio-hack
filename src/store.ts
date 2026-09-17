import { create } from 'zustand'
import type { LoadMode, RobotCount, RobotId } from './data/robots'
import { robotById } from './data/robots'
import type { ScenarioId } from './data/economics'

export type Step = 'object' | 'analysis' | 'robots' | 'simulation' | 'economics' | 'verdict'
export const STEPS: { id: Step; label: string; question: string }[] = [
  { id: 'object', label: 'Объект', question: 'Вот мой склад' },
  { id: 'analysis', label: 'Анализ', question: 'Что в нём происходит' },
  { id: 'robots', label: 'Роботы', question: 'Какие роботы подходят' },
  { id: 'simulation', label: 'Симуляция', question: 'Сколько роботов и справятся ли' },
  { id: 'economics', label: 'Экономика', question: 'Сколько это стоит и принесёт' },
  { id: 'verdict', label: 'Решение', question: 'Что делать' },
]

export type ExplainTab = 'why' | 'notTwo' | 'notFour'
export type Selection = { kind: 'zone'; index: number } | { kind: 'robot'; index: number } | null

export type Toast = { id: number; text: string }

type State = {
  step: Step
  visited: Step[]
  robotId: RobotId
  robotCount: RobotCount
  loadMode: LoadMode
  running: boolean
  scenario: ScenarioId
  explainTab: ExplainTab
  confidenceOpen: boolean
  robotDetailsId: RobotId | null
  selection: Selection
  demoStep: number // -1 = not running
  demoCaption: string | null
  toasts: Toast[]
  live: { throughput: number; queue: number; utilization: number; sla: number; zones: [number, number, number, number] }
  setStep: (s: Step) => void
  next: () => void
  prev: () => void
  selectRobot: (id: RobotId) => void
  setRobotCount: (n: RobotCount) => void
  setLoadMode: (m: LoadMode) => void
  setRunning: (r: boolean) => void
  setScenario: (s: ScenarioId) => void
  setExplainTab: (t: ExplainTab) => void
  setConfidenceOpen: (o: boolean) => void
  setRobotDetails: (id: RobotId | null) => void
  setSelection: (s: Selection) => void
  setDemo: (step: number, caption: string | null) => void
  toast: (text: string) => void
  dismissToast: (id: number) => void
  setLive: (l: State['live']) => void
}

let toastSeq = 1

export const useStore = create<State>((set, get) => ({
  step: 'object',
  visited: ['object'],
  robotId: 'ronavi-h1500',
  robotCount: 3,
  loadMode: 'normal',
  running: true,
  scenario: 'purchase',
  explainTab: 'why',
  confidenceOpen: false,
  robotDetailsId: null,
  selection: null,
  demoStep: -1,
  demoCaption: null,
  toasts: [],
  live: { throughput: 128, queue: 4, utilization: 81, sla: 98, zones: [0.71, 0.56, 0.64, 0.48] },
  setStep: (step) =>
    set((s) => ({ step, visited: s.visited.includes(step) ? s.visited : [...s.visited, step], selection: null })),
  next: () => {
    const i = STEPS.findIndex((s) => s.id === get().step)
    if (i < STEPS.length - 1) get().setStep(STEPS[i + 1].id)
  },
  prev: () => {
    const i = STEPS.findIndex((s) => s.id === get().step)
    if (i > 0) get().setStep(STEPS[i - 1].id)
  },
  selectRobot: (id) => set({ robotId: id, robotCount: robotById(id).recommendedCount }),
  setRobotCount: (robotCount) => set({ robotCount }),
  setLoadMode: (loadMode) => set({ loadMode }),
  setRunning: (running) => set({ running }),
  setScenario: (scenario) => set({ scenario }),
  setExplainTab: (explainTab) => set({ explainTab }),
  setConfidenceOpen: (confidenceOpen) => set({ confidenceOpen }),
  setRobotDetails: (robotDetailsId) => set({ robotDetailsId }),
  setSelection: (selection) => set({ selection }),
  setDemo: (demoStep, demoCaption) => set({ demoStep, demoCaption }),
  toast: (text) => {
    const id = toastSeq++
    set((s) => ({ toasts: [...s.toasts, { id, text }] }))
    setTimeout(() => get().dismissToast(id), 3200)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setLive: (live) => set({ live }),
}))

export const useRobot = () => useStore((s) => robotById(s.robotId))
export const useConfig = () => useStore((s) => robotById(s.robotId).configs[s.robotCount])

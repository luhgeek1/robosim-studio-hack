import { create } from 'zustand'
import type { ConfigurationsOut, Project, SimKpis } from './api'

export type Step = 'projects' | 'object' | 'analysis' | 'robots' | 'simulation' | 'economics' | 'verdict'
export type LoadMode = 'normal' | 'peak'

export const STEPS: { id: Exclude<Step, 'projects'>; label: string; question: string }[] = [
  { id: 'object', label: 'Объект', question: 'Вот мой склад' },
  { id: 'analysis', label: 'Анализ', question: 'Что в нём происходит' },
  { id: 'robots', label: 'Роботы', question: 'Какие роботы подходят' },
  { id: 'simulation', label: 'Симуляция', question: 'Сколько роботов и справятся ли' },
  { id: 'economics', label: 'Экономика', question: 'Сколько это стоит и принесёт' },
  { id: 'verdict', label: 'Решение', question: 'Что делать' },
]

export type ExplainTab = 'why' | 'not_fewer' | 'not_more'
export type Selection = { kind: 'zone'; index: number } | { kind: 'robot'; index: number } | null
export type Toast = { id: number; text: string }
export type Live = { throughput: number; queue: number; utilization: number; sla: number; zones: [number, number, number, number] }

type State = {
  step: Step
  project: Project | null
  robotId: string | null
  robotCount: number
  loadMode: LoadMode
  running: boolean
  scenario: 'current' | 'purchase' | 'raas'
  explainTab: ExplainTab
  confidenceOpen: boolean
  robotDetailsId: string | null
  selection: Selection
  demoStep: number
  demoCaption: string | null
  toasts: Toast[]
  live: Live
  /** latest configurations payload for the selected robot; targets for the live loop */
  configurations: ConfigurationsOut | null
  setStep: (s: Step) => void
  next: () => void
  prev: () => void
  openProject: (p: Project) => void
  setProject: (p: Project | null) => void
  selectRobot: (id: string, count?: number) => void
  setRobotCount: (n: number) => void
  setLoadMode: (m: LoadMode) => void
  setRunning: (r: boolean) => void
  setScenario: (s: State['scenario']) => void
  setExplainTab: (t: ExplainTab) => void
  setConfidenceOpen: (o: boolean) => void
  setRobotDetails: (id: string | null) => void
  setSelection: (s: Selection) => void
  setDemo: (step: number, caption: string | null) => void
  setConfigurations: (c: ConfigurationsOut | null) => void
  toast: (text: string) => void
  dismissToast: (id: number) => void
  setLive: (l: Live) => void
}

let toastSeq = 1
const LS_KEY = 'roboscope.project'

export const useStore = create<State>((set, get) => ({
  step: 'projects',
  project: null,
  robotId: null,
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
  live: { throughput: 0, queue: 0, utilization: 0, sla: 100, zones: [0.3, 0.3, 0.3, 0.3] },
  configurations: null,
  setStep: (step) => set({ step, selection: null }),
  next: () => {
    const i = STEPS.findIndex((s) => s.id === get().step)
    if (i < STEPS.length - 1) get().setStep(STEPS[i + 1].id)
  },
  prev: () => {
    const i = STEPS.findIndex((s) => s.id === get().step)
    if (i > 0) get().setStep(STEPS[i - 1].id)
    else get().setStep('projects')
  },
  openProject: (project) => {
    try {
      localStorage.setItem(LS_KEY, project.id)
    } catch {
      /* ignore */
    }
    set({ project, step: 'object', robotId: project.selected_robot_id, robotCount: project.selected_count ?? 3, configurations: null, selection: null })
  },
  setProject: (project) => set({ project }),
  selectRobot: (robotId, count) => set((s) => ({ robotId, robotCount: count ?? s.robotCount, configurations: s.configurations?.robot.id === robotId ? s.configurations : null })),
  setRobotCount: (robotCount) => set({ robotCount }),
  setLoadMode: (loadMode) => set({ loadMode }),
  setRunning: (running) => set({ running }),
  setScenario: (scenario) => set({ scenario }),
  setExplainTab: (explainTab) => set({ explainTab }),
  setConfidenceOpen: (confidenceOpen) => set({ confidenceOpen }),
  setRobotDetails: (robotDetailsId) => set({ robotDetailsId }),
  setSelection: (selection) => set({ selection }),
  setDemo: (demoStep, demoCaption) => set({ demoStep, demoCaption }),
  setConfigurations: (configurations) => set({ configurations }),
  toast: (text) => {
    const id = toastSeq++
    set((s) => ({ toasts: [...s.toasts, { id, text }] }))
    setTimeout(() => get().dismissToast(id), 3600)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setLive: (live) => set({ live }),
}))

export const lastProjectId = (): string | null => {
  try {
    return localStorage.getItem(LS_KEY)
  } catch {
    return null
  }
}

/** Target KPIs for the current robot / count / mode, from the backend simulation. */
export function currentTarget(s: Pick<State, 'configurations' | 'robotCount' | 'loadMode'>): SimKpis | null {
  const cfg = s.configurations?.configurations.find((c) => c.count === s.robotCount)
  return cfg ? cfg[s.loadMode] : null
}

export const useConfiguration = () => useStore((s) => s.configurations?.configurations.find((c) => c.count === s.robotCount) ?? null)

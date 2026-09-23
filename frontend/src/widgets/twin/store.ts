import { useEffect } from 'react'
import { create } from 'zustand'

export type LoadMode = 'normal' | 'peak'
export type Selection = { kind: 'zone'; index: number } | { kind: 'robot'; index: number } | null
export type Live = {
  throughput: number
  queue: number
  utilization: number
  sla: number
  zones: [number, number, number, number]
}

export const ZONE_NAMES = ['Приёмка', 'Хранение', 'Комплектация', 'Отгрузка'] as const
export type ZoneStatus = 'normal' | 'high' | 'critical'
export const zoneStatus = (load: number): ZoneStatus => (load >= 0.9 ? 'critical' : load >= 0.75 ? 'high' : 'normal')
export const ZONE_STATUS_LABEL: Record<ZoneStatus, string> = {
  normal: 'В норме',
  high: 'Высокая нагрузка',
  critical: 'Перегрузка',
}

const IDLE: Live = { throughput: 0, queue: 0, utilization: 0, sla: 100, zones: [0.3, 0.3, 0.3, 0.3] }

type State = {
  running: boolean
  robotCount: number
  loadMode: LoadMode
  selection: Selection
  live: Live
  target: Live | null
  setRunning: (running: boolean) => void
  setRobotCount: (robotCount: number) => void
  setLoadMode: (loadMode: LoadMode) => void
  setSelection: (selection: Selection) => void
  setTarget: (target: Live | null) => void
  setLive: (live: Live) => void
}

export const useTwin = create<State>((set) => ({
  running: true,
  robotCount: 0,
  loadMode: 'normal',
  selection: null,
  live: IDLE,
  target: null,
  setRunning: (running) => set({ running }),
  setRobotCount: (robotCount) => set({ robotCount }),
  setLoadMode: (loadMode) => set({ loadMode }),
  setSelection: (selection) => set({ selection }),
  setTarget: (target) => set({ target }),
  setLive: (live) => set({ live }),
}))

/* Живые KPI плавно подтягиваются к цифрам бэкенда: смена флота видимо копит очередь на приёмке несколько секунд. */
export function useTwinLoop() {
  useEffect(() => {
    let t = 0
    const id = window.setInterval(() => {
      const s = useTwin.getState()
      if (!s.running || !s.target) return
      t += 0.1
      const l = s.live
      const target = s.target
      const ease = (v: number, to: number, k: number) => v + (to - v) * k
      const zones = l.zones.map((z, i) => ease(z, target.zones[i], 0.05)) as Live['zones']
      const wobble = Math.sin(t * 1.7) * 0.6 + Math.sin(t * 0.63) * 0.5
      s.setLive({
        throughput: ease(l.throughput, target.throughput + wobble, 0.08),
        queue: ease(l.queue, target.queue, l.queue < target.queue ? 0.03 : 0.06),
        utilization: ease(l.utilization, target.utilization + wobble * 0.4, 0.06),
        sla: ease(l.sla, target.sla, 0.06),
        zones,
      })
    }, 100)
    return () => window.clearInterval(id)
  }, [])
}

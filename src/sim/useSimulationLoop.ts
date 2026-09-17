import { useEffect } from 'react'
import { useStore } from '../store'
import { robotById } from '../data/robots'

/**
 * Eases the live KPIs toward the target values of the selected configuration.
 * Queue moves slowly on purpose: switching 3 -> 2 robots should visibly
 * accumulate a backlog on the receiving dock over a few seconds.
 */
export function useSimulationLoop() {
  useEffect(() => {
    let t = 0
    const id = window.setInterval(() => {
      const s = useStore.getState()
      if (!s.running) return
      t += 0.1
      const target = robotById(s.robotId).configs[s.robotCount][s.loadMode]
      const l = s.live
      const ease = (v: number, to: number, k: number) => v + (to - v) * k
      const zones = l.zones.map((z, i) => ease(z, target.zones[i], 0.05)) as [number, number, number, number]
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

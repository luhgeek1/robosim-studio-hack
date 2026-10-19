import type { Pose } from '@/entities/simulation'

export const BODY: Record<Pose['state'], string> = {
  moving: '#287d9c',
  load: '#8a5cd6',
  unload: '#8a5cd6',
  idle: '#9aa3ad',
  charge: 'var(--warn)',
  wait: 'var(--crit)',
  fail: '#5b1a14',
}

export const LOADED = '#1d3fb5'

// What a colour means on the plan: the legend under the map reads this list.
export const ROBOT_LEGEND: [string, string][] = [
  [BODY.moving, 'едет пустым'],
  [LOADED, 'везёт груз'],
  [BODY.load, 'берёт или сдаёт груз'],
  [BODY.idle, 'свободен, ждёт задачу'],
  [BODY.wait, 'ждёт в заторе'],
  [BODY.charge, 'на зарядке'],
]

export type HeatEdge = { id: string; traffic: number; wait: number }

// Flow and congestion: width follows the number of passes, colour follows waiting — an edge many robots
// crossed without stopping is busy, not jammed.
export function heatStyle(edge: HeatEdge, maxTraffic: number, maxWait: number) {
  const flow = maxTraffic ? edge.traffic / maxTraffic : 0
  const jam = maxWait ? edge.wait / maxWait : 0
  return {
    color: edge.wait > 0 ? (jam > 0.35 ? 'var(--crit)' : 'var(--warn)') : '#287d9c',
    width: 1.5 + flow * 5,
    opacity: 0.35 + Math.max(flow, jam) * 0.6,
  }
}

export function heatText(edge: HeatEdge): string {
  const passes = `Проездов за прогон: ${edge.traffic}`
  if (edge.wait <= 0) return `${passes}. Роботы здесь не ждали: участок загружен, но затора нет`
  const perPass = edge.traffic ? edge.wait / edge.traffic : 0
  return `${passes}. Роботы ждали здесь ${Math.round(edge.wait)} с суммарно, ≈${perPass.toFixed(1)} с на проезд`
}

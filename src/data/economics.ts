import { demand } from './project'
import type { ConfigEcon, Robot, RobotCount } from './robots'

export type ScenarioId = 'current' | 'purchase' | 'raas'

export type Scenario = {
  id: ScenarioId
  name: string
  caption: string
  capex: number
  opex: number
  tco5y: number
  savings5y: number
  roi5y: number | null
  payback: number | null
  paybackLabel: string
  throughput: number
  sla: number
  robots: number
  recommended: boolean
  note: string
}

const CURRENT_TCO_5Y = 168 // млн ₽ с индексацией зарплат 8 % в год

export function buildScenarios(robot: Robot, count: RobotCount): Scenario[] {
  const c = robot.configs[count]
  const e = c.econ
  const raasOpex = +(e.opex + count * 1.3).toFixed(1)
  const raasNet = +((demand.currentOpex - raasOpex) * 5 * 1.18 - 0.6).toFixed(1)
  const purchaseRecommended = e.net5y > raasNet
  return [
    {
      id: 'current',
      name: 'Как сейчас',
      caption: 'Ручной процесс, без изменений',
      capex: 0,
      opex: demand.currentOpex,
      tco5y: CURRENT_TCO_5Y,
      savings5y: 0,
      roi5y: null,
      payback: null,
      paybackLabel: '—',
      throughput: demand.manualCapacityPerHour,
      sla: demand.currentPeakSla,
      robots: 0,
      recommended: false,
      note: 'Зарплаты растут на 8 % в год, в пик SLA уже не выполняется',
    },
    {
      id: 'purchase',
      name: 'Покупка',
      caption: `${count} × ${robot.name} в собственность`,
      capex: e.capex,
      opex: e.opex,
      tco5y: +(CURRENT_TCO_5Y - e.net5y).toFixed(1),
      savings5y: e.net5y,
      roi5y: e.roi5y,
      payback: e.payback,
      paybackLabel: e.payback ? `${e.payback.toFixed(1).replace('.', ',')} года` : '—',
      throughput: c.normal.throughput,
      sla: c.normal.sla,
      robots: count,
      recommended: purchaseRecommended,
      note: 'Максимальная выгода за 5 лет, укладывается в бюджет',
    },
    {
      id: 'raas',
      name: 'RaaS',
      caption: `${count} × ${robot.name} в аренду`,
      capex: 0.6,
      opex: raasOpex,
      tco5y: +(CURRENT_TCO_5Y - raasNet).toFixed(1),
      savings5y: raasNet,
      roi5y: null,
      payback: 0.3,
      paybackLabel: 'с 4-го месяца',
      throughput: c.normal.throughput,
      sla: c.normal.sla,
      robots: count,
      recommended: !purchaseRecommended,
      note: 'Без капитальных затрат, подходит для пилота на 12 месяцев',
    },
  ]
}

/** Cumulative net position vs "as is", month by month (0..60), млн ₽. */
export function purchaseCurve(e: ConfigEcon): number[] {
  const capex = e.capex
  const paybackM = (e.payback ?? 3.5) * 12
  const target = e.net5y + capex
  const LAG = 5
  const RAMP = 6
  const shape = (g: number) => {
    const out: number[] = [0]
    let acc = 0
    for (let m = 1; m <= 60; m++) {
      let rate = 0
      if (m > LAG && m <= LAG + RAMP) rate = (m - LAG) / (RAMP + 1)
      else if (m > LAG + RAMP) rate = Math.pow(1 + g, (m - LAG - RAMP) / 12)
      acc += rate
      out.push(acc)
    }
    return out
  }
  const at = (arr: number[], m: number) => {
    const i = Math.floor(m)
    const f = m - i
    return arr[Math.min(60, i)] * (1 - f) + arr[Math.min(60, i + 1)] * f
  }
  let lo = 0
  let hi = 3
  let g = 0.2
  const want = target / capex
  for (let i = 0; i < 40; i++) {
    g = (lo + hi) / 2
    const s = shape(g)
    const ratio = s[60] / Math.max(1e-6, at(s, paybackM))
    if (ratio > want) hi = g
    else lo = g
  }
  const s = shape(g)
  const A = capex / Math.max(1e-6, at(s, paybackM))
  return s.map((v) => -capex + A * v)
}

export function raasCurve(net5y: number): number[] {
  const out: number[] = []
  const setup = 0.6
  let acc = -setup
  let sumF = 0
  for (let m = 1; m <= 60; m++) sumF += m > 3 ? Math.pow(1.08, (m - 3) / 12) : 0
  const r = (net5y + setup) / sumF
  out.push(acc)
  for (let m = 1; m <= 60; m++) {
    acc += m > 3 ? r * Math.pow(1.08, (m - 3) / 12) : 0
    out.push(acc)
  }
  return out
}

export const fmtMln = (v: number, digits = 1) =>
  v.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits })

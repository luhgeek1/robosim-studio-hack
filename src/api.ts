/** Typed client for the RoboScope API (backend/app). Shapes mirror backend/app/schemas.py. */

export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

export type Source = 'confirmed' | 'assumption' | 'default' | 'missing'

export type ObjectType = { id: string; label: string; description: string; supported: boolean }

export type Project = {
  id: string
  name: string
  object_type: string
  object_type_label: string
  address: string
  source_file: string
  imported_at: string | null
  created_at: string
  version: number
  confidence: number | null
  recognized: number | null
  total: number | null
  selected_robot_id: string | null
  selected_count: number | null
  supported: boolean
}

export type ParameterValue = {
  key: string
  label: string
  group: string
  value: number | string | boolean | null
  unit: string
  source: Source
  source_value: string
  confidence: number
  note: string
  kind: 'number' | 'text' | 'bool'
  min: number | null
  max: number | null
  out_of_range: boolean
  required: boolean
}

export type ValidationIssue = { key: string; level: 'error' | 'warning'; message: string }
export type ParametersOut = { groups: { title: string; items: ParameterValue[] }[]; parameters: ParameterValue[]; validation: ValidationIssue[] }
export type ConfidenceReport = { score: number; recognized: number; total: number; confirmed: ParameterValue[]; assumptions: ParameterValue[]; missing: ParameterValue[]; warnings: string[] }
export type ImportOut = { project: Project; confidence: number; recognized: number; total: number; provider: string; unmapped: { field: string; value: unknown }[]; warnings: string[] }

export type RobotSpec = { value: number | string | boolean; unit: string; source: string; confidence: number; is_assumption: boolean }
export type RobotOut = {
  id: string
  name: string
  short_name: string
  vendor: string
  category: string
  subtype: string
  scenario: string
  status: string
  trl: number | null
  price_mln: number | null
  description: string
  cases: string
  specs: Record<string, RobotSpec>
  data_quality: 'high' | 'medium' | 'low'
  data_quality_label: string
}
export type Check = { criterion: string; passed: boolean; hard: boolean; text: string }
export type MatchResult = {
  robot: RobotOut
  eligible: boolean
  compatibility: number
  score_breakdown: Record<string, number>
  fits: string[]
  risks: string[]
  checks: Check[]
  required_count: number
  effective_throughput: number
  fleet_capex_mln: number
  summary: string
}

export type SimKpis = {
  throughput: number
  processed_per_hour: number
  queue_avg: number
  queue_max: number
  utilization: number
  sla: number
  escalated: number
  zones: [number, number, number, number]
  robots: number
  load_mode: 'normal' | 'peak'
}
export type SimEvent = { time: number; robot_id: string; state: string; from: string | null; to: string | null; queue: number }
export type EconResult = {
  capex_mln: number
  capex_breakdown: Record<string, number>
  opex_mln: number
  opex_breakdown: Record<string, number>
  current_opex_mln: number
  savings_year_mln: number
  net_savings_5y_mln: number
  roi_5y: number | null
  payback_years: number | null
  replaced_fte: number
  manual_overflow_pallets: number
  curve: number[]
}
export type Configuration = { count: number; normal: SimKpis; peak: SimKpis; econ: EconResult; meets_sla: boolean; status: 'under' | 'optimal' | 'over' }
export type Explanation = { title: string; body: string; points: string[] }
export type ConfigurationsOut = {
  robot: RobotOut
  sizing: Record<string, number | string>
  configurations: Configuration[]
  recommended_count: number | null
  explanations: Record<'why' | 'not_fewer' | 'not_more', Explanation>
}
export type Scenario = {
  id: 'current' | 'purchase' | 'raas'
  name: string
  caption: string
  capex: number
  opex: number
  tco5y: number
  savings5y: number
  roi5y: number | null
  payback: number | null
  payback_label: string
  throughput: number
  sla: number
  robots: number
  recommended: boolean
  note: string
  curve: number[]
}
export type Recommendation = {
  verdict: 'recommended' | 'conditional' | 'not_recommended'
  headline: string
  robot: RobotOut | null
  count: number | null
  capex_mln: number | null
  payback_years: number | null
  roi_5y: number | null
  sla: number | null
  throughput: number | null
  key_benefit: string
  key_risk: string
  next_steps: string[]
  user_choice_note: string | null
  executive_summary: string
}
export type Analysis = {
  hourly: { hour: number; value: number }[]
  demand: { average: number; peak: number; manual_capacity: number; required: number; sla_target: number; current_sla: number; current_opex: number; budget: number; daily_total: number; operators: number; working_hours: number }
  hours_over_capacity: number
  findings: { tone: 'ok' | 'warn' | 'crit'; text: string }[]
  requirements: { value: string; label: string }[]
  flow: { name: string; value: string; unit: string; note: string; tone: 'ok' | 'warn' | 'neutral' }[]
  validation: ValidationIssue[]
  suitable: boolean
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { headers: init?.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' }, ...init })
  } catch {
    throw new ApiError(0, 'Сервер расчётов недоступен. Запустите backend: cd backend && .venv/bin/uvicorn app.main:app --port 8000')
  }
  if (!res.ok) {
    let detail = res.statusText
    try {
      const j = await res.json()
      detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
    } catch {
      /* keep statusText */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const q = (params: Record<string, string | number | null | undefined>) => {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined) s.set(k, String(v))
  const str = s.toString()
  return str ? `?${str}` : ''
}

export const api = {
  health: () => request<{ status: string }>('/api/health'),
  objectTypes: () => request<ObjectType[]>('/api/object-types'),
  projects: () => request<Project[]>('/api/projects'),
  project: (id: string) => request<Project>(`/api/projects/${id}`),
  createProject: (body: { name: string; object_type: string; address?: string }) => request<Project>('/api/projects', { method: 'POST', body: JSON.stringify(body) }),
  deleteProject: (id: string) => request<void>(`/api/projects/${id}`, { method: 'DELETE' }),
  importDemo: (id: string) => request<ImportOut>(`/api/projects/${id}/import/demo`, { method: 'POST' }),
  importFile: (id: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return request<ImportOut>(`/api/projects/${id}/import`, { method: 'POST', body: fd })
  },
  parameters: (id: string) => request<ParametersOut>(`/api/projects/${id}/parameters`),
  patchParameters: (id: string, values: Record<string, unknown>) => request<ParametersOut>(`/api/projects/${id}/parameters`, { method: 'PATCH', body: JSON.stringify({ values }) }),
  confidence: (id: string) => request<ConfidenceReport>(`/api/projects/${id}/confidence`),
  analysis: (id: string) => request<Analysis>(`/api/projects/${id}/analysis`),
  matching: (id: string) => request<MatchResult[]>(`/api/projects/${id}/matching`),
  configurations: (id: string, robotId?: string | null) => request<ConfigurationsOut>(`/api/projects/${id}/configurations${q({ robot_id: robotId })}`),
  simulation: (id: string, robotId: string, count: number, load: 'normal' | 'peak') =>
    request<{ kpis: SimKpis; events: SimEvent[] }>(`/api/projects/${id}/simulation${q({ robot_id: robotId, count, load })}`),
  scenarios: (id: string, robotId: string, count: number) => request<Scenario[]>(`/api/projects/${id}/scenarios${q({ robot_id: robotId, count })}`),
  recommendation: (id: string, robotId?: string | null, count?: number | null) => request<Recommendation>(`/api/projects/${id}/recommendation${q({ robot_id: robotId, count })}`),
  setSelection: (id: string, body: { robot_id?: string; count?: number }) => request<Project>(`/api/projects/${id}/selection`, { method: 'PUT', body: JSON.stringify(body) }),
  report: (id: string, robotId?: string | null, count?: number | null) => request<{ summary: string }>(`/api/projects/${id}/report${q({ robot_id: robotId, count })}`, { method: 'POST' }),
}

export const fmt = {
  mln: (v: number | null | undefined, d = 1) => (v === null || v === undefined ? '—' : v.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d })),
  int: (v: number | null | undefined) => (v === null || v === undefined ? '—' : Math.round(v).toLocaleString('ru-RU')),
  years: (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} года`),
}

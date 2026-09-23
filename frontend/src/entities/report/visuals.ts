import { useMutation } from '@tanstack/react-query'
import { create } from 'zustand'
import { api } from '@/shared/api/client'
import type { Res } from '@/shared/api/types'

export type ReportVisual = { id: string; caption: string; simulationId: string; createdAt: string }

const storageKey = (projectId: string) => `rs:report-visuals:${projectId}`

function read(projectId: string): ReportVisual[] {
  try {
    const raw = localStorage.getItem(storageKey(projectId))
    return raw ? (JSON.parse(raw) as ReportVisual[]) : []
  } catch {
    return []
  }
}

function write(projectId: string, visuals: ReportVisual[]) {
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(visuals))
  } catch {
    // Storage may be blocked (private mode): the list then lives until the tab closes.
  }
}

type VisualsState = {
  byProject: Record<string, ReportVisual[]>
  list: (projectId: string) => ReportVisual[]
  add: (projectId: string, visual: ReportVisual) => void
  remove: (projectId: string, id: string) => void
}

// Snapshots of the player picked for the PDF (ТЗ 3.7.4). The backend stores the files; which ones go into the
// report is the user's choice, kept per project in the browser.
export const useReportVisuals = create<VisualsState>((set, get) => ({
  byProject: {},
  list: (projectId) => get().byProject[projectId] ?? read(projectId),
  add: (projectId, visual) => {
    const next = [...get().list(projectId), visual]
    write(projectId, next)
    set((s) => ({ byProject: { ...s.byProject, [projectId]: next } }))
  },
  remove: (projectId, id) => {
    const next = get()
      .list(projectId)
      .filter((v) => v.id !== id)
    write(projectId, next)
    set((s) => ({ byProject: { ...s.byProject, [projectId]: next } }))
  },
}))

export const useProjectVisuals = (projectId: string) =>
  useReportVisuals((s) => s.byProject[projectId]) ?? read(projectId)

export function useUploadVisual(projectId: string) {
  return useMutation({
    mutationFn: async ({ simulationId, png, caption }: { simulationId: string; png: Blob; caption: string }) => {
      const form = new FormData()
      form.append('file', png, 'simulation.png')
      form.append('kind', 'simulation_png')
      form.append('caption', caption.slice(0, 300))
      const { data } = await api.post<Res<'/api/v1/simulations/{simulation_id}/visuals', 'post'>>(
        `/simulations/${simulationId}/visuals`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      useReportVisuals
        .getState()
        .add(projectId, { id: data.id, caption, simulationId, createdAt: new Date().toISOString() })
      return data
    },
  })
}

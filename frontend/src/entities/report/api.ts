import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { qk } from '@/shared/api/keys'
import type { Report, ReportFormat, Res } from '@/shared/api/types'
import { downloadFile } from '@/shared/lib/download'

const POLL_MS = 1500
// PDF and Excel build in 1–2 s (D-021); two minutes covers a busy worker without polling forever.
const POLL_LIMIT = 80

export const REPORT_EXTENSION: Record<ReportFormat, string> = { pdf: 'pdf', xlsx: 'xlsx', docx: 'docx', json: 'json' }

export const reportApi = {
  list: (projectId: string) =>
    api
      .get<Res<'/api/v1/projects/{project_id}/reports', 'get'>>(`/projects/${projectId}/reports`)
      .then((r) => r.data.items),
  create: (projectId: string, body: { format: ReportFormat; visual_ids?: string[] }) =>
    api
      .post<Res<'/api/v1/projects/{project_id}/reports', 'post'>>(`/projects/${projectId}/reports`, body)
      .then((r) => r.data),
  get: (id: string) => api.get<Res<'/api/v1/reports/{report_id}', 'get'>>(`/reports/${id}`).then((r) => r.data),
}

const reportsKey = (projectId: string) => [...qk.projects.one(projectId), 'reports'] as const

const safeName = (title: string) => title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Отчёт'

export const downloadReport = (report: Report, title: string) =>
  downloadFile(`/reports/${report.id}/download`, `${safeName(title)}.${REPORT_EXTENSION[report.format]}`)

export const useReports = (projectId: string) =>
  useQuery({ queryKey: reportsKey(projectId), queryFn: () => reportApi.list(projectId) })

// Отчёт — фоновая задача (ТЗ 3.7.1–3.7.3): создать, дождаться файла и скачать его с токеном.
export function useMakeReport(projectId: string, title: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { format: ReportFormat; visual_ids?: string[] }) => {
      let report = await reportApi.create(projectId, body)
      for (let attempt = 0; report.status === 'queued' || report.status === 'running'; attempt++) {
        if (attempt >= POLL_LIMIT) throw new Error('Отчёт не собрался за 2 минуты — попробуйте ещё раз')
        await new Promise((resolve) => setTimeout(resolve, POLL_MS))
        report = await reportApi.get(report.id)
      }
      if (report.status !== 'done') throw new Error(report.error?.detail ?? 'Отчёт не сформировался')
      await downloadReport(report, title)
      return report
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: reportsKey(projectId) }),
    meta: { silent: true },
  })
}

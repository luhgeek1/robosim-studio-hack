import { useMutation } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Res } from '@/api/types'
import { downloadFile } from '@/lib/download'

export type ReportFormat = 'pdf' | 'xlsx'

const POLL_MS = 1500
const EXTENSION: Record<ReportFormat, string> = { pdf: 'pdf', xlsx: 'xlsx' }

export const reportApi = {
  create: (projectId: string, format: ReportFormat) =>
    api
      .post<Res<'/api/v1/projects/{project_id}/reports', 'post'>>(`/projects/${projectId}/reports`, { format })
      .then((r) => r.data),
  get: (id: string) => api.get<Res<'/api/v1/reports/{report_id}', 'get'>>(`/reports/${id}`).then((r) => r.data),
}

// Reports are background jobs (ТЗ 3.7.2–3.7.3): create, wait until the file exists, then download it with the token.
export function useMakeReport(projectId: string, fileTitle: string) {
  return useMutation({
    meta: { silent: true },
    mutationFn: async (format: ReportFormat) => {
      let report = await reportApi.create(projectId, format)
      while (report.status === 'queued' || report.status === 'running') {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS))
        report = await reportApi.get(report.id)
      }
      if (report.status !== 'done') throw new Error(report.error?.detail ?? 'Отчёт не сформировался')
      const name = `${fileTitle.replace(/[\\/:*?"<>|]+/g, ' ')}.${EXTENSION[format]}`
      await downloadFile(`/reports/${report.id}/download`, name)
      return report
    },
  })
}

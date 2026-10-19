import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { qk } from '@/shared/api/keys'
import type { LayoutGenerateRequest, LayoutUpdate, Res } from '@/shared/api/types'
import { useInvalidateProject } from '@/shared/api/invalidate'

export const layoutApi = {
  update: (projectId: string, body: LayoutUpdate) =>
    api
      .put<Res<'/api/v1/projects/{project_id}/layout', 'put'>>(`/projects/${projectId}/layout`, body)
      .then((r) => r.data),
  get: (projectId: string) =>
    api.get<Res<'/api/v1/projects/{project_id}/layout', 'get'>>(`/projects/${projectId}/layout`).then((r) => r.data),
  generate: (projectId: string, body: LayoutGenerateRequest) =>
    api
      .post<Res<'/api/v1/projects/{project_id}/layout/generate', 'post'>>(
        `/projects/${projectId}/layout/generate`,
        body,
      )
      .then((r) => r.data),
}

export function useUpdateLayout(projectId: string) {
  const invalidate = useInvalidateProject()
  return useMutation({
    mutationFn: (body: LayoutUpdate) => layoutApi.update(projectId, body),
    meta: { silent: true },
    onSuccess: () => invalidate(projectId),
  })
}

export const useLayout = (projectId: string, enabled = true) =>
  useQuery({
    queryKey: qk.projects.layout(projectId),
    queryFn: () => layoutApi.get(projectId),
    enabled: Boolean(projectId) && enabled,
    retry: false,
  })

export function useGenerateLayout(projectId: string) {
  const invalidate = useInvalidateProject()
  return useMutation({
    mutationFn: (body: LayoutGenerateRequest) => layoutApi.generate(projectId, body),
    // The regenerate dialog shows 409 (missing params, no generator) inline.
    meta: { silent: true },
    onSuccess: () => invalidate(projectId),
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { qk } from '@/api/keys'
import { useInvalidateProject } from '@/api/invalidate'
import type { ImportApply, ImportResult, ParamUpsert, ProjectCreate, ProjectUpdate, Res } from '@/api/types'

export const projectApi = {
  list: () => api.get<Res<'/api/v1/projects', 'get'>>('/projects', { params: { page_size: 200 } }).then((r) => r.data),
  get: (id: string) => api.get<Res<'/api/v1/projects/{project_id}', 'get'>>(`/projects/${id}`).then((r) => r.data),
  create: (body: ProjectCreate) => api.post<Res<'/api/v1/projects', 'post'>>('/projects', body).then((r) => r.data),
  update: (id: string, body: ProjectUpdate) =>
    api.patch<Res<'/api/v1/projects/{project_id}', 'patch'>>(`/projects/${id}`, body).then((r) => r.data),
  remove: (id: string) => api.delete(`/projects/${id}`).then(() => undefined),
  copy: (id: string, name?: string) =>
    api.post<Res<'/api/v1/projects/{project_id}/copy', 'post'>>(`/projects/${id}/copy`, { name }).then((r) => r.data),
  audit: (id: string) =>
    api
      .get<Res<'/api/v1/projects/{project_id}/audit', 'get'>>(`/projects/${id}/audit`, { params: { page_size: 50 } })
      .then((r) => r.data),
  params: (id: string) =>
    api.get<Res<'/api/v1/projects/{project_id}/params', 'get'>>(`/projects/${id}/params`).then((r) => r.data),
  updateParam: (id: string, body: ParamUpsert) =>
    api
      .patch<Res<'/api/v1/projects/{project_id}/params/{key}', 'patch'>>(`/projects/${id}/params/${body.key}`, body)
      .then((r) => r.data),
  resetParam: (id: string, key: string) =>
    api
      .delete<Res<'/api/v1/projects/{project_id}/params/{key}', 'delete'>>(`/projects/${id}/params/${key}`)
      .then((r) => r.data),
  paramHistory: (id: string, key: string) =>
    api
      .get<Res<'/api/v1/projects/{project_id}/params/{key}/history', 'get'>>(`/projects/${id}/params/${key}/history`)
      .then((r) => r.data.items),
  validation: (id: string) =>
    api.get<Res<'/api/v1/projects/{project_id}/validation', 'get'>>(`/projects/${id}/validation`).then((r) => r.data),
  dataQuality: (id: string) =>
    api
      .get<Res<'/api/v1/projects/{project_id}/data-quality', 'get'>>(`/projects/${id}/data-quality`)
      .then((r) => r.data),
  processes: (id: string) =>
    api.get<Res<'/api/v1/projects/{project_id}/processes', 'get'>>(`/projects/${id}/processes`).then((r) => r.data),
  importFile: (id: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api
      .post<ImportResult>(`/projects/${id}/import`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data)
  },
  applyImport: (id: string, importId: string, body: ImportApply) =>
    api
      .post<Res<'/api/v1/projects/{project_id}/import/{import_id}/apply', 'post'>>(
        `/projects/${id}/import/${importId}/apply`,
        body,
      )
      .then((r) => r.data),
}

export const useProjects = () => useQuery({ queryKey: qk.projects.list, queryFn: projectApi.list })

export const useProject = (id: string) =>
  useQuery({ queryKey: qk.projects.one(id), queryFn: () => projectApi.get(id), enabled: Boolean(id) })

export const useProjectParams = (id: string) =>
  useQuery({ queryKey: qk.projects.params(id), queryFn: () => projectApi.params(id), enabled: Boolean(id) })

export const useValidation = (id: string) =>
  useQuery({ queryKey: qk.projects.validation(id), queryFn: () => projectApi.validation(id), enabled: Boolean(id) })

export const useDataQuality = (id: string) =>
  useQuery({ queryKey: qk.projects.dataQuality(id), queryFn: () => projectApi.dataQuality(id), enabled: Boolean(id) })

export const useProcesses = (id: string) =>
  useQuery({ queryKey: qk.projects.processes(id), queryFn: () => projectApi.processes(id), enabled: Boolean(id) })

export const useAudit = (id: string) =>
  useQuery({ queryKey: qk.projects.audit(id), queryFn: () => projectApi.audit(id), enabled: Boolean(id) })

export const useParamHistory = (id: string, key: string, enabled: boolean) =>
  useQuery({
    queryKey: [...qk.projects.params(id), key, 'history'],
    queryFn: () => projectApi.paramHistory(id, key),
    enabled,
  })

export function useCreateProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: projectApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.projects.list }),
  })
}

export function useCopyProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name?: string }) => projectApi.copy(id, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.projects.list }),
  })
}

export function useDeleteProject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: projectApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.projects.list }),
  })
}

export function useUpdateProject(id: string) {
  const invalidate = useInvalidateProject()
  return useMutation({
    mutationFn: (body: ProjectUpdate) => projectApi.update(id, body),
    onSuccess: () => invalidate(id),
  })
}

export function useUpdateParam(id: string) {
  const invalidate = useInvalidateProject()
  return useMutation({
    mutationFn: (body: ParamUpsert) => projectApi.updateParam(id, body),
    onSuccess: () => invalidate(id),
  })
}

export function useResetParam(id: string) {
  const invalidate = useInvalidateProject()
  return useMutation({ mutationFn: (key: string) => projectApi.resetParam(id, key), onSuccess: () => invalidate(id) })
}

export function useImportFile(id: string) {
  return useMutation({ mutationFn: (file: File) => projectApi.importFile(id, file) })
}

export function useApplyImport(id: string) {
  const invalidate = useInvalidateProject()
  return useMutation({
    mutationFn: ({ importId, body }: { importId: string; body: ImportApply }) =>
      projectApi.applyImport(id, importId, body),
    onSuccess: () => invalidate(id),
  })
}

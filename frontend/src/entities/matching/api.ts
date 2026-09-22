import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { qk } from '@/shared/api/keys'
import type { CandidateStatus, MatchingRunRequest, Res } from '@/shared/api/types'

export const matchingApi = {
  get: (projectId: string) =>
    api
      .get<Res<'/api/v1/projects/{project_id}/matching', 'get'>>(`/projects/${projectId}/matching`)
      .then((r) => r.data),
  run: (projectId: string, body: MatchingRunRequest) =>
    api
      .post<Res<'/api/v1/projects/{project_id}/matching', 'post'>>(`/projects/${projectId}/matching`, body)
      .then((r) => r.data),
}

export const useMatching = (projectId: string) =>
  useQuery({ queryKey: qk.projects.matching(projectId), queryFn: () => matchingApi.get(projectId), retry: false })

export function useRunMatching(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: MatchingRunRequest) => matchingApi.run(projectId, body),
    onSuccess: (data) => queryClient.setQueryData(qk.projects.matching(projectId), data),
  })
}

export const CANDIDATE_STATUS_LABEL: Record<CandidateStatus, string> = {
  fit: 'Подходит',
  check: 'Требует проверки',
  excluded: 'Не подходит',
  manual: 'Добавлен вручную',
}

export const CRITERION_LABEL: Record<string, string> = {
  performance: 'Производительность',
  cost_efficiency: 'Стоимость',
  infrastructure_fit: 'Инфраструктура',
  maturity: 'Зрелость',
  data_quality: 'Полнота данных',
  references: 'Внедрения',
}

import { useQuery } from '@tanstack/react-query'
import { api, apiUrl } from '@/api/client'
import { qk } from '@/api/keys'
import type { Res } from '@/api/types'

const HOUR = 60 * 60 * 1000

export const referenceApi = {
  objectTypes: () => api.get<Res<'/api/v1/object-types', 'get'>>('/object-types').then((r) => r.data.items),
  objectType: (key: string) =>
    api.get<Res<'/api/v1/object-types/{object_type}', 'get'>>(`/object-types/${key}`).then((r) => r.data),
  norms: (objectType?: string) =>
    api.get<Res<'/api/v1/norms', 'get'>>('/norms', { params: { object_type: objectType } }).then((r) => r.data),
  version: () => api.get<Res<'/api/v1/version', 'get'>>('/version').then((r) => r.data),
  templateUrl: (objectType: string) => apiUrl(`/object-types/${objectType}/template.xlsx`),
}

export const useObjectTypes = () =>
  useQuery({ queryKey: qk.objectTypes, queryFn: referenceApi.objectTypes, staleTime: HOUR })

export const useObjectType = (key: string | undefined) =>
  useQuery({
    queryKey: qk.objectType(key ?? ''),
    queryFn: () => referenceApi.objectType(key!),
    enabled: Boolean(key),
    staleTime: HOUR,
  })

export const useSystemVersion = () => useQuery({ queryKey: qk.version, queryFn: referenceApi.version, staleTime: HOUR })

export const useNorms = (objectType?: string) =>
  useQuery({
    queryKey: ['norms', objectType ?? null],
    queryFn: () => referenceApi.norms(objectType),
    staleTime: HOUR,
  })

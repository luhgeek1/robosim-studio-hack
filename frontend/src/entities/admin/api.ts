import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { qk } from '@/shared/api/keys'
import type {
  AdminUserUpdate,
  AnalyticsOverview,
  NormSetCreate,
  ProductDetail,
  ProductWrite,
  Res,
  SpecWrite,
  User,
  UserList,
} from '@/shared/api/types'

const HOUR = 60 * 60 * 1000

export type UsersQuery = { q?: string; role?: string; page?: number; page_size?: number }

export const adminApi = {
  analytics: () => api.get<AnalyticsOverview>('/admin/analytics/overview').then((r) => r.data),
  users: (query: UsersQuery) => api.get<UserList>('/admin/users', { params: query }).then((r) => r.data),
  updateUser: (id: string, body: AdminUserUpdate) => api.patch<User>(`/admin/users/${id}`, body).then((r) => r.data),
  createProduct: (body: ProductWrite) => api.post<ProductDetail>('/admin/catalog/products', body).then((r) => r.data),
  updateProduct: (id: string, body: ProductWrite) =>
    api.patch<ProductDetail>(`/admin/catalog/products/${id}`, body).then((r) => r.data),
  deleteProduct: (id: string) => api.delete(`/admin/catalog/products/${id}`).then(() => undefined),
  upsertSpecs: (id: string, specs: SpecWrite[]) =>
    api.put<ProductDetail>(`/admin/catalog/products/${id}/specs`, { specs }).then((r) => r.data),
  publishNormSet: (body: NormSetCreate) =>
    api.post<Res<'/api/v1/admin/norm-sets', 'post'>>('/admin/norm-sets', body).then((r) => r.data),
  solutionTypes: () => api.get<Res<'/api/v1/solution-types', 'get'>>('/solution-types').then((r) => r.data.items),
  industries: () => api.get<Res<'/api/v1/industries', 'get'>>('/industries').then((r) => r.data.items),
  specKeys: () => api.get<Res<'/api/v1/catalog/spec-keys', 'get'>>('/catalog/spec-keys').then((r) => r.data.items),
  normSets: () => api.get<Res<'/api/v1/norm-sets', 'get'>>('/norm-sets').then((r) => r.data.items),
  norms: (version?: string) =>
    api.get<Res<'/api/v1/norms', 'get'>>('/norms', { params: { version } }).then((r) => r.data),
}

export const useAdminAnalytics = () => useQuery({ queryKey: qk.admin.analytics, queryFn: adminApi.analytics })

export const useAdminUsers = (query: UsersQuery) =>
  useQuery({
    queryKey: qk.admin.users(query),
    queryFn: () => adminApi.users(query),
    placeholderData: keepPreviousData,
  })

export const useSolutionTypes = () =>
  useQuery({ queryKey: qk.reference.solutionTypes, queryFn: adminApi.solutionTypes, staleTime: HOUR })

export const useIndustries = () =>
  useQuery({ queryKey: qk.reference.industries, queryFn: adminApi.industries, staleTime: HOUR })

export const useSpecKeys = () =>
  useQuery({ queryKey: qk.reference.specKeys, queryFn: adminApi.specKeys, staleTime: HOUR })

export const useNormSets = () => useQuery({ queryKey: qk.reference.normSets, queryFn: adminApi.normSets })

export const useNormsVersion = (version?: string) =>
  useQuery({ queryKey: qk.reference.norms(version), queryFn: () => adminApi.norms(version) })

export function useUpdateUser() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: AdminUserUpdate }) => adminApi.updateUser(id, body),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.admin.all }),
  })
}

// Правка каталога меняет его версию: сохранённые расчёты и подбор становятся устаревшими, их списки перечитываем.
function useCatalogWrite<A, R>(mutationFn: (args: A) => Promise<R>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['catalog'] }),
        client.invalidateQueries({ queryKey: qk.admin.all }),
        client.invalidateQueries({ queryKey: qk.projects.all }),
        client.invalidateQueries({ queryKey: qk.version }),
      ]),
  })
}

export const useCreateProduct = () => useCatalogWrite((body: ProductWrite) => adminApi.createProduct(body))
export const useUpdateProduct = () =>
  useCatalogWrite(({ id, body }: { id: string; body: ProductWrite }) => adminApi.updateProduct(id, body))
export const useDeleteProduct = () => useCatalogWrite((id: string) => adminApi.deleteProduct(id))
export const useUpsertSpecs = () =>
  useCatalogWrite(({ id, specs }: { id: string; specs: SpecWrite[] }) => adminApi.upsertSpecs(id, specs))

export function usePublishNormSet() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: adminApi.publishNormSet,
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['reference'] }),
        client.invalidateQueries({ queryKey: ['norms'] }),
        client.invalidateQueries({ queryKey: qk.projects.all }),
        client.invalidateQueries({ queryKey: qk.scenarios.all }),
        client.invalidateQueries({ queryKey: qk.version }),
      ]),
  })
}

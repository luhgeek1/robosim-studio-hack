import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { qk, type CatalogQuery } from '@/api/keys'
import type { CompareResult, Res } from '@/api/types'

export const catalogApi = {
  products: (query: CatalogQuery) =>
    api.get<Res<'/api/v1/catalog/products', 'get'>>('/catalog/products', { params: query }).then((r) => r.data),
  facets: (objectType?: string) =>
    api
      .get<Res<'/api/v1/catalog/facets', 'get'>>('/catalog/facets', { params: { object_type: objectType } })
      .then((r) => r.data),
  product: (id: string) =>
    api.get<Res<'/api/v1/catalog/products/{product_id}', 'get'>>(`/catalog/products/${id}`).then((r) => r.data),
  compare: (ids: string[], projectId?: string) =>
    api
      .post<CompareResult>('/catalog/compare', { product_ids: ids, project_id: projectId ?? null })
      .then((r) => r.data),
}

export const useProducts = (query: CatalogQuery) =>
  useQuery({
    queryKey: qk.catalog.products(query),
    queryFn: () => catalogApi.products(query),
    placeholderData: keepPreviousData,
  })

export const useCatalogFacets = (objectType?: string) =>
  useQuery({
    queryKey: qk.catalog.facets(objectType),
    queryFn: () => catalogApi.facets(objectType),
    staleTime: 5 * 60_000,
  })

export const useProduct = (id: string | undefined) =>
  useQuery({ queryKey: qk.catalog.product(id ?? ''), queryFn: () => catalogApi.product(id!), enabled: Boolean(id) })

export const useCompare = (ids: string[], projectId?: string) =>
  useQuery({
    queryKey: qk.catalog.compare(ids, projectId),
    queryFn: () => catalogApi.compare(ids, projectId),
    enabled: ids.length >= 2,
  })

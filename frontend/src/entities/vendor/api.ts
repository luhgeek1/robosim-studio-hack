import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api/client'
import { qk } from '@/shared/api/keys'
import type {
  Proposal,
  ProposalList,
  ProposalReview,
  ProposalStatus,
  ProposalWrite,
  Res,
  VendorFit,
  VendorOverview,
} from '@/shared/api/types'

const HOUR = 60 * 60 * 1000
// Очередь модерации и счётчик в шапке админки обновляются сами: заявки приходят без действий администратора.
const QUEUE_POLL_MS = 60_000

export const vendorApi = {
  overview: () => api.get<VendorOverview>('/vendor/overview').then((r) => r.data),
  fit: () => api.get<VendorFit>('/vendor/fit').then((r) => r.data),
  proposals: () => api.get<ProposalList>('/vendor/proposals').then((r) => r.data),
  createProposal: (body: ProposalWrite) => api.post<Proposal>('/vendor/proposals', body).then((r) => r.data),
  withdrawProposal: (id: string) => api.post<Proposal>(`/vendor/proposals/${id}/withdraw`).then((r) => r.data),
  queue: (status?: ProposalStatus) =>
    api.get<ProposalList>('/admin/proposals', { params: { status } }).then((r) => r.data),
  review: (id: string, body: ProposalReview) =>
    api.post<Proposal>(`/admin/proposals/${id}/review`, body).then((r) => r.data),
  manufacturers: () =>
    api.get<Res<'/api/v1/admin/manufacturers', 'get'>>('/admin/manufacturers').then((r) => r.data.items),
}

export const useVendorOverview = (enabled = true) =>
  useQuery({ queryKey: qk.vendor.overview, queryFn: vendorApi.overview, enabled, retry: false })

// Подбор по проектам платформы считается секунды — держим результат пять минут, а не пересчитываем на каждый заход.
export const useVendorFit = () =>
  useQuery({ queryKey: qk.vendor.fit, queryFn: vendorApi.fit, staleTime: 5 * 60 * 1000 })

export const useMyProposals = () => useQuery({ queryKey: qk.vendor.proposals, queryFn: vendorApi.proposals })

export function useCreateProposal() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: vendorApi.createProposal,
    onSuccess: () => client.invalidateQueries({ queryKey: qk.vendor.all }),
  })
}

export function useWithdrawProposal() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: vendorApi.withdrawProposal,
    onSuccess: () => client.invalidateQueries({ queryKey: qk.vendor.all }),
  })
}

export const useProposalQueue = (status?: ProposalStatus, enabled = true) =>
  useQuery({
    queryKey: qk.proposals.queue(status),
    queryFn: () => vendorApi.queue(status),
    enabled,
    refetchInterval: QUEUE_POLL_MS,
  })

// Одобренная заявка меняет каталог и его версию — как ручная правка администратора.
export function useReviewProposal() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ProposalReview }) => vendorApi.review(id, body),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: qk.proposals.all }),
        client.invalidateQueries({ queryKey: ['catalog'] }),
        client.invalidateQueries({ queryKey: qk.admin.all }),
        client.invalidateQueries({ queryKey: qk.projects.all }),
        client.invalidateQueries({ queryKey: qk.version }),
      ]),
  })
}

export const useManufacturers = () =>
  useQuery({ queryKey: qk.manufacturers, queryFn: vendorApi.manufacturers, staleTime: HOUR })

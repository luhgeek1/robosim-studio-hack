import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from '@/entities/session'
import { api } from '@/shared/api/client'
import { qk } from '@/shared/api/keys'
import type { Res } from '@/shared/api/types'
import { useWorkspaceStore } from './workspace'

const ORG = '/api/v1/organizations/{organization_id}' as const

export const organizationApi = {
  list: () => api.get<Res<'/api/v1/organizations', 'get'>>('/organizations').then((r) => r.data.items),
  get: (id: string) => api.get<Res<typeof ORG, 'get'>>(`/organizations/${id}`).then((r) => r.data),
  create: (name: string) =>
    api.post<Res<'/api/v1/organizations', 'post'>>('/organizations', { name }).then((r) => r.data),
  rename: (id: string, name: string) =>
    api.patch<Res<typeof ORG, 'patch'>>(`/organizations/${id}`, { name }).then((r) => r.data),
  remove: (id: string) => api.delete(`/organizations/${id}`).then(() => undefined),
  invite: (id: string, email: string) =>
    api
      .post<Res<'/api/v1/organizations/{organization_id}/invitations', 'post'>>(`/organizations/${id}/invitations`, {
        email,
      })
      .then((r) => r.data),
  revoke: (id: string, invitationId: string) =>
    api.delete(`/organizations/${id}/invitations/${invitationId}`).then(() => undefined),
  removeMember: (id: string, userId: string) =>
    api.delete(`/organizations/${id}/members/${userId}`).then(() => undefined),
  incoming: () => api.get<Res<'/api/v1/me/invitations', 'get'>>('/me/invitations').then((r) => r.data.items),
  accept: (invitationId: string) =>
    api
      .post<Res<'/api/v1/me/invitations/{invitation_id}/accept', 'post'>>(`/me/invitations/${invitationId}/accept`)
      .then((r) => r.data),
  decline: (invitationId: string) => api.post(`/me/invitations/${invitationId}/decline`).then(() => undefined),
}

export function useOrganizations() {
  const { user } = useSession()
  return useQuery({ queryKey: qk.organizations.list, queryFn: organizationApi.list, enabled: !!user })
}

export const useOrganization = (id: string) =>
  useQuery({ queryKey: qk.organizations.one(id), queryFn: () => organizationApi.get(id) })

// Приглашения приходят от других людей — опрашиваем, чтобы колокольчик ожил без перезагрузки.
export function useIncomingInvitations() {
  const { user } = useSession()
  return useQuery({
    queryKey: qk.organizations.invitations,
    queryFn: organizationApi.incoming,
    enabled: !!user,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
}

/* Текущая рабочая область вместе с данными организации. Если пользователь вышел из организации или её удалили,
   выбор сам возвращается в личное пространство. */
export function useWorkspace() {
  const id = useWorkspaceStore((s) => s.id)
  const select = useWorkspaceStore((s) => s.select)
  const organizations = useOrganizations()
  const items = organizations.data ?? []
  const organization = id ? items.find((o) => o.id === id) : undefined
  const stale = !!id && !!organizations.data && !organization
  useEffect(() => {
    if (stale) select(null)
  }, [stale, select])
  return { id: stale ? null : id, organization, organizations: items, select }
}

function useOrgMutation<T, R>(fn: (vars: T) => Promise<R>, extra: (vars: T) => readonly unknown[][] = () => []) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (_, vars) =>
      Promise.all(
        [qk.organizations.list, ...extra(vars)].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  })
}

export const useCreateOrganization = () => useOrgMutation(organizationApi.create)

export const useRenameOrganization = (id: string) =>
  useOrgMutation(
    (name: string) => organizationApi.rename(id, name),
    () => [[...qk.organizations.one(id)]],
  )

export const useDeleteOrganization = () => useOrgMutation(organizationApi.remove)

export const useInvite = (id: string) =>
  useOrgMutation(
    (email: string) => organizationApi.invite(id, email),
    () => [[...qk.organizations.one(id)]],
  )

export const useRevokeInvitation = (id: string) =>
  useOrgMutation(
    (invitationId: string) => organizationApi.revoke(id, invitationId),
    () => [[...qk.organizations.one(id)]],
  )

export function useRemoveMember(id: string) {
  const { user } = useSession()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => organizationApi.removeMember(id, userId),
    onSuccess: (_, userId) =>
      Promise.all(
        [qk.organizations.list, qk.projects.all, ...(userId === user?.id ? [] : [qk.organizations.one(id)])].map(
          (queryKey) => queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  })
}

export const useAcceptInvitation = () =>
  useOrgMutation(organizationApi.accept, () => [[...qk.organizations.invitations]])

export const useDeclineInvitation = () =>
  useOrgMutation(organizationApi.decline, () => [[...qk.organizations.invitations]])

import { api, apiPublic } from '@/shared/api/client'
import { readCookie } from '@/shared/lib/cookies'
import type { components } from '@/shared/api/schema'
import type { Res } from '@/shared/api/types'

export type ProviderId = components['schemas']['OAuthProviderInfo']['id']
export type SecuritySnapshot = components['schemas']['AccountSecurity']

export const authApi = {
  providers: () =>
    apiPublic.get<Res<'/api/v1/auth/oauth/providers', 'get'>>('/auth/oauth/providers').then((r) => r.data.items),
  start: (provider: ProviderId, returnTo: string, link = false, keepGuest = false) =>
    (link ? api : apiPublic)
      .post<Res<'/api/v1/auth/oauth/{provider}/start', 'post'>>(`/auth/oauth/${provider}/start`, {
        return_to: returnTo,
        intent: link ? 'link' : 'login',
        keep_guest_csrf: keepGuest ? readCookie('csrf_token') : null,
      })
      .then((r) => r.data.authorization_url),
  security: () => api.get<SecuritySnapshot>('/me/security').then((r) => r.data),
  requestVerification: () => api.post('/auth/email/verification'),
  verify: (token: string) => apiPublic.post('/auth/email/verify', { token }),
  forgot: (email: string) => apiPublic.post('/auth/password/forgot', { email }),
  reset: (token: string, password: string) => apiPublic.post('/auth/password/reset', { token, password }),
  password: (password: string, currentPassword: string | null) =>
    api.put('/me/password', { password, current_password: currentPassword }),
  revoke: (id: string) => api.delete(`/me/sessions/${id}`),
  unlink: (provider: ProviderId) => api.delete(`/me/identities/${provider}`),
}

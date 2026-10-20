import { readCookie } from '@/shared/lib/cookies'
import { api, apiPublic, withAuthLock } from '@/shared/api/client'
import type { LoginRequest, RegisterRequest, Res, TokenPair } from '@/shared/api/types'

const keepGuest = () => ({ headers: { 'X-Keep-Guest-CSRF': readCookie('csrf_token') || undefined } })

export const sessionApi = {
  startGuest: () => withAuthLock(() => apiPublic.post<TokenPair>('/auth/guest')).then((r) => r.data),
  resetGuest: () => api.delete('/auth/guest').then(() => undefined),
  login: (body: LoginRequest, guest = false) =>
    withAuthLock(() => apiPublic.post<TokenPair>('/auth/login', body, guest ? keepGuest() : undefined)).then(
      (r) => r.data,
    ),
  register: (body: RegisterRequest, guest = false) =>
    withAuthLock(() => apiPublic.post<TokenPair>('/auth/register', body, guest ? keepGuest() : undefined)).then(
      (r) => r.data,
    ),
  logout: () =>
    withAuthLock(() =>
      apiPublic.post('/auth/logout', {}, { headers: { 'X-CSRF-Token': readCookie('csrf_token') } }),
    ).then(() => undefined),
  me: () => api.get<Res<'/api/v1/me', 'get'>>('/me').then((r) => r.data),
}

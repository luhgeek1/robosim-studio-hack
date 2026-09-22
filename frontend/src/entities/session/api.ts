import { api, apiPublic } from '@/shared/api/client'
import type { LoginRequest, RegisterRequest, Res, TokenPair } from '@/shared/api/types'

export const sessionApi = {
  login: (body: LoginRequest) => apiPublic.post<TokenPair>('/auth/login', body).then((r) => r.data),
  register: (body: RegisterRequest) => apiPublic.post<TokenPair>('/auth/register', body).then((r) => r.data),
  logout: () => api.post('/auth/logout').then(() => undefined),
  me: () => api.get<Res<'/api/v1/me', 'get'>>('/me').then((r) => r.data),
}

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useWorkspaceStore } from '@/entities/organization/workspace'
import { parseApiProblem } from '@/shared/api/problem'
import { refreshAccessToken, setAccessToken, setUnauthorizedHandler } from '@/shared/api/client'
import type { LoginRequest, RegisterRequest, TokenPair, User } from '@/shared/api/types'
import { sessionApi } from './api'
import { SessionContext, type Session, type SessionStatus } from './context'

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<SessionStatus>('restoring')
  const [user, setUser] = useState<User | null>(null)
  const restored = useRef(false)
  const guestStarting = useRef<Promise<User> | null>(null)

  const clear = useCallback(() => {
    setAccessToken(null)
    setUser(null)
    setStatus('guest')
    // Кэш целиком: организации, уведомления и админские данные прошлой учётки не должны достаться следующей.
    queryClient.clear()
  }, [queryClient])

  const enter = useCallback((me: User) => {
    // Рабочая область и вкладки переключаются на этого пользователя до первого рендера под ним.
    useWorkspaceStore.getState().own(me.id)
    setUser(me)
    setStatus('authenticated')
    return me
  }, [])

  const accept = useCallback(
    async (pair: TokenPair) => {
      queryClient.clear()
      setAccessToken(pair.access_token)
      return enter(pair.user ?? (await sessionApi.me()))
    },
    [enter, queryClient],
  )

  useEffect(() => {
    setUnauthorizedHandler(clear)
    return () => setUnauthorizedHandler(null)
  }, [clear])

  useEffect(() => {
    if (restored.current) return
    restored.current = true
    refreshAccessToken()
      .then(async (token) => {
        if (!token) return clear()
        enter(await sessionApi.me())
      })
      .catch(clear)
  }, [clear, enter])

  const value = useMemo<Session>(
    () => ({
      status,
      user,
      login: async (body: LoginRequest) => accept(await sessionApi.login(body, user?.role === 'guest')),
      register: async (body: RegisterRequest) => accept(await sessionApi.register(body, user?.role === 'guest')),
      startGuest: () => {
        if (user) return Promise.resolve(user)
        guestStarting.current ??= sessionApi
          .startGuest()
          .then(accept)
          .finally(() => {
            guestStarting.current = null
          })
        return guestStarting.current
      },
      resetGuest: async () => {
        await sessionApi.resetGuest()
        clear()
      },
      logout: async () => {
        try {
          await sessionApi.logout()
        } catch (error) {
          if (parseApiProblem(error).status !== 401) throw error
        }
        clear()
      },
    }),
    [status, user, accept, clear],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

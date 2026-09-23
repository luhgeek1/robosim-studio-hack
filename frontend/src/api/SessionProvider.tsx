import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { refreshAccessToken, setAccessToken, setUnauthorizedHandler } from '@/api/client'
import type { LoginRequest, RegisterRequest, TokenPair, User } from '@/api/types'
import { sessionApi } from './session'
import { SessionContext, type Session, type SessionStatus } from './sessionContext'

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<SessionStatus>('restoring')
  const [user, setUser] = useState<User | null>(null)
  const restored = useRef(false)

  const clear = useCallback(() => {
    setAccessToken(null)
    setUser(null)
    setStatus('guest')
    queryClient.removeQueries({ queryKey: ['projects'] })
    queryClient.removeQueries({ queryKey: ['scenarios'] })
    queryClient.removeQueries({ queryKey: ['calculations'] })
  }, [queryClient])

  const accept = useCallback(async (pair: TokenPair) => {
    setAccessToken(pair.access_token)
    const me = pair.user ?? (await sessionApi.me())
    setUser(me)
    setStatus('authenticated')
    return me
  }, [])

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
        setUser(await sessionApi.me())
        setStatus('authenticated')
      })
      .catch(clear)
  }, [clear])

  const value = useMemo<Session>(
    () => ({
      status,
      user,
      login: async (body: LoginRequest) => accept(await sessionApi.login(body)),
      register: async (body: RegisterRequest) => accept(await sessionApi.register(body)),
      logout: async () => {
        await sessionApi.logout().catch(() => undefined)
        clear()
      },
    }),
    [status, user, accept, clear],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

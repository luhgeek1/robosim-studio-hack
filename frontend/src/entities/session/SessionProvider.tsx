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
  const generation = useRef(0)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const notify = useCallback(() => channelRef.current?.postMessage('session-changed'), [])
  const guestStarting = useRef<Promise<User> | null>(null)

  const clear = useCallback(() => {
    generation.current += 1
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
      generation.current += 1
      queryClient.clear()
      setAccessToken(pair.access_token)
      const me = enter(pair.user ?? (await sessionApi.me()))
      notify()
      return me
    },
    [enter, queryClient, notify],
  )

  useEffect(() => {
    setUnauthorizedHandler(clear)
    return () => setUnauthorizedHandler(null)
  }, [clear])

  const restore = useCallback(
    async (announce = false) => {
      const current = ++generation.current
      setStatus('restoring')
      setUser(null)
      setAccessToken(null)
      queryClient.clear()
      try {
        const token = await refreshAccessToken()
        if (!token) {
          if (current === generation.current) clear()
          return
        }
        const me = await sessionApi.me()
        if (current !== generation.current) return
        enter(me)
        if (announce) notify()
      } catch {
        if (current === generation.current) clear()
      }
    },
    [clear, enter, notify, queryClient],
  )

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel('robomera-auth')
    channelRef.current = channel
    channel.onmessage = (event) => {
      if (event.data === 'session-changed') void restore()
    }
    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [restore])

  useEffect(() => {
    if (restored.current) return
    restored.current = true
    void restore(true)
  }, [restore])

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
        notify()
      },
      logout: async () => {
        try {
          await sessionApi.logout()
        } catch (error) {
          if (parseApiProblem(error).status !== 401) throw error
        }
        clear()
        notify()
      },
    }),
    [status, user, accept, clear, notify],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

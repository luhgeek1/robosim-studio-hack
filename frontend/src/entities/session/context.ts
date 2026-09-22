import { createContext, useContext } from 'react'
import type { LoginRequest, RegisterRequest, User } from '@/shared/api/types'

export type SessionStatus = 'restoring' | 'guest' | 'authenticated'

export type Session = {
  status: SessionStatus
  user: User | null
  login: (body: LoginRequest) => Promise<User>
  register: (body: RegisterRequest) => Promise<User>
  logout: () => Promise<void>
}

export const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside SessionProvider')
  return session
}

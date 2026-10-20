import type { User } from '@/shared/api/types'

const HOME = {
  user: { path: '/projects', label: 'РобоМера — к проектам' },
  admin: { path: '/admin', label: 'РобоМера — в панель администратора' },
  vendor: { path: '/vendor', label: 'РобоМера — в кабинет производителя' },
  guest: { path: '/demo', label: 'РобоМера — к демо' },
} satisfies Record<User['role'], { path: string; label: string }>

export const sessionHome = (user: Pick<User, 'role'> | null) =>
  user ? HOME[user.role] : { path: '/', label: 'РобоМера — на главную' }

import { Navigate, Outlet, useLocation } from 'react-router'
import { useWorkspaceStore } from '@/entities/organization'
import { useSession } from '@/entities/session'
import { Button } from '@/shared/ui/button'
import { EmptyState, LoadingBlock } from '@/shared/ui/states'

/* Куда вернуться после входа. Страница помнит и чья она: при выходе охранник успевает перехватить уход со
   страницы проекта, и без этой метки следующий пользователь попал бы в чужой проект. */
type ReturnTo = { from: string; userId: string | null }

function ToLogin() {
  const location = useLocation()
  const userId = useWorkspaceStore((s) => s.userId)
  return <Navigate to="/login" replace state={{ from: location.pathname, userId } satisfies ReturnTo} />
}

export function RequireAuth() {
  const { status } = useSession()
  if (status === 'restoring') return <LoadingBlock className="p-8" />
  if (status === 'guest') return <ToLogin />
  return <Outlet />
}

export function RequireAdmin() {
  const { status, user } = useSession()
  if (status === 'restoring') return <LoadingBlock className="p-8" />
  if (status === 'guest') return <ToLogin />
  if (user?.role !== 'admin') return <Navigate to="/" replace />
  return <Outlet />
}

export function RequireVendor() {
  const { status, user } = useSession()
  if (status === 'restoring') return <LoadingBlock className="p-8" />
  if (status === 'guest') return <ToLogin />
  if (user?.role !== 'vendor') return <Navigate to="/" replace />
  return <Outlet />
}

// Каждая роль открывает своё рабочее место: админ — панель, производитель — кабинет, остальные — проекты.
const HOME: Partial<Record<string, string>> = { admin: '/admin', vendor: '/vendor' }

export function RootRedirect() {
  const { status, user } = useSession()
  if (status === 'restoring') return <LoadingBlock className="p-8" />
  const home = (user?.role && HOME[user.role]) ?? '/projects'
  return <Navigate to={status === 'authenticated' ? home : '/catalog'} replace />
}

export function NotFoundPage() {
  return (
    <div className="p-8">
      <EmptyState
        title="Страница не найдена"
        description="Возможно, ссылка устарела."
        action={
          <Button asChild>
            <a href="/">На главную</a>
          </Button>
        }
      />
    </div>
  )
}

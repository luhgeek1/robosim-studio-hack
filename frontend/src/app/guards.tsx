import { Navigate, Outlet, useLocation } from 'react-router'
import { useSession } from '@/entities/session'
import { Button } from '@/shared/ui/button'
import { EmptyState, LoadingBlock } from '@/shared/ui/states'

export function RequireAuth() {
  const { status } = useSession()
  const location = useLocation()
  if (status === 'restoring') return <LoadingBlock className="p-8" />
  if (status === 'guest') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

export function RootRedirect() {
  const { status } = useSession()
  if (status === 'restoring') return <LoadingBlock className="p-8" />
  return <Navigate to={status === 'authenticated' ? '/projects' : '/catalog'} replace />
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

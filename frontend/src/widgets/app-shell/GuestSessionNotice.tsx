import { Link, useLocation, useNavigate } from 'react-router'
import { useSession } from '@/entities/session'
import { formatDateTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm'

export function GuestSessionNotice() {
  const { user, resetGuest } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  if (user?.role !== 'guest') return null
  return (
    <aside
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-line bg-surface-2 px-4 py-2 text-xs text-ink-3"
      aria-label="Временный демо-проект"
    >
      <span>
        Гостевое пространство · данные удалятся{' '}
        {user.guest_expires_at ? formatDateTime(user.guest_expires_at) : 'через 24 часа'}.
      </span>
      <Button asChild variant="link" size="sm">
        <Link to="/login?mode=register" state={{ from: location.pathname, keepGuest: true }}>
          Сохранить надолго
        </Link>
      </Button>
      <Link className="underline underline-offset-4" to="/demo#demo-limits">
        Лимиты демо
      </Link>
      <ConfirmDialog
        title="Сбросить демо?"
        description="Все ваши временные проекты и результаты будут удалены. Затем можно начать заново."
        confirmText="Сбросить демо"
        trigger={
          <Button variant="ghost" size="sm">
            Сбросить демо
          </Button>
        }
        onConfirm={async () => {
          await resetGuest()
          navigate('/demo', { replace: true })
        }}
      />
    </aside>
  )
}

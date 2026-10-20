import { useLayoutEffect, useRef } from 'react'
import { Link, useLocation, useMatch, useNavigate } from 'react-router'
import { useJourney, useJourneyStore } from '@/entities/project/journey'
import { useSession } from '@/entities/session'
import { formatDateTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm'

export function GuestSessionNotice() {
  const { user, resetGuest } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const projectId = useMatch('/projects/:projectId/*')?.params.projectId
  const { journey, guided } = useJourney(projectId)
  const setFull = useJourneyStore((s) => s.setFull)
  const guest = user?.role === 'guest'
  const visible = Boolean(guest || journey) && !location.pathname.startsWith('/login')
  const banner = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const element = banner.current
    if (!element) return
    const measure = () => document.documentElement.style.setProperty('--workspace-banner', `${element.offsetHeight}px`)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty('--workspace-banner')
    }
  }, [visible])
  if (!visible) return null
  return (
    <>
      <div className="shrink-0" style={{ height: 'var(--workspace-banner, 48px)' }} aria-hidden />
      <aside
        ref={banner}
        className="fixed inset-x-0 top-14 z-35 flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-surface-2 px-4 py-1.5 text-xs text-ink-3 sm:px-6"
        aria-label="Режим проекта"
      >
        <div className="flex items-center gap-3">
          <span
            title={
              guest && user?.guest_expires_at ? `Данные удалятся ${formatDateTime(user.guest_expires_at)}` : undefined
            }
          >
            {guest ? (projectId ? 'Личная демо-копия' : 'Гостевое пространство') : 'Ваш сохранённый пример'}
          </span>
          {journey && projectId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFull(projectId, guided)
                if (
                  !guided &&
                  !['object', 'matching', 'comparison', 'simulation', 'report'].includes(
                    location.pathname.split('/')[3],
                  )
                )
                  navigate(`/projects/${projectId}/object`)
              }}
            >
              {guided ? 'Все инструменты' : 'Короткий маршрут'}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link className="hidden underline underline-offset-4 sm:inline" to="/demo">
            Другой пример
          </Link>
          {guest && (
            <>
              <ConfirmDialog
                title="Сбросить демо?"
                description="Ваши временные проекты и результаты будут удалены. Можно будет начать заново."
                confirmText="Сбросить демо"
                trigger={
                  <Button variant="ghost" size="sm">
                    Сбросить
                  </Button>
                }
                onConfirm={async () => {
                  await resetGuest()
                  navigate('/demo', { replace: true })
                }}
              />
              <Button asChild size="sm">
                <Link to="/login?mode=register" state={{ from: location.pathname + location.search, keepGuest: true }}>
                  Сохранить в аккаунт
                </Link>
              </Button>
            </>
          )}
        </div>
      </aside>
    </>
  )
}

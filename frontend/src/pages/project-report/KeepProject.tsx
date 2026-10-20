import { ArrowRight, BookmarkCheck } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { useProjectId } from '@/entities/project'
import { useJourney } from '@/entities/project/journey'
import { useSession } from '@/entities/session'
import { CreateProjectDialog } from '@/features/project-create'
import { Button } from '@/shared/ui/button'

export function KeepProject() {
  const projectId = useProjectId()
  const { journey } = useJourney(projectId)
  const { user } = useSession()
  const location = useLocation()
  if (!journey) return null
  const guest = user?.role === 'guest'
  return (
    <section className="rounded-2xl bg-[#293831] p-6 text-white sm:p-8">
      <BookmarkCheck size={24} strokeWidth={1.4} className="mb-4 text-white/70" />
      <h2 className="h2">{guest ? 'Сохраните свой результат' : 'От примера - к вашему объекту'}</h2>
      <p className="mt-3 max-w-170 text-sm leading-relaxed text-white/70">
        {guest
          ? 'Параметры, сценарии и результаты проверки уже связаны в одном проекте. Создайте аккаунт или войдите - эта копия останется с вами вместе со всеми изменениями.'
          : 'Этот проект сохранён в вашем аккаунте. Продолжайте уточнять данные или создайте новый объект с собственными параметрами.'}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        {guest && (
          <Button asChild>
            <Link to="/login?mode=register" state={{ from: location.pathname, keepGuest: true }}>
              Сохранить в аккаунт <ArrowRight />
            </Link>
          </Button>
        )}
        <CreateProjectDialog
          initialMode="blank"
          trigger={
            <Button
              variant="outline"
              className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              Создать свой объект
            </Button>
          }
        />
      </div>
      {guest && (
        <p className="mt-4 text-xs text-white/55">
          Без аккаунта данные доступны 24 часа. Скачанные отчёты останутся у вас.
        </p>
      )}
    </section>
  )
}

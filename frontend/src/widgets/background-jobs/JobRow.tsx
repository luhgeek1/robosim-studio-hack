import { ArrowUpRight, Check, CircleAlert, LoaderCircle, X } from 'lucide-react'
import { Link } from 'react-router'
import { jobActive, type Job } from '@/entities/job/api'
import { cn } from '@/shared/lib/utils'

function duration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds))
  if (total < 60) return `${total} с`
  if (total < 3600) return `${Math.floor(total / 60)} мин ${total % 60} с`
  return `${Math.floor(total / 3600)} ч ${Math.floor((total % 3600) / 60)} мин`
}

export function JobRow({
  job,
  now,
  offline,
  dismiss,
}: {
  job: Job
  now: number
  offline: boolean
  dismiss: () => void
}) {
  const active = jobActive(job)
  const failed = job.status === 'failed'
  const sweep = job.kind === 'fleet_sweep'
  const elapsed = ((job.finished_at ? Date.parse(job.finished_at) : now) - Date.parse(job.created_at)) / 1000
  const updated = job.progress_updated_at
    ? Date.parse(job.progress_updated_at)
    : Date.parse(job.started_at ?? job.created_at)
  const quiet = active && !offline && now - updated > 30_000
  const percent = Math.round(job.progress * 100)
  const saving = job.stage?.startsWith('Сохранение')
  const status =
    job.status === 'queued'
      ? 'В очереди'
      : failed
        ? 'Не удалось завершить'
        : job.status === 'cancelled'
          ? 'Отменено'
          : active
            ? sweep
              ? 'Проверяем число роботов'
              : 'Имитируем рабочий день'
            : 'Готово'
  const href = job.project_id && job.scenario_id ? `/projects/${job.project_id}/scenarios/${job.scenario_id}` : null

  return (
    <article className="space-y-2.5 px-4 py-3.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className={cn('flex items-center gap-2 text-[13px] font-semibold', failed && 'text-crit')}>
            {active ? (
              <LoaderCircle size={14} className="shrink-0 motion-safe:animate-spin" />
            ) : failed ? (
              <CircleAlert size={14} />
            ) : job.status === 'cancelled' ? (
              <X size={14} />
            ) : (
              <Check size={14} />
            )}
            {status}
          </p>
          <p className="mt-1 line-clamp-2 text-[12px] text-ink-3">{job.label ?? 'Имитация'}</p>
        </div>
        {!active && (
          <button
            type="button"
            onClick={dismiss}
            aria-label="Скрыть завершённую задачу"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-info"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {active && (
        <>
          <p className="text-[12px] text-ink-2">{job.stage ?? 'Ожидаем свободный воркер'}</p>
          {job.status === 'running' && !saving && (
            <>
              <div className="flex justify-between gap-2 text-[12px]">
                <span>Текущий прогон</span>
                <span className="tabular-nums">{percent} %</span>
              </div>
              <progress
                aria-label="Прогресс текущего прогона"
                value={percent}
                max={100}
                className="job-progress block h-1.5 w-full overflow-hidden rounded-full"
              />
            </>
          )}
          {sweep && (
            <p className="text-[12px] text-ink-3">
              Завершено прогонов: <span className="tabular-nums text-ink">{job.completed_runs ?? 0}</span>. Объём поиска
              уточняется.
            </p>
          )}
        </>
      )}
      {failed && (
        <p className="text-[12px] text-crit">{job.error?.detail ?? 'Откройте сценарий и запустите расчёт снова.'}</p>
      )}
      {quiet && (
        <p role="status" className="text-[12px] text-ink-2">
          Нет обновлений {duration((now - updated) / 1000)}. Ожидаем ответ воркера.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12px] text-ink-3">
        <span className="tabular-nums">
          {active ? 'Прошло' : 'Время'} {duration(elapsed)}
        </span>
        {active && !offline && !quiet && job.eta_seconds != null && (
          <span>До конца прогона ≈ {duration(job.eta_seconds)}</span>
        )}
        {href && (
          <Link
            to={href}
            className="inline-flex items-center gap-1 font-medium text-ink underline-offset-4 hover:underline"
          >
            {job.status === 'done' && sweep ? 'Открыть результат' : 'К сценарию'}
            <ArrowUpRight size={13} />
          </Link>
        )}
      </div>
    </article>
  )
}

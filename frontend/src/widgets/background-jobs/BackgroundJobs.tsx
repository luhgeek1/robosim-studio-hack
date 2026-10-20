import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, LoaderCircle } from 'lucide-react'
import { jobActive, useJobs } from '@/entities/job/api'
import { useSession } from '@/entities/session'
import { qk } from '@/shared/api/keys'
import { JobRow } from './JobRow'
import './jobs.css'

export function BackgroundJobs() {
  const { user } = useSession()
  return user ? <TaskPanel key={user.id} /> : null
}

function TaskPanel() {
  const query = useJobs()
  const client = useQueryClient()
  const previousRef = useRef(new Map<string, string>())
  const announcementRef = useRef<HTMLParagraphElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [dismissed, setDismissed] = useState<string[]>([])
  const [now, setNow] = useState(() => Date.now())
  const jobs = (query.data ?? []).filter((job) => job.type === 'simulation' && !dismissed.includes(job.id))
  const active = jobs.filter(jobActive)
  const shown = [...active, ...jobs.filter((job) => !jobActive(job)).slice(0, 3)]

  useEffect(() => {
    if (!active.length) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active.length])

  useEffect(() => {
    for (const job of query.data ?? []) {
      const previous = previousRef.current.get(job.id)
      previousRef.current.set(job.id, job.status)
      if (previous && previous !== job.status && !jobActive(job)) {
        if (announcementRef.current) {
          const status =
            job.status === 'done'
              ? 'Имитация завершена'
              : job.status === 'failed'
                ? 'Имитация завершилась ошибкой'
                : 'Имитация отменена'
          announcementRef.current.textContent = `${status}: ${job.label ?? 'сценарий'}`
        }
        void client.invalidateQueries({ queryKey: qk.scenarios.all })
        void client.invalidateQueries({ queryKey: qk.projects.all })
        void client.invalidateQueries({ queryKey: ['simulations'] })
      }
    }
  }, [query.data, client])

  if (!shown.length && !query.isError) return null
  return (
    <section
      aria-label="Фоновые задачи"
      className="fixed bottom-11 right-3 z-50 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-xl bg-card text-ink shadow-float sm:right-5"
    >
      <p ref={announcementRef} role="status" aria-live="polite" aria-atomic="true" className="sr-only" />
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls="background-job-list"
        onClick={() => setCollapsed(!collapsed)}
        className="flex min-h-11 w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-semibold hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-info focus-visible:outline-offset-[-2px]"
      >
        {active.length > 0 && <LoaderCircle size={15} className="motion-safe:animate-spin" />}
        <span className="flex-1">
          {active.length
            ? active.length === 1
              ? 'Имитация выполняется'
              : `Выполняются задачи · ${active.length}`
            : 'Фоновые задачи'}
        </span>
        {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {!collapsed && (
        <div id="background-job-list" className="max-h-[min(55vh,480px)] overflow-y-auto border-t border-line">
          <p className="px-4 pt-3 text-[12px] text-ink-3">
            {active.length ? 'Можно перейти на другую страницу или закрыть вкладку.' : 'Последние результаты имитации'}
          </p>
          {query.isError && (
            <div role="status" className="px-4 pt-3 text-[12px] text-crit">
              Нет связи с сервером. Последние данные сохранены, повторяем подключение.{' '}
              <button type="button" onClick={() => void query.refetch()} className="underline underline-offset-4">
                Повторить сейчас
              </button>
            </div>
          )}
          <div className="divide-y divide-line">
            {shown.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                now={now}
                offline={query.isError}
                dismiss={() => setDismissed((ids) => [...ids, job.id])}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

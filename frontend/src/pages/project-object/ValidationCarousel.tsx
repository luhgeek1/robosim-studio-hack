import { ArrowDown, ChevronLeft, ChevronRight, CircleAlert, TriangleAlert } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ValidationIssue } from '@/shared/api/types'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { scrollToParam } from './scroll'

const issueId = (issue: ValidationIssue) => `${issue.key}:${issue.code}`

export function ValidationCarousel({ issues }: { issues: ValidationIssue[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [direction, setDirection] = useState(1)
  const touchStart = useRef<{ id: number; x: number; y: number } | null>(null)

  if (issues.length === 0) return null

  // При обновлении проверки сохраняем выбранное замечание, пока оно не исправлено.
  const current = Math.max(
    0,
    issues.findIndex((issue) => issueId(issue) === selectedId),
  )
  const issue = issues[current]
  const multiple = issues.length > 1
  const error = issue.severity === 'error'
  const go = (step: number) => {
    setDirection(step)
    setSelectedId((previousId) => {
      const previous = Math.max(
        0,
        issues.findIndex((item) => issueId(item) === previousId),
      )
      return issueId(issues[(previous + step + issues.length) % issues.length])
    })
  }

  return (
    <section
      aria-label="Замечания к данным"
      aria-roledescription="карусель"
      tabIndex={multiple ? 0 : undefined}
      onKeyDown={(event) => {
        if (!multiple || event.altKey || event.ctrlKey || event.metaKey) return
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault()
          go(event.key === 'ArrowRight' ? 1 : -1)
        } else if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault()
          setSelectedId(issueId(issues[event.key === 'Home' ? 0 : issues.length - 1]))
        }
      }}
      className={cn(
        'mt-5 mb-4 min-w-0 rounded-xl px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4',
        error ? 'bg-crit-soft/70' : 'bg-warn-soft/60',
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-[12.5px] font-medium text-ink-2">Проверка данных</span>
        <div className="ml-auto flex items-center gap-1">
          <span className="num mr-1 text-[12.5px] text-ink-3">
            {current + 1} из {issues.length}
          </span>
          {multiple && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10 sm:size-8"
                aria-label="Предыдущее замечание"
                onClick={() => go(-1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10 sm:size-8"
                aria-label="Следующее замечание"
                onClick={() => go(1)}
              >
                <ChevronRight />
              </Button>
            </>
          )}
        </div>
      </div>

      <div
        className="grid touch-pan-y overflow-hidden"
        onPointerDown={(event) => {
          touchStart.current =
            multiple && event.pointerType === 'touch' && event.isPrimary
              ? { id: event.pointerId, x: event.clientX, y: event.clientY }
              : null
        }}
        onPointerCancel={() => {
          touchStart.current = null
        }}
        onPointerUp={(event) => {
          const start = touchStart.current
          touchStart.current = null
          if (!start || start.id !== event.pointerId) return
          const dx = event.clientX - start.x
          const dy = event.clientY - start.y
          if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.25) go(dx < 0 ? 1 : -1)
        }}
      >
        {/* Общая высота по самому длинному тексту: при листании окно не прыгает. */}
        <div aria-hidden="true" inert className="invisible col-start-1 row-start-1 grid min-w-0">
          {issues.map((item) => (
            <div key={issueId(item)} className="col-start-1 row-start-1 min-w-0">
              <IssueDetails issue={item} />
            </div>
          ))}
        </div>
        <div aria-live="polite" aria-atomic="true" className="col-start-1 row-start-1 min-w-0">
          <div
            key={issueId(issue)}
            role="group"
            aria-roledescription="слайд"
            aria-label={`${current + 1} из ${issues.length}`}
            className={cn(
              'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150',
              direction > 0 ? 'motion-safe:slide-in-from-right-2' : 'motion-safe:slide-in-from-left-2',
            )}
          >
            <IssueDetails issue={issue} />
          </div>
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-3 -ml-1 min-h-10 text-ink-2 sm:min-h-8"
        onClick={() => scrollToParam(issue.key)}
      >
        К параметру <ArrowDown />
      </Button>
    </section>
  )
}

function IssueDetails({ issue }: { issue: ValidationIssue }) {
  const error = issue.severity === 'error'
  const Icon = error ? CircleAlert : TriangleAlert
  return (
    <div className="flex gap-2.5 text-[13px] leading-relaxed">
      <Icon className={cn('mt-0.5 size-4 shrink-0', error ? 'text-crit' : 'text-warn')} />
      <div className="min-w-0 flex-1 wrap-anywhere">
        <p className="font-medium text-ink">{issue.name ?? issue.message}</p>
        {issue.name && <p className="mt-0.5 text-ink-2">{issue.message}</p>}
        {issue.how_to_fix && <p className="mt-1 text-ink-3">{issue.how_to_fix}</p>}
      </div>
    </div>
  )
}

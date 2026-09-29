import type { CSSProperties, ReactNode } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Link, useMatch, useNavigate } from 'react-router'
import { PROJECT_STEPS, stepIndex } from '@/entities/project/steps'
import { cn } from '@/shared/lib/utils'
import { Button } from './button'
import { ScrambleText } from './kinetics'

const pad = (n: number) => String(n).padStart(2, '0')

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  dense = false,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
  dense?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-end justify-between gap-x-6 gap-y-4',
        dense ? 'mb-4' : 'mb-5 sm:mb-7',
        className,
      )}
    >
      <div className="min-w-0 max-w-190">
        {eyebrow && (
          <div className={cn('hud flex items-center gap-2', dense ? 'mb-1.5' : 'mb-3')}>
            <span className="size-1.5 rounded-full bg-signal" aria-hidden />
            {eyebrow}
          </div>
        )}
        <h1 className="h1">{title}</h1>
        {description && (
          <p className={cn('text-[15.5px] leading-relaxed text-ink-2', dense ? 'mt-1.5' : 'mt-3')}>{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/* Экран шага: «Шаг N из M · вопрос», заголовок-вывод, лид и переходы назад / дальше — каркас прототипа v0. */
export function Screen({
  title,
  lead,
  children,
  wide = false,
  actions,
  nextLabel,
  nextDisabled = false,
  nextTo,
  nextPrimary,
  dense = false,
  className,
}: {
  title: ReactNode
  lead?: ReactNode
  children: ReactNode
  wide?: boolean
  dense?: boolean
  actions?: ReactNode
  nextLabel?: string
  nextDisabled?: boolean
  nextTo?: string
  // Верхняя кнопка «Далее» заметна, только если на экране нет своего главного действия; иначе она контурная.
  nextPrimary?: boolean
  className?: string
}) {
  const navigate = useNavigate()
  const match = useMatch('/projects/:projectId/:step/*')
  const base = `/projects/${match?.params.projectId ?? ''}`
  const idx = stepIndex(match?.params.step)
  const step = PROJECT_STEPS[idx]
  const prev = idx > 0 ? PROJECT_STEPS[idx - 1] : null
  const next = idx >= 0 ? PROJECT_STEPS.slice(idx + 1).find((s) => !s.soon) : undefined
  const goNext = () => navigate(nextTo ?? `${base}/${next?.id}`)
  const nextText = nextLabel ?? (next ? `Далее: ${next.label.toLowerCase()}` : '')
  const topNext = next && (
    <Button
      variant={(nextPrimary ?? !actions) ? 'default' : 'outline'}
      disabled={nextDisabled}
      onClick={goNext}
      // На телефоне переход дальше остаётся внизу экрана, а вверху — только действия самого шага.
      className={cn(actions && 'max-sm:hidden')}
    >
      {nextText} <ArrowRight />
    </Button>
  )
  return (
    <div className={cn('mx-auto w-full pt-2 pb-12 sm:pb-16', wide ? 'max-w-360' : 'max-w-300', className)}>
      <PageHeader
        eyebrow={step ? `Шаг ${pad(idx + 1)} / ${pad(PROJECT_STEPS.length)} · ${step.question}` : undefined}
        title={title}
        description={lead}
        actions={
          (actions || topNext) && (
            <>
              {actions}
              {topNext}
            </>
          )
        }
        dense={dense}
      />
      {children}
      {idx >= 0 && (
        <div className="hairline mt-10 flex flex-wrap-reverse items-center justify-between gap-3 pt-6 sm:mt-12">
          <Button variant="ghost" onClick={() => navigate(prev ? `${base}/${prev.id}` : base)}>
            <ArrowLeft /> {prev ? prev.label : 'Обзор'}
          </Button>
          {next && (
            <Button size="lg" disabled={nextDisabled} onClick={goNext}>
              {nextText} <ArrowRight />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('card', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
          <div className="min-w-0 space-y-0.5">
            {title && <h2 className="h3">{title}</h2>}
            {description && <p className="meta">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(title || actions ? 'px-4 pb-4 sm:px-5 sm:pb-5' : 'p-4 sm:p-5', bodyClassName)}>{children}</div>
    </section>
  )
}

export function StatStrip({
  children,
  columns,
  className,
}: {
  children: ReactNode
  columns?: number
  className?: string
}) {
  // Линии между ячейками — фон, просвечивающий в зазоры сетки: так рамки верны при любом числе строк и колонок.
  // На телефоне чётное число колонок складывается в две, нечётное — в одну.
  const cols = columns ?? 1
  return (
    <div
      className={cn(
        'card grid gap-px overflow-hidden bg-line *:bg-card md:grid-cols-(--cols)',
        cols % 2 === 0 ? 'grid-cols-2' : 'grid-cols-1',
        className,
      )}
      style={{ '--cols': `repeat(${cols}, minmax(0, 1fr))` } as CSSProperties}
    >
      {children}
    </div>
  )
}

export function Stat({
  label,
  value,
  hint,
  className,
  valueClassName,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  className?: string
  valueClassName?: string
}) {
  return (
    <div className={cn('min-w-0 px-4 py-3.5 sm:px-5 sm:py-4', className)}>
      <div className="truncate text-[13px] text-ink-3">{label}</div>
      <div className={cn('display num mt-1.5 text-[21px] sm:text-[24px]', valueClassName)}>
        {typeof value === 'string' ? <ScrambleText text={value} /> : value}
      </div>
      {hint && <div className="meta mt-1 truncate">{hint}</div>}
    </div>
  )
}

export function Callout({
  tone = 'warn',
  children,
  action,
  className,
}: {
  tone?: 'warn' | 'crit' | 'info'
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  const cls = {
    warn: 'bg-warn-soft text-warn',
    crit: 'bg-crit-soft text-crit',
    info: 'bg-accent-soft text-accent-ink',
  }[tone]
  return (
    <div className={cn('flex items-start gap-3 rounded-[12px] px-4 py-3 text-[13.5px]', cls, className)}>
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  )
}

export function TextLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link to={to} className={cn('text-[13.5px] font-medium text-info hover:underline', className)}>
      {children}
    </Link>
  )
}

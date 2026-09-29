import type { ReactNode } from 'react'
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
    <div className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-4', dense ? 'mb-4' : 'mb-7', className)}>
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
  className?: string
}) {
  const navigate = useNavigate()
  const match = useMatch('/projects/:projectId/:step/*')
  const base = `/projects/${match?.params.projectId ?? ''}`
  const idx = stepIndex(match?.params.step)
  const step = PROJECT_STEPS[idx]
  const prev = idx > 0 ? PROJECT_STEPS[idx - 1] : null
  const next = idx >= 0 ? PROJECT_STEPS.slice(idx + 1).find((s) => !s.soon) : undefined
  return (
    <div className={cn('mx-auto w-full pb-16 pt-2', wide ? 'max-w-360' : 'max-w-300', className)}>
      <PageHeader
        eyebrow={step ? `Шаг ${pad(idx + 1)} / ${pad(PROJECT_STEPS.length)} · ${step.question}` : undefined}
        title={title}
        description={lead}
        actions={actions}
        dense={dense}
      />
      {children}
      {idx >= 0 && (
        <div className="hairline mt-12 flex items-center justify-between pt-6">
          <Button variant="ghost" onClick={() => navigate(prev ? `${base}/${prev.id}` : base)}>
            <ArrowLeft /> {prev ? prev.label : 'Обзор'}
          </Button>
          {next && (
            <Button size="lg" disabled={nextDisabled} onClick={() => navigate(nextTo ?? `${base}/${next.id}`)}>
              {nextLabel ?? `Далее: ${next.label.toLowerCase()}`} <ArrowRight />
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
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0 space-y-0.5">
            {title && <h2 className="h3">{title}</h2>}
            {description && <p className="meta">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(title || actions ? 'px-5 pb-5' : 'p-5', bodyClassName)}>{children}</div>
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
  return (
    <div
      className={cn('card grid divide-y divide-line overflow-hidden md:divide-x md:divide-y-0', className)}
      style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
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
    <div className={cn('min-w-0 px-5 py-4', className)}>
      <div className="truncate text-[13px] text-ink-3">{label}</div>
      <div className={cn('display num mt-1.5 text-[24px]', valueClassName)}>
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

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { animate, motion } from 'framer-motion'
import { cn } from '@/shared/lib/utils'
import { SlideHighlight, SlideMark } from '@/shared/ui/slide-highlight'

export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'crit'

const PILL: Record<Tone, string> = {
  neutral: 'bg-black/[0.05] text-ink-2',
  accent: 'bg-accent-soft text-accent-ink',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  crit: 'bg-crit-soft text-crit',
}

const SOLID: Record<Tone, string> = {
  neutral: 'bg-ink-4',
  accent: 'bg-info',
  ok: 'bg-ok',
  warn: 'bg-warn',
  crit: 'bg-crit',
}

export function Pill({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium whitespace-nowrap [&>svg]:size-3',
        PILL[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Dot({ tone = 'neutral', pulse = false }: { tone?: Tone; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      {pulse && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60', SOLID[tone])} />}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', SOLID[tone])} />
    </span>
  )
}

export function Bar({ value, tone = 'neutral', height = 6 }: { value: number; tone?: Tone; height?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-full bg-black/[0.06]" style={{ height }}>
      <motion.div
        className={cn('h-full rounded-full', tone === 'neutral' ? 'bg-ink-2' : SOLID[tone])}
        initial={false}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 24 }}
      />
    </div>
  )
}

export function Check({ tone = 'ok' }: { tone?: 'ok' | 'warn' | 'crit' | 'neutral' }) {
  const cls =
    tone === 'ok'
      ? 'text-ok bg-ok-soft'
      : tone === 'warn'
        ? 'text-warn bg-warn-soft'
        : tone === 'crit'
          ? 'text-crit bg-crit-soft'
          : 'text-ink-3 bg-black/[0.05]'
  return (
    <span className={cn('mt-0.5 inline-flex size-[18px] shrink-0 items-center justify-center rounded-full', cls)}>
      {tone === 'warn' || tone === 'crit' ? (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path d="M5 1.5v4M5 7.6v.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ) : tone === 'neutral' ? (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path d="M2 5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path
            d="M2 5.2l2.1 2.1L8 3.4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  )
}

/* Число, которое плавно перетекает к новому значению: смена конфигурации читается как пересчёт, а не перезагрузка. */
export function KpiNumber({
  value,
  digits = 0,
  duration = 0.7,
  className,
  prefix = '',
  suffix = '',
  format,
}: {
  value: number
  digits?: number
  duration?: number
  className?: string
  prefix?: string
  suffix?: string
  format?: (v: number) => string
}) {
  const [shown, setShown] = useState(value)
  const prev = useRef(value)
  useEffect(() => {
    const from = prev.current
    prev.current = value
    if (from === value) return
    const controls = animate(from, value, { duration, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setShown(v) })
    return () => controls.stop()
  }, [value, duration])
  const text = format
    ? format(shown)
    : shown.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return (
    <span className={cn('num', className)}>
      {prefix}
      {text}
      {suffix}
    </span>
  )
}

export function ConfidenceRing({ value, size = 18 }: { value: number; size?: number }) {
  const r = (size - 3) / 2
  const c = 2 * Math.PI * r
  const color = value >= 80 ? 'var(--ok)' : value >= 60 ? 'var(--warn)' : 'var(--crit)'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(0,0,0,0.08)" strokeWidth="2.5" fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${(c * value) / 100} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T
  options: { value: T; label: ReactNode; hint?: string; disabled?: boolean }[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
}) {
  const h = size === 'sm' ? 'h-8 text-[13px]' : 'h-10 text-[14px]'
  return (
    // Не шире родителя: на телефоне лишние варианты прокручиваются вбок, а не раздвигают страницу.
    <div className="relative inline-flex max-w-full items-center overflow-x-auto overscroll-x-contain rounded-[10px] bg-black/[0.05] p-[3px] [scrollbar-width:none]">
      <SlideHighlight className="rounded-[8px] bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)]" />
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            title={o.hint}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative shrink-0 rounded-[8px] px-2.5 font-medium transition-colors sm:px-3.5 duration-150 disabled:opacity-40',
              h,
              active ? 'text-ink' : 'text-ink-3 hover:text-ink-2',
            )}
          >
            {active && <SlideMark />}
            <span className="relative z-10 whitespace-nowrap">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

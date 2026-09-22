import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { motion } from 'framer-motion'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
}

export function Button({ variant = 'secondary', size = 'md', icon, className = '', children, ...rest }: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition-[background-color,color,border-color,box-shadow,transform] duration-150 active:scale-[0.985] disabled:opacity-50 disabled:pointer-events-none select-none whitespace-nowrap'
  const sizes = { sm: 'h-8 px-3 text-[13px]', md: 'h-10 px-4 text-[14px]', lg: 'h-12 px-5 text-[15px]' }
  const variants = {
    primary: 'bg-ink text-white hover:bg-[#2a2a2f] shadow-[0_1px_2px_rgba(0,0,0,0.2)]',
    secondary: 'bg-surface text-ink border border-line hover:border-line-2 hover:bg-surface-2',
    ghost: 'bg-transparent text-ink-2 hover:bg-black/[0.04] hover:text-ink',
  }
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {icon}
      {children}
    </button>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = 'md',
  layoutId,
}: {
  value: T
  options: { value: T; label: ReactNode; hint?: string }[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  layoutId: string
}) {
  const h = size === 'sm' ? 'h-8 text-[13px]' : 'h-10 text-[14px]'
  return (
    <div className="inline-flex items-center rounded-[10px] bg-black/[0.05] p-[3px]">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={`relative ${h} px-3.5 rounded-[8px] font-medium transition-colors duration-150 ${
              active ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
            }`}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-[8px] bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)]"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative z-10 whitespace-nowrap">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'crit'

const toneCls: Record<Tone, string> = {
  neutral: 'bg-black/[0.05] text-ink-2',
  accent: 'bg-accent-soft text-accent-ink',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  crit: 'bg-crit-soft text-crit',
}

export function Pill({ tone = 'neutral', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-[12px] font-medium whitespace-nowrap ${toneCls[tone]} ${className}`}>
      {children}
    </span>
  )
}

export function Dot({ tone = 'neutral', pulse = false }: { tone?: Tone; pulse?: boolean }) {
  const c: Record<Tone, string> = {
    neutral: 'bg-ink-4',
    accent: 'bg-accent',
    ok: 'bg-ok',
    warn: 'bg-warn',
    crit: 'bg-crit',
  }
  return (
    <span className="relative inline-flex h-2 w-2">
      {pulse && <span className={`absolute inset-0 rounded-full ${c[tone]} opacity-60 animate-ping`} />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${c[tone]}`} />
    </span>
  )
}

export function Bar({ value, tone = 'neutral', height = 6 }: { value: number; tone?: Tone; height?: number }) {
  const c: Record<Tone, string> = {
    neutral: 'bg-ink-2',
    accent: 'bg-accent',
    ok: 'bg-ok',
    warn: 'bg-warn',
    crit: 'bg-crit',
  }
  return (
    <div className="w-full rounded-full bg-black/[0.06] overflow-hidden" style={{ height }}>
      <motion.div
        className={`h-full rounded-full ${c[tone]}`}
        initial={false}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 24 }}
      />
    </div>
  )
}

export function Check({ tone = 'ok' }: { tone?: 'ok' | 'warn' | 'neutral' }) {
  const cls = tone === 'ok' ? 'text-ok bg-ok-soft' : tone === 'warn' ? 'text-warn bg-warn-soft' : 'text-ink-3 bg-black/[0.05]'
  return (
    <span className={`mt-[2px] inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${cls}`}>
      {tone === 'warn' ? (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M5 1.5v4M5 7.6v.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ) : tone === 'neutral' ? (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 5.2l2.1 2.1L8 3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  )
}

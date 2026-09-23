import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, X } from 'lucide-react'
import { Popover as PopoverPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui'

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

export function Pill({
  tone = 'neutral',
  children,
  className = '',
}: {
  tone?: Tone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-[12px] font-medium whitespace-nowrap ${toneCls[tone]} ${className}`}
    >
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
  const cls =
    tone === 'ok' ? 'text-ok bg-ok-soft' : tone === 'warn' ? 'text-warn bg-warn-soft' : 'text-ink-3 bg-black/[0.05]'
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

export function Drawer({
  open,
  onClose,
  children,
  width = 480,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  width?: number
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="bg"
            className="fixed inset-0 z-40 bg-ink/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.aside
            key="panel"
            className="fixed top-3 right-3 bottom-3 z-50 flex flex-col overflow-hidden rounded-[16px] bg-surface shadow-float"
            style={{ width: `min(${width}px, calc(100vw - 24px))` }}
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            role="dialog"
            aria-modal
          >
            {children}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

export function DrawerHeader({
  eyebrow,
  title,
  onClose,
  children,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  onClose: () => void
  children?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
      <div className="min-w-0">
        {eyebrow && <div className="meta mb-1">{eyebrow}</div>}
        <div className="h2">{title}</div>
        {children}
      </div>
      <Button variant="ghost" size="sm" onClick={onClose} aria-label="Закрыть" className="!px-2">
        <X size={16} />
      </Button>
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  lead,
  children,
  width = 560,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  lead?: ReactNode
  children: ReactNode
  width?: number
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-ink/25"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal
            className="relative max-h-[calc(100vh-32px)] w-full overflow-y-auto rounded-[16px] bg-surface p-6 shadow-float scroll-thin"
            style={{ maxWidth: width }}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="h2">{title}</div>
                {lead && <p className="mt-1.5 text-[14px] leading-relaxed text-ink-3">{lead}</p>}
              </div>
              <Button variant="ghost" size="sm" onClick={onClose} aria-label="Закрыть" className="!px-2">
                <X size={16} />
              </Button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export function Hint({
  content,
  children,
  side = 'top',
}: {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
}) {
  return (
    <TooltipPrimitive.Root delayDuration={150}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-[70] max-w-[320px] rounded-[10px] bg-ink px-3 py-2 text-[12.5px] leading-relaxed text-white shadow-float"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export function Popover({
  trigger,
  children,
  align = 'end',
  width = 320,
}: {
  trigger: ReactNode
  children: ReactNode
  align?: 'start' | 'center' | 'end'
  width?: number
}) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={align}
          sideOffset={8}
          className="z-[60] rounded-[14px] border border-line bg-surface p-4 shadow-float"
          style={{ width }}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

export const inputCls =
  'h-10 w-full rounded-[10px] border border-line bg-surface px-3 text-[14px] text-ink outline-none transition-colors placeholder:text-ink-4 hover:border-line-2 focus:border-ink aria-[invalid=true]:border-crit'

export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[12.5px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-ink-4">{hint}</span>}
    </label>
  )
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  className = '',
  ariaLabel,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  className?: string
  ariaLabel?: string
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={`${inputCls} cursor-pointer appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237b7b82' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")] bg-[position:right_12px_center] bg-no-repeat pr-9 ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

// "Как посчитано": the third level of the story — formulas and sources stay one click away, never on the first screen.
export function Disclosure({
  label,
  children,
  defaultOpen = false,
}: {
  label: ReactNode
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline"
        aria-expanded={open}
      >
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        {label}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

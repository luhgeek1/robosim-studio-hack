import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'
import { SPRING } from './motion'

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn('block min-w-0', className)}>
      <span className="text-[12.5px] font-medium text-ink-2">{label}</span>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <span className="mt-1 block text-[12px] text-crit">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-[12px] text-ink-3">{hint}</span>
      )}
    </label>
  )
}

export function FormSection({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-3.5">
      <div>
        <h3 className="text-[13.5px] font-semibold">{title}</h3>
        {note && <p className="meta">{note}</p>}
      </div>
      {children}
    </section>
  )
}

/* Переключатель-чип: выбранный заливается чернилами с пружиной, галочка въезжает. */
export function Chip({
  active,
  onClick,
  children,
  disabled,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.95 }}
      transition={SPRING}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors disabled:opacity-40',
        active ? 'border-ink bg-ink text-white' : 'border-line-2 bg-card text-ink-2 hover:border-ink-4 hover:text-ink',
      )}
    >
      <motion.span
        initial={false}
        animate={{ width: active ? 14 : 0, opacity: active ? 1 : 0 }}
        transition={SPRING}
        className="flex overflow-hidden"
      >
        <Check size={14} strokeWidth={2.5} />
      </motion.span>
      {children}
    </motion.button>
  )
}

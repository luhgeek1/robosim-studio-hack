import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'
import { KpiNumber } from '@/shared/ui/v0'

export function Kpi({
  label,
  value,
  hint,
  tone,
  format,
}: {
  label: string
  value: number | null | undefined
  hint?: string
  tone?: string
  format?: (v: number) => string
}) {
  return (
    <div className="min-w-0 px-4 py-4 sm:px-5">
      <div className="text-[12.5px] leading-snug text-ink-3 lg:truncate">{label}</div>
      <div
        className="display mt-1.5 text-[26px] leading-tight sm:text-[30px]"
        style={tone ? { color: tone } : undefined}
      >
        {value === undefined || value === null ? (
          <span className="text-ink-4">—</span>
        ) : (
          <KpiNumber value={value} format={format} />
        )}
      </div>
      {hint && <div className="mt-1.5 text-[12px] leading-snug text-ink-3 lg:truncate">{hint}</div>}
    </div>
  )
}

export function Panel({
  title,
  note,
  children,
  className,
}: {
  title: string
  note?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('card min-w-0 px-4 pt-4.5 pb-5 sm:px-5', className)}>
      <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
      {note && <p className="meta mt-0.5">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-[13.5px] text-ink-3">{children}</p>
}

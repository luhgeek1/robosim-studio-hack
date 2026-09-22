import type { ComponentProps } from 'react'
import { cn } from '@/shared/lib/utils'
import { TONE_CLASS, type Tone } from './tone-classes'

export type { Tone } from './tone-classes'

export function ToneBadge({ tone, className, ...props }: ComponentProps<'span'> & { tone: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-xs font-medium whitespace-nowrap [&>svg]:size-3',
        TONE_CLASS[tone],
        className,
      )}
      {...props}
    />
  )
}

export function ToneDot({ tone, className }: { tone: Tone; className?: string }) {
  const bg: Record<Tone, string> = {
    ok: 'bg-ok',
    info: 'bg-info',
    warn: 'bg-warn',
    crit: 'bg-crit',
    muted: 'bg-muted-foreground/50',
  }
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', bg[tone], className)} />
}

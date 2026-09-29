import { Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'

/* Пояснение по клику: текст не съедает место на экране, но остаётся под рукой. */
export function Hint({ children, align = 'start' }: { children: ReactNode; align?: 'start' | 'end' }) {
  return (
    <Popover>
      <PopoverTrigger
        className="inline-flex shrink-0 text-ink-4 transition-colors hover:text-ink"
        aria-label="Пояснение"
      >
        <Info size={14} />
      </PopoverTrigger>
      <PopoverContent align={align} className="w-80 space-y-2 text-[13px] leading-relaxed text-ink-2">
        {children}
      </PopoverContent>
    </Popover>
  )
}

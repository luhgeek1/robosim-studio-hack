import { useState } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'

export function DemoBadge({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="О демо-проекте"
          className={cn(
            'inline-flex shrink-0 cursor-help items-center gap-1.5 rounded-full border border-signal/20 bg-signal/5 font-sans font-medium tracking-normal text-ink-2 normal-case transition-colors hover:bg-signal/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal',
            compact ? 'h-5 px-2 text-[10px]' : 'h-6 px-2.5 text-[11px]',
          )}
          onClick={(event) => {
            event.preventDefault()
            setOpen(true)
          }}
        >
          <Info size={12} className="shrink-0 text-signal" aria-hidden />
          Демо-проект
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="start"
        sideOffset={8}
        collisionPadding={16}
        className="w-80 max-w-[calc(100vw-2rem)] px-3.5 py-3 text-[12px] leading-relaxed"
      >
        <span>
          <strong className="font-semibold">Демо-проект · 4 основных шага.</strong> В своём проекте появятся все 9
          шагов, собственные параметры, планировка и сохранение результатов.
        </span>
      </TooltipContent>
    </Tooltip>
  )
}

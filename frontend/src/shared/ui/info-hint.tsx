import { Info, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

export function InfoHint({
  title,
  children,
  trigger,
  className,
}: {
  title: string
  children: ReactNode
  trigger?: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const headingId = useId()
  const hoverOpened = useRef(false)
  const pinned = useRef(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelClose = () => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  useEffect(() => cancelClose, [])

  const closeOnLeave = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || pinned.current) return
    cancelClose()
    closeTimer.current = setTimeout(() => setOpen(false), 180)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        cancelClose()
        pinned.current = next
        hoverOpened.current = false
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Подробнее: ${title}`}
          onPointerEnter={(event) => {
            if (event.pointerType !== 'mouse') return
            cancelClose()
            if (!open) {
              hoverOpened.current = true
              setOpen(true)
            }
          }}
          onPointerLeave={closeOnLeave}
          onClick={(event) => {
            event.stopPropagation()
            if (hoverOpened.current && !pinned.current) {
              event.preventDefault()
              cancelClose()
              pinned.current = true
              hoverOpened.current = false
            }
          }}
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:bg-muted',
            trigger ? 'min-h-7 max-sm:min-h-10' : 'size-7 max-sm:size-10',
            className,
          )}
        >
          {trigger ?? <Info size={16} aria-hidden="true" />}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        collisionPadding={12}
        aria-labelledby={headingId}
        onPointerEnter={cancelClose}
        onPointerLeave={closeOnLeave}
        onOpenAutoFocus={(event) => {
          if (hoverOpened.current) event.preventDefault()
        }}
        onCloseAutoFocus={(event) => {
          if (hoverOpened.current) event.preventDefault()
        }}
        className="max-h-[min(24rem,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-1.5rem)] gap-2 p-4"
      >
        <div className="flex shrink-0 items-start gap-2">
          <h4 id={headingId} className="min-w-0 flex-1 text-[13px] leading-relaxed font-medium wrap-anywhere">
            {title}
          </h4>
          <button
            type="button"
            aria-label="Закрыть пояснение"
            onClick={() => {
              cancelClose()
              pinned.current = false
              hoverOpened.current = false
              setOpen(false)
            }}
            className="-mt-1 -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-sm:size-10"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto text-[13px] leading-relaxed wrap-anywhere whitespace-pre-line text-ink-3">
          {children}
        </div>
      </PopoverContent>
    </Popover>
  )
}

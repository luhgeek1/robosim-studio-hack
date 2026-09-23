import type { Layout } from '@/api/types'

export type TwinProps = {
  layout: Layout
  className?: string
}

export function Twin({ layout, className = '' }: TwinProps) {
  return (
    <div className={`flex h-full w-full items-center justify-center text-[13px] text-ink-3 ${className}`}>
      Двойник {layout.width_m} × {layout.height_m} м
    </div>
  )
}

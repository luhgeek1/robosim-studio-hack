import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { STEPS, useStore } from '../store'
import { Button } from './ui'

export function Screen({
  title,
  lead,
  children,
  wide = false,
  nextLabel,
  className = '',
}: {
  title: ReactNode
  lead?: ReactNode
  children: ReactNode
  wide?: boolean
  nextLabel?: string
  className?: string
}) {
  const step = useStore((s) => s.step)
  const next = useStore((s) => s.next)
  const prev = useStore((s) => s.prev)
  const idx = STEPS.findIndex((s) => s.id === step)
  const nextStep = STEPS[idx + 1]
  return (
    <div className={`mx-auto w-full ${wide ? 'max-w-[1440px]' : 'max-w-[1200px]'} px-6 pb-16 pt-9 ${className}`}>
      <div className="mb-7 flex items-end justify-between gap-6">
        <div className="max-w-[760px]">
          <div className="meta mb-2 num">
            Шаг {idx + 1} из {STEPS.length} · {STEPS[idx].question}
          </div>
          <h1 className="h1">{title}</h1>
          {lead && <p className="mt-3 text-[15.5px] leading-relaxed text-ink-2">{lead}</p>}
        </div>
      </div>
      {children}
      <div className="mt-12 flex items-center justify-between hairline pt-6">
        {idx > 0 ? (
          <Button variant="ghost" icon={<ArrowLeft size={15} />} onClick={prev}>
            {STEPS[idx - 1].label}
          </Button>
        ) : (
          <span />
        )}
        {nextStep && (
          <Button variant="primary" size="lg" onClick={next}>
            {nextLabel ?? `Далее: ${nextStep.label.toLowerCase()}`}
            <ArrowRight size={16} />
          </Button>
        )}
      </div>
    </div>
  )
}

import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'
import { STEPS, stepPath, useProjectId } from '@/lib/story'
import { Button } from './ui'

export function Screen({
  title,
  lead,
  children,
  wide = false,
  nextLabel,
  nextDisabled = false,
  onNext,
  aside,
  className = '',
}: {
  title: ReactNode
  lead?: ReactNode
  children: ReactNode
  wide?: boolean
  nextLabel?: string
  nextDisabled?: boolean
  onNext?: () => void | Promise<void>
  aside?: ReactNode
  className?: string
}) {
  const projectId = useProjectId()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const idx = STEPS.findIndex((s) => pathname.endsWith(`/${s.id}`))
  const step = STEPS[idx]
  const prevStep = STEPS[idx - 1]
  const nextStep = STEPS[idx + 1]
  const goNext = async () => {
    if (onNext) await onNext()
    else if (nextStep) navigate(stepPath(projectId, nextStep.id))
  }
  return (
    <div className={`mx-auto w-full ${wide ? 'max-w-[1440px]' : 'max-w-[1200px]'} px-6 pt-9 pb-16 ${className}`}>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[780px]">
          {step && (
            <div className="meta num mb-2">
              Шаг {idx + 1} из {STEPS.length} · {step.question}
            </div>
          )}
          <h1 className="h1">{title}</h1>
          {lead && <div className="mt-3 text-[15.5px] leading-relaxed text-ink-2">{lead}</div>}
        </div>
        {aside}
      </div>
      {children}
      <div className="hairline mt-12 flex items-center justify-between pt-6">
        <Button
          variant="ghost"
          icon={<ArrowLeft size={15} />}
          onClick={() => navigate(prevStep ? stepPath(projectId, prevStep.id) : '/projects')}
        >
          {prevStep ? prevStep.label : 'Проекты'}
        </Button>
        {(nextStep || onNext) && (
          <Button variant="primary" size="lg" onClick={() => void goNext()} disabled={nextDisabled}>
            {nextLabel ?? `Далее: ${nextStep?.label.toLowerCase()}`}
            <ArrowRight size={16} />
          </Button>
        )}
      </div>
    </div>
  )
}

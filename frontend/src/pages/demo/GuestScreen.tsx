import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router'
import { DEMO_STEPS, demoStep, demoUrl } from '@/entities/demo/navigation'
import { Screen } from '@/shared/ui/page'
import { Button } from '@/shared/ui/button'
import { DemoBadge } from './DemoBadge'

export function GuestScreen({ title, lead, children }: { title: ReactNode; lead?: ReactNode; children: ReactNode }) {
  const { demoKey = 'warehouse_demo_01' } = useParams()
  const [search] = useSearchParams()
  const index = DEMO_STEPS.findIndex((s) => s.id === demoStep(search.get('step')))
  const current = DEMO_STEPS[index]
  const previous = DEMO_STEPS[index - 1]
  const next = DEMO_STEPS[index + 1]
  const nextButton = next && (
    <Button asChild>
      <Link to={demoUrl(demoKey, next.id)}>
        Далее: {next.label.toLowerCase()}
        <ArrowRight />
      </Link>
    </Button>
  )
  return (
    <Screen
      dense
      badge={<DemoBadge />}
      title={title}
      lead={lead}
      eyebrow={`Шаг 0${index + 1} / 04 · ${current.question}`}
      actions={nextButton}
    >
      {children}
      <div className="hairline mt-10 flex flex-wrap-reverse items-center justify-between gap-3 pt-6 sm:mt-12">
        <Button variant="ghost" asChild>
          <Link to={previous ? demoUrl(demoKey, previous.id) : '/'}>
            <ArrowLeft />
            {previous?.label ?? 'На главную'}
          </Link>
        </Button>
        {nextButton}
      </div>
    </Screen>
  )
}

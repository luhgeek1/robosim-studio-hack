import { useState } from 'react'
import { Check, ChevronDown, Info } from 'lucide-react'
import type { DemoSnapshot } from '@/entities/demo/api'
import type { CalculationRun } from '@/shared/api/types'
import { formatNumber, formatRub } from '@/shared/lib/format'
import { Section } from '@/shared/ui/page'
import { Button } from '@/shared/ui/button'
import { RobotPreview3D } from '@/widgets/robot-3d'

export function Evidence({ demo, calculation }: { demo: DemoSnapshot; calculation: CalculationRun }) {
  const [why, setWhy] = useState(false)
  return (
    <Section
      title="Подобранные роботы"
      actions={
        <Button variant="outline" size="sm" onClick={() => setWhy(!why)} aria-expanded={why}>
          <Info />
          Почему подходят
          <ChevronDown />
        </Button>
      }
    >
      <div className="divide-y divide-line">
        {calculation.sizing.map((s) => {
          const candidate = demo.matching.processes
            .find((p) => p.process_key === s.process_key)
            ?.candidates.find((c) => c.product.id === s.product_id)
          const item = demo.scenarios
            .find((p) => p.id === demo.primary_scenario_id)
            ?.items.find((i) => i.process_key === s.process_key)
          return (
            <article
              key={s.process_key}
              className="grid items-center gap-5 py-5 first:pt-0 last:pb-0 sm:grid-cols-[180px_minmax(0,1fr)_auto]"
            >
              <div className="relative h-40 overflow-hidden rounded-lg bg-surface-2">
                <RobotPreview3D productId={s.product_id} framing={{ scale: 1.1, lower: 0.08 }} />
              </div>
              <div className="min-w-0">
                <p className="meta">{demo.matching.processes.find((p) => p.process_key === s.process_key)?.name}</p>
                <h3 className="h3 mt-1">{s.product_name}</h3>
                <p className="mt-2 text-[13px] text-ink-3">
                  {candidate?.product.manufacturer?.name} · {formatRub(item?.price_rub)} за единицу
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-2">
                  <Check size={13} className="text-ok" />
                  {s.count.source === 'simulated' ? 'Парк уточнён имитацией' : 'Парк по аналитическому расчёту'}
                </p>
                {why && (
                  <div className="mt-4 space-y-2 border-t border-line pt-3">
                    {candidate?.reasons.slice(0, 3).map((r, i) => (
                      <p key={i} className="text-[12px] leading-relaxed text-ink-3">
                        {r.text}
                      </p>
                    ))}
                    {!!candidate?.missing_data.length && (
                      <p className="text-[12px] text-warn">
                        Нужно подтвердить: {candidate.missing_data.map((v) => v.name).join(', ')}.
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="text-left sm:text-right">
                <div className="display num text-[32px]">{formatNumber(s.count.final)}</div>
                <div className="meta">роботов</div>
                <div className="meta mt-1">включая резерв: {s.count.reserve}</div>
              </div>
            </article>
          )
        })}
      </div>
    </Section>
  )
}

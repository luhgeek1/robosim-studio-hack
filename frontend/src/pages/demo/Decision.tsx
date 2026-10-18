import { ArrowLeft, ArrowRight, Info } from 'lucide-react'
import { Link } from 'react-router'
import type { DemoChanges, DemoResult, DemoSnapshot } from '@/entities/demo/api'
import { demoUrl } from '@/entities/demo/navigation'
import type { CalculationRun } from '@/shared/api/types'
import { Button } from '@/shared/ui/button'
import { DemoBadge } from './DemoBadge'
import { Evidence } from './Evidence'
import { Economy } from './Economy'
import { DemoCosts } from './DemoCosts'
import type { FleetCheckState } from './FleetCheck'

export function Decision({
  demo,
  current,
  result,
  pending,
  failed,
  value,
  onChange,
  onRetry,
  fleet,
}: {
  demo: DemoSnapshot
  current: CalculationRun
  result?: DemoResult
  pending: boolean
  failed: string | null
  value: DemoChanges
  onChange: (v: DemoChanges) => void
  onRetry: () => void
  fleet: FleetCheckState
}) {
  return (
    <div className="mx-auto w-full max-w-300 space-y-4 pt-1 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pb-1">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.025em]">Подбор и экономика</h1>
            <DemoBadge compact />
          </div>
          <p className="mt-1.5 text-[12px] text-ink-3">{demo.demo.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to={demoUrl(demo.demo.key, 'object')}>
              <ArrowLeft /> Объект
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={demoUrl(demo.demo.key, 'simulation')}>
              Имитация <ArrowRight />
            </Link>
          </Button>
        </div>
      </header>
      {failed && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md border border-crit/20 bg-crit-soft px-3 py-2 text-[12px] text-crit"
          role="alert"
        >
          <span className="min-w-0 flex-1">
            Не удалось пересчитать: {failed}. Показан последний успешный результат.
          </span>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Повторить
          </Button>
        </div>
      )}
      <Economy metrics={current.metrics} value={value} pending={pending} failed={failed} onChange={onChange} />
      <div className="flex items-start gap-2 px-1 text-[12px] leading-relaxed text-ink-2">
        <Info size={14} className="mt-0.5 shrink-0 text-ink-3" />
        <p>
          {current.interpretation.headline}
          {result && !result.simulation_valid && fleet.changedVolume && (
            <span className="ml-1 text-warn">Новая нагрузка не проверена имитацией.</span>
          )}
        </p>
      </div>
      <Evidence demo={demo} calculation={current} fleet={fleet} pending={pending} />
      <DemoCosts demo={demo} calculation={current} pending={pending} />
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <p className="text-[11px] leading-relaxed text-ink-3">
          Пробные изменения действуют в этой вкладке. Исходный пример и отчёт не изменяются.
        </p>
        <Button asChild size="sm" variant="outline">
          <Link to={demoUrl(demo.demo.key, 'simulation')}>
            К проверке парка <ArrowRight />
          </Link>
        </Button>
      </footer>
    </div>
  )
}

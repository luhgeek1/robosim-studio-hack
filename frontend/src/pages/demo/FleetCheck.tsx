import { ArrowRight, Check, Sparkles } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router'
import type { DemoSnapshot } from '@/entities/demo/api'
import { demoUrl } from '@/entities/demo/navigation'
import type { CalculationRun } from '@/shared/api/types'
import { formatNumber, formatRub, formatYears, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Spinner } from '@/shared/ui/states'
import { PaneSection } from '@/widgets/workbench'

export type FleetCheckState = {
  formula?: CalculationRun
  current?: CalculationRun
  applied: boolean
  busy: boolean
  changedVolume: boolean
  error: string | null
  onApply: () => void
  onUseFormula: () => void
  onResetVolume: () => void
}

function outcome(fleet: FleetCheckState) {
  const before = fleet.formula?.metrics.robots_total
  const after = fleet.current?.metrics.robots_total
  if (before == null || after == null) return 'Парк проверен'
  const delta = before - after
  if (delta > 0) return `На ${formatNumber(delta)} ${pluralRu(delta, ['робота', 'робота', 'роботов'])} меньше`
  if (delta < 0)
    return `Для целевого сервиса нужно ещё ${formatNumber(-delta)} ${pluralRu(-delta, ['робот', 'робота', 'роботов'])}`
  return 'Количество роботов подтверждено'
}

export function FleetCheckTeaser({ demo, fleet }: { demo: DemoSnapshot; fleet: FleetCheckState }) {
  return (
    <section
      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-signal/20 bg-card px-5 py-4"
      aria-label="Проверка парка имитацией"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Sparkles size={20} className="mt-0.5 shrink-0 text-signal" />
        <div>
          <h2 className="text-[14px] font-semibold">
            {fleet.applied ? outcome(fleet) : 'А если проверить парк в движении?'}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
            {fleet.applied
              ? 'Проверенный парк уже учтён в количестве роботов и экономике выше.'
              : 'Формула даёт первую оценку. Имитация проверяет, сколько роботов действительно нужно для задач в срок.'}
          </p>
        </div>
      </div>
      <Button asChild variant={fleet.applied ? 'outline' : 'default'} className="h-auto min-h-8 whitespace-normal">
        <Link to={`${demoUrl(demo.demo.key, 'simulation')}#fleet-check`}>
          {fleet.applied ? 'Посмотреть проверку' : 'Уточнить парк имитацией'}
          <ArrowRight />
        </Link>
      </Button>
    </section>
  )
}

export function FleetCheckPanel({ demo, fleet }: { demo: DemoSnapshot; fleet: FleetCheckState }) {
  const panel = useRef<HTMLDivElement>(null)
  const { hash } = useLocation()
  useEffect(() => {
    if (hash !== '#fleet-check' || !window.matchMedia('(max-width:1023px)').matches) return
    const frame = requestAnimationFrame(() => panel.current?.scrollIntoView({ block: 'start' }))
    return () => cancelAnimationFrame(frame)
  }, [hash])
  const available = !!demo.sweep?.applied && demo.sweep.joint_validation?.status === 'passed'
  const before = fleet.formula?.metrics
  const after = fleet.applied ? fleet.current?.metrics : undefined
  const beforeUpfront = before?.owner_upfront_rub ?? before?.capex_rub
  const afterUpfront = after?.owner_upfront_rub ?? after?.capex_rub
  const saved = beforeUpfront != null && afterUpfront != null ? beforeUpfront - afterUpfront : 0
  return (
    <div id="fleet-check" ref={panel}>
      <PaneSection title="Сколько роботов нужно">
        <p className="mb-3 text-[12px] leading-relaxed text-ink-3">
          Сравните первую оценку с парком, который выдержал проверку маршрутов, очередей и зарядки.
        </p>
        <div className="grid grid-cols-2 gap-2" aria-busy={fleet.busy}>
          {[
            { label: 'По формуле', value: before?.robots_total, active: !fleet.applied },
            { label: 'После проверки', value: after?.robots_total, active: fleet.applied },
          ].map((item) => (
            <div
              key={item.label}
              className={cn('min-w-0 rounded-lg border p-3', item.active ? 'border-ink bg-card' : 'border-line')}
            >
              <p className="text-[11px] text-ink-3">{item.label}</p>
              <p className="num mt-1 text-[30px] font-semibold tracking-tight">{formatNumber(item.value)}</p>
              <p className="text-[11px] text-ink-3">с резервом</p>
            </div>
          ))}
        </div>
        {fleet.error && (
          <p className="mt-3 text-[12px] text-crit" role="alert">
            Не удалось обновить расчёт: {fleet.error}
          </p>
        )}
        {fleet.applied && after && before ? (
          <div className="mt-4" aria-label="Результат уточнения парка">
            <div className="flex items-start gap-2 text-[14px] font-semibold leading-snug" role="status">
              <Check size={17} className="mt-0.5 shrink-0 text-ok" />
              {outcome(fleet)}
            </div>
            <dl className="mt-3 space-y-3 border-t border-line pt-3 text-[12px]">
              {[
                { label: 'Вложения на старте', from: formatRub(beforeUpfront), to: formatRub(afterUpfront) },
                { label: 'Окупаемость', from: formatYears(before.payback_years), to: formatYears(after.payback_years) },
              ].map((row) => (
                <div key={row.label}>
                  <dt className="text-ink-3">{row.label}</dt>
                  <dd className="num mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-ink-3">{row.from}</span>
                    <ArrowRight size={12} className="text-signal" />
                    <strong className="font-semibold">{row.to}</strong>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[12px] leading-relaxed text-ink-2">
              {saved > 0 ? `На старте нужно на ${formatRub(saved)} меньше. ` : ''}
              {after.robots_total != null && before.robots_total != null && after.robots_total > before.robots_total
                ? 'Проверка выявила, что исходного парка недостаточно для целевого сервиса.'
                : 'Количество роботов и экономика обновлены во вкладке «Подбор и экономика».'}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-auto px-0 py-1 text-ink-3"
              onClick={fleet.onUseFormula}
              disabled={fleet.busy}
            >
              Вернуть расчёт по формуле
            </Button>
          </div>
        ) : fleet.changedVolume ? (
          <div className="mt-3">
            <p className="text-[12px] leading-relaxed text-ink-3">
              Вы изменили нагрузку. Готовые прогоны относятся к исходному примеру; для новых условий нужна отдельная
              имитация в своём проекте.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 h-auto min-h-8 w-full whitespace-normal"
              onClick={fleet.onResetVolume}
              disabled={fleet.busy}
            >
              Вернуть исходную нагрузку
            </Button>
          </div>
        ) : available ? (
          <Button
            className="mt-4 h-auto min-h-9 w-full whitespace-normal"
            onClick={fleet.onApply}
            disabled={fleet.busy || (!before && !fleet.error)}
          >
            {fleet.busy ? <Spinner /> : <Sparkles />}
            {fleet.busy ? 'Обновляем расчёт…' : fleet.error ? 'Повторить проверку' : 'Уточнить парк имитацией'}
          </Button>
        ) : (
          <p className="mt-3 text-[12px] leading-relaxed text-warn">
            Для этого примера парк пока не подтверждён имитацией. В расчёте остаётся оценка по формуле.
          </p>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
          В демо применяем заранее выполненную проверку исходной нагрузки. Новый прогон не запускается.
        </p>
      </PaneSection>
    </div>
  )
}

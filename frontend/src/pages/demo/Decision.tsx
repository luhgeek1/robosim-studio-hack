import type { DemoResult, DemoSnapshot } from '@/entities/demo/api'
import type { CalculationRun } from '@/shared/api/types'
import { formatNumber as n, formatRub as rub, formatYears, formatPct } from '@/shared/lib/format'
import { CashflowChart } from '@/widgets/cashflow/ComparisonCashflowChart'

export function Decision({
  demo,
  current,
  result,
  changed,
  pending,
}: {
  demo: DemoSnapshot
  current: CalculationRun
  result?: DemoResult
  changed: boolean
  pending: boolean
}) {
  const m = current.metrics
  const original = demo.calculations.find((c) => c.scenario_id === demo.primary_scenario_id)!
  return (
    <div className="demo-decision" aria-busy={pending}>
      <div className="demo-panel demo-verdict">
        <div className="demo-eyebrow">
          {changed ? 'ПРОБНЫЙ РАСЧЁТ · ' : 'ИСХОДНЫЙ ПРИМЕР · '}
          {current.scenario_kind === 'raas' ? 'УСЛУГА' : current.scenario_kind === 'lease' ? 'ЛИЗИНГ' : 'ПОКУПКА'}
        </div>
        <h2>{current.interpretation.headline}</h2>
        <p>
          {changed
            ? 'Проверьте, как ваши допущения повлияли на результат.'
            : 'Один и тот же парк сравнивается в покупке, лизинге и услуге. Ниже — затраты и результат каждого варианта.'}
        </p>
        {pending && (
          <div className="demo-notice" role="status">
            Показан последний результат. Новые условия ещё рассчитываются.
          </div>
        )}
        <div className="demo-metrics">
          <div>
            <span>Парк с резервом</span>
            <strong>
              {n(m.robots_total)} <small>роботов</small>
            </strong>
          </div>
          <div>
            <span>Вложения собственника</span>
            <strong>{rub(m.owner_upfront_rub ?? m.capex_rub)}</strong>
          </div>
          <div>
            <span>Годовой денежный эффект</span>
            <strong>{rub(m.effect_rub_year)}</strong>
          </div>
          <div>
            <span>NPV проекта за {m.horizon_years} лет</span>
            <strong>{rub(m.npv_rub)}</strong>
          </div>
        </div>
        <p className="demo-fleet-line">
          {current.sizing.map((s) => `${s.count.final} × ${s.product_name} (резерв ${s.count.reserve})`).join(' · ')}
        </p>
        <details className="demo-details">
          <summary>Как читать финансовый результат</summary>
          <p>{current.interpretation.summary}</p>
        </details>
        <div className="demo-facts">
          <span>
            Окупаемость: <b>{formatYears(m.payback_years)}</b>
          </span>
          <span>
            Денежная реализация труда: <b>{formatPct(m.labor_cash_realization_pct)}</b>
          </span>
          <span>
            Высвобождение: <b>{n(m.labor_hours_released_year)} чел·ч/год</b>
          </span>
        </div>
        {result && (
          <p className="demo-small">
            {result.simulation_valid
              ? 'Физические условия прежние: подтверждение парка имитацией сохранено.'
              : 'Текущий парк не подтверждён сохранённой имитацией.'}
          </p>
        )}
        {(result?.notes ?? [demo.demo.scope]).map((note) => (
          <p className="demo-small" key={note}>
            {note}
          </p>
        ))}
        {current.risks
          .filter((r) => r.severity === 'high')
          .slice(0, 2)
          .map((r) => (
            <div className="demo-notice" key={r.code}>
              <b>{r.title}.</b> {r.description}
            </div>
          ))}
      </div>
      <section className="demo-panel">
        <div className="demo-section-heading">
          <div>
            <div className="demo-eyebrow">ОДИН ОБЪЕКТ · ОДИН ПАРК</div>
            <h2>Как внедрять — и стоит ли вообще</h2>
          </div>
        </div>
        <p>
          Сравнение исходного примера. Все варианты начинают денежный поток с нулевого периода. Пробный расчёт выше
          показан отдельно.
        </p>
        <p className="demo-fleet-line">
          {original.sizing
            .map(
              (s) =>
                `${s.product_name}: ${s.count.final} шт., резерв ${s.count.reserve}, станций ${s.stations_count ?? '—'}, зарядных мест ${s.chargers_count ?? '—'}`,
            )
            .join(' · ')}
        </p>
        <div className="demo-comparison">
          {demo.comparison.scenarios.map((s) => (
            <article
              key={s.scenario_id}
              className={s.scenario_id === demo.comparison.recommendation?.scenario_id ? 'is-recommended' : ''}
            >
              <div className="demo-eyebrow">
                {s.scenario_id === demo.comparison.recommendation?.scenario_id
                  ? 'РЕКОМЕНДАЦИЯ РАСЧЁТА'
                  : s.kind === 'baseline'
                    ? 'ТОЧКА СРАВНЕНИЯ'
                    : 'ВАРИАНТ ВНЕДРЕНИЯ'}
              </div>
              <h3>{s.name}</h3>
              <strong>{rub(s.metrics.tco_rub)}</strong>
              <small>все затраты за {s.metrics.horizon_years} лет</small>
              <dl>
                <div>
                  <dt>На старте</dt>
                  <dd>{rub((s.metrics.owner_upfront_rub ?? s.metrics.capex_rub) || 0)}</dd>
                </div>
                <div>
                  <dt>NPV проекта</dt>
                  <dd>{s.kind === 'baseline' ? '—' : rub(s.metrics.npv_rub)}</dd>
                </div>
                <div>
                  <dt>Эффект в год</dt>
                  <dd>{s.kind === 'baseline' ? '—' : rub(s.metrics.effect_rub_year)}</dd>
                </div>
              </dl>
              <p className="demo-small">
                {s.kind === 'baseline' ? 'Текущий ручной процесс' : `${s.metrics.robots_total} роботов с резервом`}
              </p>
              {s.kind === 'raas' && <p className="demo-small">Тариф — модельное допущение, уточняется в КП.</p>}
            </article>
          ))}
        </div>
        <p className="demo-small">{demo.comparison.recommendation?.rationale?.join(' ')}</p>
        <details className="demo-details">
          <summary>Посмотреть денежные потоки всех вариантов</summary>
          <CashflowChart table={demo.comparison} />
        </details>
      </section>
    </div>
  )
}

import type { DemoSnapshot } from '@/entities/demo/api'
import { formatNumber as n, formatRub as rub, formatValue } from '@/shared/lib/format'

export function Evidence({ demo }: { demo: DemoSnapshot }) {
  const calculation = demo.calculations.find((c) => c.scenario_id === demo.primary_scenario_id)!
  return (
    <div className="demo-panel demo-evidence">
      <div className="demo-eyebrow">ПОДБОР ОБЪЯСНЯЕТ КАЖДОЕ РЕШЕНИЕ</div>
      <h2>Почему именно эти роботы</h2>
      <p>
        {demo.demo.scope} Для примера выбран кандидат с высоким рейтингом и достаточными данными для расчёта парка.
        Техническая совместимость и экономическая целесообразность проверяются отдельно.
      </p>
      {calculation.sizing.map((sizing) => {
        const process = demo.matching.processes.find((p) => p.process_key === sizing.process_key)
        const candidate = process?.candidates.find((c) => c.product.id === sizing.product_id)
        const item = demo.scenarios
          .find((s) => s.id === demo.primary_scenario_id)
          ?.items.find((i) => i.process_key === sizing.process_key)
        return (
          <article className="demo-robot" key={sizing.process_key}>
            <div className="demo-section-heading">
              <div>
                <small>{process?.name}</small>
                <h3>{sizing.product_name}</h3>
                <p>
                  {candidate?.product.manufacturer?.name} · {rub(item?.price_rub)} за единицу ·{' '}
                  {item?.price_source === 'override' ? 'допущение сценария' : 'каталог организатора'}
                </p>
              </div>
              <strong>
                {sizing.count.final}
                <small>с резервом {sizing.count.reserve}</small>
              </strong>
            </div>
            <p className="demo-small">
              {candidate?.status === 'check'
                ? 'Требует проверки характеристик и условий эксплуатации.'
                : 'Соответствует заданным ограничениям подбора.'}
            </p>
            <div className="demo-facts">
              <span>
                Пик: <b>{n(sizing.demand_peak_per_hour)} операций/ч</b>
              </span>
              <span>
                Станций: <b>{n(sizing.stations_count)}</b>
              </span>
              <span>
                Зарядных мест: <b>{n(sizing.chargers_count)}</b>
              </span>
              <span>{sizing.count.source === 'simulated' ? 'Парк по имитации' : 'Аналитический парк'}</span>
            </div>
            <p className="demo-small">{sizing.count.explanation}</p>
            <ul>
              {candidate?.reasons.map((reason, i) => (
                <li key={i}>{reason.text}</li>
              ))}
            </ul>
            {!!candidate?.missing_data.length && (
              <div className="demo-notice">
                Нужно подтвердить: {candidate.missing_data.map((m) => m.name).join(', ')}.
              </div>
            )}
            {!!candidate?.score_breakdown?.length && (
              <details className="demo-details">
                <summary>Как сформирован рейтинг · {n(candidate.score)} из 100</summary>
                <p>Вклад каждого критерия в подбор. Экономический результат оценивается отдельно.</p>
                <div className="demo-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Критерий</th>
                        <th>Вес</th>
                        <th>Вклад</th>
                        <th>Объяснение</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidate.score_breakdown.map((c) => (
                        <tr key={c.criterion}>
                          <td>{c.name}</td>
                          <td>{n(c.weight * 100)}%</td>
                          <td>{n(c.contribution)}</td>
                          <td>{c.explanation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
            <details className="demo-details">
              <summary>Другие кандидаты и причины исключения</summary>
              {process?.candidates
                .filter((c) => c.product.id !== sizing.product_id)
                .map((c) => (
                  <div className="demo-alternative" key={c.product.id}>
                    <b>{c.product.name}</b>
                    <span>
                      {c.status === 'excluded'
                        ? 'Не подходит'
                        : c.status === 'check'
                          ? 'Нужна проверка'
                          : 'Допустимая альтернатива'}
                    </span>
                    <p>{c.reasons.map((r) => r.text).join(' ')}</p>
                  </div>
                ))}
            </details>
          </article>
        )
      })}
      <details className="demo-details">
        <summary>Все исходные параметры и их источники</summary>
        <div className="demo-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Параметр</th>
                <th>Значение</th>
                <th>Источник / допущение</th>
              </tr>
            </thead>
            <tbody>
              {demo.params.map((p) => (
                <tr key={p.key}>
                  <td>{p.name}</td>
                  <td>{formatValue(p.value, p.unit)}</td>
                  <td>
                    {p.provenance.status === 'assumption' && <b>Допущение. </b>}
                    {p.provenance.source?.title} {p.provenance.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details className="demo-details">
        <summary>Состав вложений и расходов</summary>
        {[calculation.capex, calculation.opex_year].map((cost, i) => (
          <div key={i}>
            <h3>
              {i === 0 ? 'Первоначальные вложения' : 'Эксплуатация за год'} · {rub(cost.total_rub)}
            </h3>
            {cost.items.map((item) => (
              <details key={item.key} className="demo-details">
                <summary>
                  {item.name} · {rub(item.amount_rub)}
                </summary>
                <p>{item.formula_rendered ?? item.formula}</p>
                {item.inputs.map((input) => (
                  <p className="demo-small" key={input.key}>
                    {input.name}: {formatValue(input.value, input.unit)} ·{' '}
                    {input.provenance?.source?.title ?? input.provenance?.note ?? 'Расчётное значение'}
                  </p>
                ))}
              </details>
            ))}
          </div>
        ))}
      </details>
      <details className="demo-details">
        <summary>Проверить формулы расчёта · {demo.trace.items.length} шагов</summary>
        <p>
          Недокументированных констант: <b>{demo.trace.undocumented_constants}</b>
        </p>
        {demo.trace.items.map((item) => (
          <details className="demo-details" key={item.metric_key}>
            <summary>
              {item.name} = {formatValue(item.value, item.unit)}
            </summary>
            <code>{item.formula_rendered ?? item.formula}</code>
            {item.inputs.map((input) => (
              <p className="demo-small" key={input.key}>
                {input.name}: {formatValue(input.value, input.unit)} ·{' '}
                {input.provenance?.source?.title ?? input.provenance?.note ?? 'Расчётное значение'}
              </p>
            ))}
          </details>
        ))}
      </details>
    </div>
  )
}

import { RotateCcw } from 'lucide-react'
import type { DemoChanges } from '@/entities/demo/api'
import { formatNumber } from '@/shared/lib/format'

export const INITIAL: DemoChanges = {
  salary_multiplier: 1,
  volume_multiplier: 1,
  robot_price_multiplier: 1,
  scenario_kind: 'purchase',
}

type Props = {
  value: DemoChanges
  onChange: (value: DemoChanges) => void
  horizon: number
  cashShare: number
  pending: boolean
}

export function WhatIfPanel({ value, onChange, horizon, cashShare, pending }: Props) {
  const update = (key: keyof DemoChanges, next: number | string) => onChange({ ...value, [key]: next })
  return (
    <aside className="demo-panel demo-controls" aria-labelledby="what-if-title">
      <div className="demo-eyebrow">ВАША ПРОВЕРКА</div>
      <h2 id="what-if-title">А если условия изменятся?</h2>
      <p>Измените допущение — увидите новый расчёт тем же ядром.</p>
      <label>
        Способ внедрения
        <select value={value.scenario_kind} onChange={(e) => update('scenario_kind', e.target.value)}>
          <option value="purchase">Покупка</option>
          <option value="raas">Робот как услуга (RaaS)</option>
          <option value="lease">Лизинг</option>
        </select>
      </label>
      {(
        [
          ['salary_multiplier', 'Зарплаты', '× к исходным зарплатам'],
          ['volume_multiplier', 'Объём операций', '× к нагрузке и штату ручного процесса'],
          ['robot_price_multiplier', 'Цена роботов', '× к цене оборудования в каталоге'],
        ] as const
      ).map(([key, title, hint]) => (
        <label key={key}>
          <span>
            {title}
            <output>{formatNumber(value[key] ?? 1)}×</output>
          </span>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.05"
            value={value[key] ?? 1}
            onChange={(e) => update(key, Number(e.target.value))}
            aria-label={title}
          />
          <small>{hint}</small>
        </label>
      ))}
      <label>
        <span>
          Доля денежной экономии труда
          <output>{Math.round((value.labor_cash_realization_share ?? cashShare) * 100)}%</output>
        </span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={value.labor_cash_realization_share ?? cashShare}
          onChange={(e) => update('labor_cash_realization_share', Number(e.target.value))}
          aria-label="Доля денежной экономии труда"
        />
        <small>0% — время высвободилось, ФОТ не изменился. 100% — вся потенциальная экономия реализована.</small>
      </label>
      <label>
        <span>
          Горизонт оценки<output>{value.horizon_years ?? horizon} лет</output>
        </span>
        <input
          type="range"
          min="3"
          max="10"
          step="1"
          value={value.horizon_years ?? horizon}
          onChange={(e) => update('horizon_years', Number(e.target.value))}
          aria-label="Горизонт оценки"
        />
      </label>
      <div className="demo-presets">
        <button onClick={() => onChange({ ...value, salary_multiplier: 1.2 })}>Зарплаты +20%</button>
        <button onClick={() => onChange({ ...value, labor_cash_realization_share: 0 })}>ФОТ остаётся прежним</button>
      </div>
      <button className="demo-text-button" onClick={() => onChange(INITIAL)}>
        <RotateCcw size={14} /> Сбросить изменения
      </button>
      <p className="demo-small" role="status">
        {pending ? 'Пересчитываем новые условия…' : 'Без сохранения и без регистрации.'}
      </p>
    </aside>
  )
}

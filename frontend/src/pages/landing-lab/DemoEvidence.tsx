import { useState } from 'react'
import { ArrowUpRight, Check, RefreshCw } from 'lucide-react'
import { Link } from 'react-router'
import { useDemo } from '@/entities/demo/api'
import { formatDate, formatNumber, formatRub, formatYears } from '@/shared/lib/format'
import './evidence.css'

export function DemoEvidence() {
  const demo = useDemo('warehouse_demo_01')
  const [mode, setMode] = useState<'formula' | 'simulation'>('simulation')
  const snapshot = demo.data && !('status' in demo.data) ? demo.data : undefined
  const sweep = snapshot?.sweep
  const verified = sweep?.joint_validation?.status === 'passed' && sweep.applied === true
  const fleet = mode === 'simulation' ? (verified ? sweep?.by_simulation : null) : sweep?.by_formula
  const unavailable = !fleet
  const stateText = demo.isError
    ? 'Не удалось загрузить результаты. Попробуйте ещё раз или откройте пример в платформе.'
    : demo.data && 'status' in demo.data && demo.data.status === 'failed'
      ? 'Пример временно недоступен. Расчётные результаты появятся после его подготовки.'
      : demo.isPending || (demo.data && 'status' in demo.data)
        ? 'Подготавливаем расчёт демонстрационного склада…'
        : 'Для этого снимка нет применённого результата совместной проверки. Откройте расчёт в демо.'
  return (
    <section className="lab-evidence" aria-labelledby="evidence-title">
      <div className="lab-wrap">
        <div className="lab-section-label">
          <span>01 / Расчёт, который можно проверить</span>
          <span>Демонстрационный склад</span>
        </div>
        <div className="lab-evidence-heading">
          <h2 id="evidence-title">
            Имитация меняет
            <br />
            <em>решение.</em>
          </h2>
          <p>
            Проверьте разницу между расчётом по формуле и парком после совместной проверки под нагрузкой. Здесь — данные
            настоящего демо.
          </p>
        </div>
        <div className="lab-evidence-switch" role="group" aria-label="Источник расчёта парка">
          <button aria-pressed={mode === 'formula'} onClick={() => setMode('formula')}>
            По формуле <span>01</span>
          </button>
          <button aria-pressed={mode === 'simulation'} onClick={() => setMode('simulation')}>
            После имитации <span>02</span>
          </button>
        </div>
        <div className="lab-evidence-result" aria-live="polite" aria-atomic="true" aria-busy={demo.isPending}>
          {unavailable ? (
            <div className="lab-evidence-unavailable" role="status">
              <p>{stateText}</p>
              <button onClick={() => void demo.refetch()} disabled={demo.isFetching}>
                <RefreshCw size={15} /> Обновить результаты
              </button>
            </div>
          ) : (
            <>
              <div className="lab-fleet-count">
                <strong>{formatNumber(fleet.total)}</strong>
                <span>
                  роботов с резервом
                  <br />
                  <small>
                    {formatNumber(fleet.working)} в работе + {formatNumber(fleet.reserve)} в резерве
                  </small>
                </span>
              </div>
              <div className="lab-fleet-graphic" aria-hidden="true">
                {Array.from({ length: Math.min(fleet.total, 60) }, (_, i) => (
                  <span key={i} className={i >= fleet.working ? 'is-reserve' : ''}>
                    <i />
                    <i />
                  </span>
                ))}
              </div>
              <div className="lab-evidence-metrics">
                <div>
                  <span>Инвестиции в сценарий покупки</span>
                  <strong>{formatRub(fleet.capex_rub)}</strong>
                </div>
                <div>
                  <span>Простая окупаемость</span>
                  <strong>{formatYears(fleet.payback_years)}</strong>
                </div>
                <p>
                  {mode === 'simulation' ? (
                    <>
                      <Check size={17} /> Общий парк прошёл проверку моделируемых процессов.{' '}
                      {sweep?.joint_validation?.replications} повторов.
                    </>
                  ) : (
                    'Расчёт по длительности цикла. Влияние общих ресурсов ещё предстоит проверить.'
                  )}
                </p>
              </div>
            </>
          )}
        </div>
        <div className="lab-evidence-foot">
          <p>
            Демонстрационные входные данные, не обещание экономии.{' '}
            {snapshot && <>Снимок от {formatDate(snapshot.prepared_at)}. </>}Условия и границы модели раскрыты в
            расчёте.
          </p>
          <Link to="/demo/warehouse_demo_01?step=decision">
            Разобрать результат <ArrowUpRight size={20} />
          </Link>
        </div>
      </div>
    </section>
  )
}

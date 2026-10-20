import { ArrowUpRight, Check, Layers3, Route, SlidersHorizontal } from 'lucide-react'
import { WAREHOUSE } from './scene-state'

export function ProductFrame({ initiallyHidden = false }: { initiallyHidden?: boolean }) {
  return (
    <div className="im-product-frame" inert={initiallyHidden}>
      <div className="im-product-bar">
        <span>
          РобоМера <i>/</i> Демонстрационный склад
        </span>
        <span className="im-product-status">
          <span /> Сценарий рассчитан
        </span>
      </div>
      <div className="im-product-sidebar">
        <span className="im-mono">ИСХОДНЫЕ УСЛОВИЯ</span>
        <strong className="im-product-title">
          Перевозка
          <br />
          паллет
        </strong>
        <dl>
          <div>
            <dt>Площадь склада</dt>
            <dd>20 000 м²</dd>
          </div>
          <div>
            <dt>Источник</dt>
            <dd>Датасет организатора</dd>
          </div>
        </dl>
        <div className="im-product-layers">
          <span>
            <Layers3 size={15} /> Планировка
          </span>
          <span>
            <Route size={15} /> Маршруты
          </span>
          <span>
            <SlidersHorizontal size={15} /> Параметры
          </span>
        </div>
      </div>
      <div className="im-product-result">
        <span className="im-mono">СОСТАВ ПАРКА</span>
        <div className="im-frame-number">
          13 <span>роботов</span>
        </div>
        <p>11 в работе + 2 в резерве</p>
        <div className="im-frame-verified">
          <Check size={16} /> Проверен имитацией
        </div>
        <dl>
          <div>
            <dt>По формуле, с резервом</dt>
            <dd>17</dd>
          </div>
          <div>
            <dt>Повторов проверки</dt>
            <dd>5</dd>
          </div>
        </dl>
        <span className="im-product-source">Снимок демо от 19.10.2026. Результат для заданных условий.</span>
      </div>
      <div className="im-product-footer">
        <span>Схема объясняет процесс. Точная планировка и события - в демо.</span>
        <a href={`${WAREHOUSE}?step=simulation`}>
          Открыть имитацию <ArrowUpRight size={15} />
        </a>
      </div>
    </div>
  )
}

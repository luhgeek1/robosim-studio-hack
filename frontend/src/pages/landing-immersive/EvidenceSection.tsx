import { useState } from 'react'
import { ArrowRight, ArrowUpRight, Check } from 'lucide-react'
import demo from './demo-snapshot.json'
import { WAREHOUSE } from './scene-state'

const number = (value: number, digits = 1) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(value)
const million = (value: number) => `${number(value / 1e6)} млн ₽`
const modes = [
  {
    key: 'purchase',
    name: 'Покупка',
    headline: 'Парк — ваш. Полная стоимость — перед вами.',
    text: 'Роботы, инфраструктура, внедрение и эксплуатация. Сравнивайте весь сценарий на выбранном горизонте.',
  },
  {
    key: 'raas',
    name: 'RaaS',
    headline: 'Робот как услуга. Платежи — часть сценария.',
    text: 'Начальные затраты и регулярная плата рассматриваются вместе. Условия сервиса влияют на итоговую экономику.',
  },
  {
    key: 'lease',
    name: 'Лизинг',
    headline: 'Оборудование сегодня. Платежи — по графику.',
    text: 'Стоимость проекта и поток собственных средств разделены. График финансирования виден в расчёте.',
  },
]

export function EvidenceSection() {
  const [simulation, setSimulation] = useState(true)
  const [mode, setMode] = useState(0)
  const fleet = simulation ? demo.sweep.by_simulation : demo.sweep.by_formula
  const scenario = demo.comparison.scenarios.find((s) => s.kind === modes[mode].key)!
  return (
    <>
      <section className="im-evidence" id="immersive-evidence">
        <div className="im-section-heading">
          <h2>
            Проверка меняет
            <br />
            <span>состав парка.</span>
          </h2>
          <p>
            Демонстрационный склад, 20 000 м².
            <br />
            Один процесс — горизонтальная перевозка паллет. Один набор условий. Две оценки.
          </p>
        </div>
        <div className="im-proof-grid">
          <div className="im-fleet-proof">
            <div className="im-proof-toggle" role="group" aria-label="Источник оценки парка">
              <button aria-pressed={!simulation} onClick={() => setSimulation(false)}>
                По формуле
              </button>
              <button aria-pressed={simulation} onClick={() => setSimulation(true)}>
                После имитации
              </button>
            </div>
            <div className="im-fleet-total">
              <strong>{fleet.total}</strong>
              <span>
                роботов
                <br />с резервом
              </span>
            </div>
            <div className="im-fleet-blocks" aria-hidden="true">
              {Array.from({ length: demo.sweep.by_formula.total }, (_, i) => (
                <i key={i} className={i >= fleet.total ? 'im-empty' : i >= fleet.working ? 'im-reserve' : ''} />
              ))}
            </div>
            <div className="im-fleet-split">
              <span>{fleet.working} в работе</span>
              <span>{fleet.reserve} в резерве</span>
            </div>
            <div className="im-proof-outcome">
              <span>Инвестиции в покупку</span>
              <strong>{million(fleet.capex_rub)}</strong>
            </div>
          </div>
          <div className="im-proof-explanation">
            <h3>
              {simulation ? 'Меньше роботов. Проверено на этой модели.' : 'Начальная оценка. По длительности цикла.'}
            </h3>
            <p>
              {simulation
                ? 'Имитация учитывает последовательность задач и общие ресурсы. Для этих условий рабочий парк из 11 роботов прошёл все пять повторов проверки.'
                : 'Формула даёт 14 рабочих роботов и 3 резервных. Это исходная конфигурация для проверки маршрутов, очередей и зарядки.'}
            </p>
            <div className="im-proof-flow">
              <span>
                17 <small>по формуле</small>
              </span>
              <ArrowRight size={28} />
              <span>
                13 <small>после проверки</small>
              </span>
            </div>
            <p className="im-proof-boundary">
              <Check size={17} /> Резерв уже включён в оба значения. На другом объекте имитация может увеличить парк.
            </p>
            <a href={`${WAREHOUSE}?step=simulation`} className="im-text-link">
              Разобрать проверку в демо <ArrowUpRight size={17} />
            </a>
          </div>
        </div>
        <div className="im-source-note">
          <span>Снимок публичного демо от 19.10.2026 · данные организатора и допущения модели.</span>
          <a href="/design-lab/immersive/evidence.json">
            Исходные данные <ArrowUpRight size={13} />
          </a>
        </div>
      </section>
      <section className="im-finance im-paper" id="immersive-finance">
        <div className="im-section-heading">
          <h2>
            Один объект.
            <br />
            <span>Разные способы внедрения.</span>
          </h2>
          <p>
            Стоимость покупки — только начало. Сравните вложения, эксплуатацию и денежный поток с работой «как сейчас».
          </p>
        </div>
        <div className="im-finance-tabs" role="group" aria-label="Способ внедрения">
          {modes.map((item, index) => (
            <button key={item.key} aria-pressed={mode === index} onClick={() => setMode(index)}>
              {item.name}
              <ArrowUpRight size={19} />
            </button>
          ))}
        </div>
        <div className="im-finance-detail">
          <div>
            <h3>{modes[mode].headline}</h3>
            <p>{modes[mode].text}</p>
            <a href={`${WAREHOUSE}?step=decision`} className="im-text-link">
              Сравнить в продукте <ArrowUpRight size={16} />
            </a>
          </div>
          <dl>
            <div>
              <dt>Инвестиции проекта</dt>
              <dd>{million(scenario.metrics.capex_rub)}</dd>
            </div>
            <div>
              <dt>Простой срок окупаемости</dt>
              <dd>
                {number(scenario.metrics.payback_years ?? 0)} <small>года</small>
              </dd>
            </div>
            <div>
              <dt>NPV проекта за 5 лет</dt>
              <dd>+{million(scenario.metrics.npv_rub)}</dd>
            </div>
          </dl>
        </div>
        <div className="im-assumptions">
          <strong>Это пример, не прогноз для вашего объекта.</strong>
          <p>
            В демо принят пятилетний горизонт и 100% превращение высвобождённого труда в денежную экономию —
            оптимистичное допущение. NPV показывает результат проекта с учётом стоимости денег во времени. Простой срок
            окупаемости её не учитывает. Все входы и формулы доступны в демо.
          </p>
        </div>
      </section>
    </>
  )
}

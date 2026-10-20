import { useState } from 'react'
import { ArrowUpRight, Check, Plus } from 'lucide-react'
import { Link } from 'react-router'

const MODES = [
  {
    title: 'Покупка',
    lead: 'Ваш парк. Ваш актив.',
    copy: 'Сравните первоначальные инвестиции и владение на выбранном горизонте. Оборудование — только часть полной стоимости.',
    items: ['Оборудование и внедрение', 'Инфраструктура объекта', 'Эксплуатация и сервис'],
    word: 'Владеть',
    detail: 'Инвестиции → эксплуатация',
  },
  {
    title: 'RaaS',
    lead: 'Роботы как сервис.',
    copy: 'Посмотрите на модель регулярных платежей. Учитывайте условия услуги, инфраструктуру и оставшиеся расходы объекта.',
    items: ['Регулярный платёж', 'Состав услуги', 'Затраты на стороне объекта'],
    word: 'Использовать',
    detail: 'Услуга → регулярный платёж',
  },
  {
    title: 'Лизинг',
    lead: 'Другой ритм вложений.',
    copy: 'Оцените аванс, платежи и выкуп вместе с эксплуатацией. Сравнивайте весь денежный поток, а не только входной платёж.',
    items: ['Аванс и платежи', 'Условия выкупа', 'Эксплуатационные расходы'],
    word: 'Распределять',
    detail: 'Аванс → платежи → выкуп',
  },
]

export function FinanceStory() {
  const [active, setActive] = useState(0)
  const mode = MODES[active]
  return (
    <section className="cinema-finance">
      <div className="cinema-section-top">
        <h2>
          Один объект.
          <br />
          <em>Разные стратегии.</em>
        </h2>
        <p>
          Роботизация начинается не с покупки робота.
          <br />
          Она начинается с выбора подходящей модели.
        </p>
      </div>
      <div className="cinema-finance-layout">
        <div className="cinema-finance-options">
          {MODES.map((item, index) => (
            <div key={item.title} className={index === active ? 'is-selected' : ''}>
              <button
                aria-expanded={index === active}
                aria-controls={'cinema-finance-' + index}
                onClick={() => setActive(index)}
              >
                <span>{item.title}</span>
                <Plus />
              </button>
              <div id={'cinema-finance-' + index} hidden={index !== active}>
                <h3>{item.lead}</h3>
                <p>{item.copy}</p>
                <ul>
                  {item.items.map((text) => (
                    <li key={text}>
                      <Check size={14} />
                      {text}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
        <div className="cinema-finance-visual" aria-live="polite">
          <div className="cinema-finance-disc" aria-hidden="true">
            <div />
            <div />
            <div />
          </div>
          <div className="cinema-finance-note">
            <span>Сценарий</span>
            <strong>{mode.title}</strong>
            <span>{mode.detail}</span>
          </div>
          <div className="cinema-finance-word" key={active}>
            {mode.word}
          </div>
          <Link to="/demo/warehouse_demo_01?step=decision">
            Сравнить на примере <ArrowUpRight size={20} />
          </Link>
        </div>
      </div>
    </section>
  )
}

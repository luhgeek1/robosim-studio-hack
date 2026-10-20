import { useState } from 'react'
import { ArrowRight, ArrowUpRight, Check } from 'lucide-react'
import { DEMO } from './scene-state'

const objects = [
  {
    name: 'Склад',
    key: 'warehouse_demo_01',
    title: 'Доставить паллету. Не остановить поток.',
    description:
      'Приёмка, хранение, отбор и отгрузка. Подбор учитывает груз и проходы; имитация проверяет транспорт, очереди и зарядку.',
    constraints: ['Груз и габариты', 'Ширина проходов', 'Объём и смены'],
    nodes: ['Приёмка', 'Хранение', 'Отгрузка'],
    resource: 'Зарядка',
    note: 'Горизонтальные перевозки, G2P и тягачи поддерживаются имитацией. Уборка оценивается аналитически.',
  },
  {
    name: 'Больница',
    key: 'hospital_demo_01',
    title: 'Доставить вовремя. Учесть общий лифт.',
    description: 'Питание, бельё, лекарства и пробы. Проверьте служебные маршруты и конкуренцию роботов за лифты.',
    constraints: ['Точки доставки', 'Доступ к лифтам', 'Срок выполнения'],
    nodes: ['Пищеблок', 'Лифт', 'Отделение'],
    resource: 'Аптека',
    note: 'Имитация моделирует служебные доставки и очередь роботов к лифту. Люди не моделируются отдельными агентами.',
  },
  {
    name: 'Аэропорт',
    key: 'airport_demo_01',
    title: 'Довезти багаж. Уложиться в оборот рейса.',
    description:
      'Сортировка, служебные дороги, стоянки. Подберите тягачи, проверьте сцепки и маршруты до воздушного судна.',
    constraints: ['Длина маршрута', 'Допуск на перрон', 'Время оборота'],
    nodes: ['Сортировка', 'Накопитель', 'Стоянка'],
    resource: 'Тележки',
    note: 'Поддерживаются багажные и служебные перевозки. Поток багажа в модели не привязан к расписанию воздушных судов.',
  },
]

export function ProcessSection() {
  const [active, setActive] = useState(0)
  const object = objects[active]
  return (
    <section className="im-process im-paper" id="immersive-process">
      <div className="im-section-heading">
        <h2>
          Начните с задачи.
          <br />
          <span>Роботы подберутся под неё.</span>
        </h2>
        <p>
          У каждого объекта свои ограничения. РобоМера связывает исходные условия, подходящие решения и работу парка.
        </p>
      </div>
      <div className="im-object-tabs" role="group" aria-label="Выберите тип объекта">
        {objects.map((item, index) => (
          <button key={item.key} aria-pressed={active === index} onClick={() => setActive(index)}>
            {item.name}
            <ArrowUpRight size={20} />
          </button>
        ))}
      </div>
      <div className="im-process-view">
        <div className="im-process-copy">
          <h3>{object.title}</h3>
          <p>{object.description}</p>
          <ul>
            {object.constraints.map((item) => (
              <li key={item}>
                <Check size={15} /> {item}
              </li>
            ))}
          </ul>
          <a href={`${DEMO}/${object.key}`} className="im-text-link">
            Открыть пример: {object.name.toLowerCase()} <ArrowUpRight size={16} />
          </a>
        </div>
        <div className="im-process-map">
          <div className="im-map-bar">
            <span>СХЕМА ПРОЦЕССА</span>
            <span>{object.name}</span>
          </div>
          <svg
            viewBox="0 0 620 310"
            role="img"
            aria-label={`${object.nodes.join(' → ')}. Общий ресурс: ${object.resource}. Условная схема процесса.`}
          >
            <defs>
              <pattern id="im-map-grid" width="28" height="28" patternUnits="userSpaceOnUse">
                <path d="M28 0H0V28" fill="none" stroke="#2e4435" strokeOpacity=".15" strokeWidth=".5" />
              </pattern>
            </defs>
            <rect width="620" height="310" fill="url(#im-map-grid)" />
            <path d="M100 173H520M310 173V75H430" fill="none" stroke="#9eaa99" strokeWidth="1" strokeDasharray="4 5" />
            <path d="M100 173H520" fill="none" stroke="#d45d3a" strokeWidth="3" />
            {[100, 310, 520].map((x, index) => (
              <g key={x}>
                <rect
                  x={x - 54}
                  y="126"
                  width="108"
                  height="94"
                  rx="2"
                  fill={index === 1 ? '#23382c' : '#e8eade'}
                  stroke="#80907c"
                  strokeWidth=".5"
                />
                <path
                  d={`M${x - 21} 155h42m-42 12h42m-42 12h42`}
                  stroke={index === 1 ? '#b5c7a6' : '#52644d'}
                  strokeWidth="2"
                />
                <text x={x} y="249" textAnchor="middle" fontSize="13" fill="#26392d">
                  {object.nodes[index]}
                </text>
                <circle cx={x} cy="220" r="4" fill="#d45d3a" />
              </g>
            ))}
            <rect x="410" y="45" width="110" height="55" rx="2" fill="#e0e4d7" stroke="#80907c" strokeWidth=".5" />
            <text x="465" y="77" textAnchor="middle" fontSize="12" fill="#26392d">
              {object.resource}
            </text>
            <circle cx="209" cy="173" r="11" fill="#ff6b42" />
            <path d="m205 169 5 4-5 4" fill="none" stroke="#24372a" strokeWidth="1.5" />
          </svg>
          <p>{object.note}</p>
        </div>
      </div>
      <div className="im-method">
        <div>
          <span>01 / Условия</span>
          <h3>Опишите объект</h3>
          <p>Задайте параметры вручную или импортируйте файл. Источники и допущения остаются видны.</p>
        </div>
        <ArrowRight className="im-method-arrow" />
        <div>
          <span>02 / Подбор</span>
          <h3>Поймите выбор</h3>
          <p>Сравните подходящих роботов. Узнайте причины исключения и какие данные ещё нужно уточнить.</p>
        </div>
        <ArrowRight className="im-method-arrow" />
        <div>
          <span>03 / Проверка</span>
          <h3>Испытайте процесс</h3>
          <p>Проверьте поддерживаемые процессы под нагрузкой. Уточнённый парк участвует в экономике.</p>
        </div>
      </div>
    </section>
  )
}

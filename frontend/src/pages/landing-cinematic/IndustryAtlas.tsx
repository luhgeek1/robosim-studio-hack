import { useId, useState } from 'react'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router'

const OBJECTS = [
  {
    name: 'Склады',
    key: 'warehouse_demo_01',
    title: 'Поток без лишних движений.',
    copy: 'Перемещение грузов, отбор и пики нагрузки. Проверьте, какой парк справится именно с вашим потоком.',
    tags: ['Грузы', 'Маршруты', 'Зарядка'],
    zone: ['Хранение', 'Отбор', 'Отгрузка'],
  },
  {
    name: 'Больницы',
    key: 'hospital_demo_01',
    title: 'Больше времени на главное.',
    copy: 'Уборка и внутренняя доставка. Сопоставьте режим объекта, ограничения среды и доступные роботизированные процессы.',
    tags: ['Уборка', 'Доставка', 'Режим работы'],
    zone: ['Отделения', 'Коридор', 'Службы'],
  },
  {
    name: 'Аэропорты',
    key: 'airport_demo_01',
    title: 'Движение в большом масштабе.',
    copy: 'Багаж, транспортировка и уборка. Оцените решения для разных задач и проверьте влияние нагрузки на парк.',
    tags: ['Багаж', 'Транспорт', 'Пиковая нагрузка'],
    zone: ['Терминал', 'Сортировка', 'Перрон'],
  },
]

export function IndustryAtlas() {
  const [selected, setSelected] = useState(0)
  const id = useId()
  const item = OBJECTS[selected]
  return (
    <section className="cinema-industries" id="cinema-use">
      <div className="cinema-section-top">
        <h2>
          У каждого объекта
          <br />
          свой <em>потенциал.</em>
        </h2>
        <p>
          Начните с близкого примера.
          <br />
          Затем задайте собственные условия.
        </p>
      </div>
      <div className="cinema-industry-layout">
        <div className="cinema-object-menu" role="tablist" aria-label="Тип объекта">
          {OBJECTS.map((object, index) => (
            <button
              key={object.key}
              id={id + '-tab-' + index}
              role="tab"
              aria-selected={selected === index}
              aria-controls={id + '-panel'}
              tabIndex={selected === index ? 0 : -1}
              onClick={() => setSelected(index)}
              onKeyDown={(event) => {
                if (
                  event.key === 'ArrowDown' ||
                  event.key === 'ArrowRight' ||
                  event.key === 'ArrowUp' ||
                  event.key === 'ArrowLeft'
                ) {
                  event.preventDefault()
                  const next = (index + (event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : 2)) % 3
                  setSelected(next)
                  document.getElementById(id + '-tab-' + next)?.focus()
                }
              }}
            >
              <span>{object.name}</span>
              <ArrowUpRight strokeWidth={1.2} />
            </button>
          ))}
          <div className="cinema-object-promise">
            <span>Ваши параметры.</span>
            <span>Ваш сценарий.</span>
            <span>Ваше решение.</span>
          </div>
        </div>
        <div
          className="cinema-object-panel"
          id={id + '-panel'}
          role="tabpanel"
          aria-labelledby={id + '-tab-' + selected}
        >
          <div className="cinema-blueprint" data-object={selected}>
            <svg key={selected} viewBox="0 0 600 340" role="img" aria-label={'Условная схема: ' + item.name}>
              <defs>
                <pattern id={id + '-grid'} width="24" height="24" patternUnits="userSpaceOnUse">
                  <path d="M24 0H0V24" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.12" />
                </pattern>
              </defs>
              <rect width="600" height="340" fill={'url(#' + id + '-grid)'} />
              <path d="M55 60H545V278H55Z" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
              {selected === 0 ? (
                [85, 205, 325, 445].flatMap((x) =>
                  [85, 173].map((y) => (
                    <g key={x + ':' + y}>
                      <rect x={x} y={y} width="70" height="50" fill="currentColor" opacity="0.13" />
                      <path d={'M' + x + ' ' + (y + 17) + 'h70m-70 17h70'} stroke="currentColor" opacity="0.3" />
                    </g>
                  )),
                )
              ) : selected === 1 ? (
                [80, 188, 296, 404].flatMap((x) =>
                  [75, 195].map((y) => (
                    <g key={x + ':' + y}>
                      <rect x={x} y={y} width="90" height="65" fill="currentColor" opacity="0.11" />
                      <path
                        d={'M' + (x + 12) + ' ' + (y + 16) + 'h24v30h-24z'}
                        fill="none"
                        stroke="currentColor"
                        opacity="0.4"
                      />
                    </g>
                  )),
                )
              ) : (
                <g fill="currentColor" opacity="0.13">
                  <rect x="80" y="80" width="435" height="60" />
                  <rect x="90" y="185" width="120" height="65" />
                  <rect x="244" y="185" width="120" height="65" />
                  <rect x="398" y="185" width="120" height="65" />
                </g>
              )}
              <path
                className="cinema-map-path"
                d={
                  selected === 0
                    ? 'M68 250H530V150H68V70H530'
                    : selected === 1
                      ? 'M60 166H530M120 166V150M335 166V180M450 166V150'
                      : 'M60 161H530M150 161V270M300 161V270M450 161V270'
                }
                fill="none"
                stroke="#e96337"
                strokeWidth="3"
                strokeLinejoin="round"
              />
              {[110, 280, 480].map((x, i) => (
                <g key={x}>
                  <circle cx={x} cy={selected === 0 ? 150 : 166} r="8" fill="#e96337" />
                  <circle cx={x} cy={selected === 0 ? 150 : 166} r="3" fill="#fff6df" />
                  <text x={x} y="312" textAnchor="middle" fill="currentColor" fontSize="11">
                    {item.zone[i]}
                  </text>
                </g>
              ))}
            </svg>
            <span className="cinema-map-label">Схема процесса / {item.name}</span>
          </div>
          <div className="cinema-object-description">
            <h3>{item.title}</h3>
            <p>{item.copy}</p>
            <div>
              {item.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <Link to={'/demo/' + item.key}>
              Исследовать пример <ArrowRight size={20} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpRight, Check, FileCheck2, Fingerprint, Route } from 'lucide-react'
import { Link } from 'react-router'
import { EASE, useLandingMotion } from './motion'

const METRICS = [
  {
    id: 'fleet',
    tab: 'Парк роботов',
    label: 'Парк с учётом резерва',
    value: '13',
    unit: 'роботов',
    breakdown: '11 в работе + 2 в резерве',
    status: 'Проверено в 5 прогонах пика',
    steps: [
      ['Входные данные', 'Планировка, поток задач и характеристики AMR'],
      ['Проверка', 'Маршруты, очереди, зарядка и пиковая нагрузка'],
      ['Основание', 'Минимальный парк, выдержавший все пять прогонов'],
    ],
  },
  {
    id: 'investment',
    tab: 'Инвестиции',
    label: 'Инвестиции в сценарий',
    value: '40,3',
    unit: 'млн ₽',
    breakdown: 'Парк + инфраструктура + интеграция',
    status: 'Состав затрат раскрывается в расчёте',
    steps: [
      ['Парк', '13 AMR с учётом резерва по результатам имитации'],
      ['Дополнительно', 'Инфраструктура и интеграция на объекте'],
      ['Основание', 'Цены каталога и нормативы выбранного сценария'],
    ],
  },
  {
    id: 'payback',
    tab: 'Окупаемость',
    label: 'Срок окупаемости',
    value: '2,2',
    unit: 'года',
    breakdown: 'Экономика сценария покупки',
    status: 'Покупка, RaaS и лизинг сравниваются отдельно',
    steps: [
      ['Затраты', 'Инвестиции и эксплуатационные расходы'],
      ['Эффект', 'Высвобождаемые трудозатраты и стоимость труда'],
      ['Основание', 'Денежный поток и допущения сценария покупки'],
    ],
  },
] as const

const PRINCIPLES = [
  {
    Icon: Fingerprint,
    title: 'Проверить расчёт',
    text: 'От итоговой цифры — к',
    emphasis: 'формуле, источникам и допущениям.',
  },
  {
    Icon: Route,
    title: 'Испытать сценарий',
    text: 'Пиковая нагрузка и сбои покажут,',
    emphasis: 'где проходит граница решения.',
  },
  {
    Icon: FileCheck2,
    title: 'Защитить решение',
    text: 'Экономика и снимки имитации —',
    emphasis: 'в PDF и Excel для вашей команды.',
  },
]

export function EvidenceSection({ workspace }: { workspace: string }) {
  const [active, setActive] = useState(0)
  const metric = METRICS[active]
  const { reduced, reveal } = useLandingMotion()
  return (
    <section className="landing-evidence landing-container" id="method" aria-labelledby="trust-title">
      <div className="landing-section-label">
        <span>03 / У КАЖДОГО РЕШЕНИЯ ЕСТЬ ОСНОВАНИЕ</span>
        <span>ПОСМОТРИТЕ, КАК УСТРОЕН РАСЧЁТ</span>
      </div>
      <div className="landing-evidence-layout">
        <motion.div className="landing-evidence-copy" {...reveal()}>
          <h2 id="trust-title">
            <span>У каждой цифры</span>
            <span>
              есть <em>объяснение.</em>
            </span>
          </h2>
          <p className="landing-evidence-intro">
            От результата — к его основаниям.
            <br />
            <strong>Данные, формулы, допущения.</strong> Всё перед вами.
          </p>
          <div className="landing-evidence-principles">
            {PRINCIPLES.map(({ Icon, title, text, emphasis }, i) => (
              <motion.article key={title} {...reveal(i * 0.07)}>
                <span className="landing-evidence-index" aria-hidden="true">
                  0{i + 1}
                </span>
                <div>
                  <h3>
                    {title}
                    <span>.</span>
                  </h3>
                  <p>
                    {text} <strong>{emphasis}</strong>
                  </p>
                </div>
                <Icon size={23} strokeWidth={1.5} aria-hidden="true" />
              </motion.article>
            ))}
          </div>
          <Link className="landing-evidence-link" to={workspace}>
            Разобрать свой объект <ArrowUpRight size={19} />
          </Link>
        </motion.div>
        <motion.figure className="landing-calculation" {...reveal(0.12)}>
          <div className="landing-calculation-titlebar">
            <div className="landing-window-controls" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <span className="landing-window-title">
              РобоМера <span>/ Расчёт проекта</span>
            </span>
            <span className="landing-window-view" aria-hidden="true">
              <i />
              <i />
            </span>
          </div>
          <div className="landing-calculation-header">
            <div>
              <span>Демонстрационный проект</span>
              <strong>
                Склад <span>20 000 м²</span>
              </strong>
            </div>
            <span className="landing-calculation-demo">ДЕМО</span>
          </div>
          <div className="landing-calculation-tabs" role="group" aria-label="Показатель демо-расчёта">
            {METRICS.map(({ id, tab }, i) => (
              <button key={id} type="button" aria-pressed={active === i} onClick={() => setActive(i)}>
                <span>{tab}</span>
                {active === i && (
                  <motion.i
                    aria-hidden="true"
                    layoutId="landing-calculation-tab"
                    transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                  />
                )}
              </button>
            ))}
          </div>
          <div className="landing-calculation-body" aria-live="polite" aria-atomic="true">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={metric.id}
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduced ? 0 : -8 }}
                transition={{ duration: reduced ? 0 : 0.22, ease: EASE }}
              >
                <div className="landing-calculation-overview">
                  <div className="landing-calculation-metric">
                    <span>{metric.label}</span>
                    <strong>
                      {metric.value}
                      <small>{metric.unit}</small>
                    </strong>
                    <p>{metric.breakdown}</p>
                  </div>
                  <div className="landing-calculation-fleet" aria-hidden="true">
                    <span>ПАРК СЦЕНАРИЯ</span>
                    <div>
                      {Array.from({ length: 13 }, (_, i) => (
                        <svg key={i} viewBox="0 0 20 24" className={i > 10 ? 'is-reserve' : undefined}>
                          <rect x="3" y="5" width="14" height="15" rx="4" />
                          <path d="M7 3h6M6 22h1m6 0h1" />
                          <path className="landing-mini-robot-eye" d="M8 11h4" />
                        </svg>
                      ))}
                    </div>
                    <small>
                      11 в работе <span>+ 2 в резерве</span>
                    </small>
                  </div>
                </div>
                <div className="landing-calculation-divider">
                  <span>ОТКУДА ЭТО ЧИСЛО</span>
                  <ArrowUpRight size={14} />
                </div>
                <ol className="landing-calculation-steps">
                  {metric.steps.map(([label, value], i) => (
                    <li key={label}>
                      <span>0{i + 1}</span>
                      <div>
                        <span>{label}</span>
                        <p>{value}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="landing-calculation-status">
                  <Check size={15} />
                  <span>{metric.status}</span>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
          <figcaption>Пример на демонстрационных данных. Исходные значения и допущения входят в отчёт.</figcaption>
        </motion.figure>
      </div>
    </section>
  )
}

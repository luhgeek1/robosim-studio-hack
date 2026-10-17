import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpRight, Check, FileCheck2, Fingerprint, Route } from 'lucide-react'
import { Link } from 'react-router'
import type { DemoSnapshot } from '@/entities/demo/api'
import { formatNumber, formatRub, formatYears } from '@/shared/lib/format'
import { EASE, useLandingMotion } from './motion'

const METRICS = [
  {
    id: 'fleet',
    tab: 'Парк роботов',
    label: 'Рекомендуемый парк',
    unit: 'роботов',
    reason: 'Парк, проверенный в пределах заданной нагрузки и конфигурации.',
    status: 'Результат проверки открыт',
    steps: [
      ['Данные объекта', 'Планировка, поток задач и параметры AMR'],
      ['Проверка на пике', 'Маршруты, очереди и зарядка под нагрузкой'],
    ],
  },
  {
    id: 'investment',
    tab: 'Инвестиции',
    label: 'Инвестиции в сценарий',
    unit: 'млн ₽',
    reason: 'Стоимость запуска по ценам каталога и нормативам сценария.',
    status: 'Состав затрат раскрыт',
    steps: [
      ['Роботы', 'Цена оборудования × парк, включая резерв'],
      ['Запуск', 'Инфраструктура и интеграция на объекте'],
    ],
  },
  {
    id: 'payback',
    tab: 'Окупаемость',
    label: 'Срок окупаемости',
    unit: 'года',
    reason: 'Возврат инвестиций по денежному потоку сценария покупки.',
    status: 'С учётом расходов на эксплуатацию',
    steps: [
      ['Затраты', 'Инвестиции и эксплуатационные расходы'],
      ['Эффект', 'Высвобождаемые трудозатраты и стоимость труда'],
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

export function EvidenceSection({ workspace, demo }: { workspace: string; demo?: DemoSnapshot }) {
  const [active, setActive] = useState(0)
  const metrics = demo?.calculations.find((c) => c.scenario_id === demo.primary_scenario_id)?.metrics
  const fleet = demo?.sweep?.by_simulation ?? demo?.sweep?.by_formula
  const values = [
    formatNumber(metrics?.robots_total),
    formatRub(metrics?.capex_rub),
    metrics ? formatYears(metrics.payback_years) : '—',
  ]
  const metric = { ...METRICS[active], value: values[active], unit: active === 0 ? 'роботов' : '' }
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
            Разобрать расчёт примера <ArrowUpRight size={19} />
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
                className="landing-calculation-result"
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
                  </div>
                  <div className="landing-calculation-reason">
                    <p>{metric.reason}</p>
                    <div className="landing-calculation-status">
                      <Check size={14} aria-hidden="true" />
                      <span>{metric.status}</span>
                    </div>
                  </div>
                  {metric.id === 'fleet' && (
                    <div className="landing-calculation-fleet">
                      <div className="landing-calculation-fleet-bar" aria-hidden="true">
                        {Array.from({ length: Math.min(metrics?.robots_total ?? 0, 100) }, (_, i) => (
                          <span key={i} className={i >= (fleet?.working ?? 0) ? 'is-reserve' : undefined} />
                        ))}
                      </div>
                      <div className="landing-calculation-fleet-legend">
                        <span>
                          <i aria-hidden="true" /> <strong>{formatNumber(fleet?.working)}</strong> в работе
                        </span>
                        <span>
                          <i aria-hidden="true" /> <strong>{formatNumber(fleet?.reserve)}</strong> в резерве
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="landing-calculation-detail">
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

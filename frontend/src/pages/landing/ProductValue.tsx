import { useId, useRef, useState } from 'react'
import { motion, useInView, useScroll, useTransform } from 'framer-motion'
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Layers3, Pause, Play, Route, ScanLine } from 'lucide-react'
import { Tabs } from 'radix-ui'
import { Link } from 'react-router'
import { EASE, useLandingMotion } from './use-landing-motion'
import { DossierStack } from './DossierStack'
import './product-value.css'

const QUESTIONS = [
  {
    id: 'fit',
    label: 'Подойдёт ли робот?',
    input: {
      title: 'Сначала — ваша задача.',
      text: 'Груз, поток задач и условия объекта задают требования к роботу.',
    },
    output: {
      title: 'Выбор с объяснением.',
      text: 'Подходящие модели, причины выбора и ограничения каждой — рядом с характеристиками и источниками.',
    },
    action: 'Посмотреть подбор',
    step: 'matching',
    diagram: 'ОТ ЗАДАЧИ К ПОДХОДЯЩЕЙ МОДЕЛИ',
    Icon: ScanLine,
  },
  {
    id: 'capacity',
    label: 'Справится ли парк?',
    input: {
      title: 'Проверьте рабочий день.',
      text: 'Задайте поток задач и посмотрите, как парк работает на вашем плане — в обычную смену и на пике.',
    },
    output: {
      title: 'Найдите узкие места.',
      text: 'Маршруты, очереди и зарядка покажут, где парк теряет время и что стоит изменить.',
    },
    action: 'Открыть имитацию',
    step: 'simulation',
    diagram: 'ОБЪЕКТ РАБОТАЕТ КАК ЕДИНАЯ СИСТЕМА',
    Icon: Route,
  },
  {
    id: 'economics',
    label: 'Сойдётся ли экономика?',
    input: {
      title: 'Одинаковые условия.',
      text: 'Сравните покупку, RaaS и лизинг с текущим способом работы — на одних исходных данных.',
    },
    output: {
      title: 'Решение в цифрах.',
      text: 'Вложения, текущие расходы и окупаемость для каждого сценария. Видно, как допущения влияют на результат.',
    },
    action: 'Сравнить сценарии',
    step: 'decision',
    diagram: 'ОДИН ОБЪЕКТ. НЕСКОЛЬКО ВАРИАНТОВ.',
    Icon: Layers3,
  },
] as const

function FitDiagram() {
  return (
    <div className="lp-fit-diagram">
      <div className="lp-fit-criteria">
        {[
          ['01', 'Что перемещаем', 'Груз и габариты'],
          ['02', 'Сколько задач', 'Поток и смены'],
          ['03', 'Где работаем', 'Проезды и среда'],
        ].map(([number, title, text], index) => (
          <div key={number} className="lp-fit-criterion" style={{ animationDelay: `${index * 0.13 + 0.1}s` }}>
            <span>{number}</span>
            <p>
              <strong>{title}</strong>
              <small>{text}</small>
            </p>
            <Check className="lp-fit-check" size={15} aria-hidden="true" />
          </div>
        ))}
      </div>
      <div className="lp-fit-machine">
        <span className="lp-value-micro">ПРОФИЛЬ РЕШЕНИЯ</span>
        <svg viewBox="0 0 240 190" fill="none" aria-hidden="true">
          <path className="lp-diagram-guide" d="M24 145H220M44 38V157M201 38V157M39 24H205M44 19V29M201 19V29" />
          <path className="lp-diagram-dimension" d="M67 130V78L121 49L177 78V130L121 160L67 130Z" />
          <path className="lp-diagram-outline" d="M63 111L119 80L181 112V138L124 169L63 137V111Z" />
          <path className="lp-diagram-outline" d="M63 111L124 143L181 112M124 143V169" />
          <path className="lp-diagram-load" d="M88 91V60L119 43L153 61V92L121 109L88 91Z" />
          <path className="lp-diagram-outline" d="M88 60L121 78L153 61M121 78V109" />
          <path className="lp-diagram-accent" d="M75 132L106 148M142 147L170 132" />
          <path className="lp-diagram-guide" d="M25 178H218M25 173V183M218 173V183" />
          <g className="lp-fit-scan">
            <rect x="44" y="34" width="158" height="16" fill="#bbcf9c" fillOpacity="0.05" />
            <path d="M44 50H202" stroke="#c5d5ab" strokeWidth="1" />
            <path d="M44 47V53M202 47V53" stroke="#dd9a72" strokeWidth="1.5" />
          </g>
          <circle cx="121" cy="122" r="9" className="lp-fit-sensor-ring" />
          <circle cx="121" cy="122" r="4" className="lp-diagram-sensor" />
        </svg>
        <span className="lp-fit-result">
          <i /> Подбор с объяснением
        </span>
      </div>
    </div>
  )
}

function CapacityDiagram() {
  return (
    <div className="lp-capacity-diagram">
      <div className="lp-capacity-labels">
        <span>ПРИЁМКА</span>
        <span>ЗАРЯДКА</span>
      </div>
      <svg viewBox="0 0 520 230" fill="none" aria-hidden="true">
        <path className="lp-diagram-guide" d="M25 25H495V205H25V25ZM25 115H495M260 25V205" />
        {[85, 205, 325].map((x, index) => (
          <g key={x} className="lp-capacity-rack" style={{ animationDelay: `${index * 0.12}s` }}>
            <rect className="lp-diagram-shelf" x={x} y="65" width="75" height="37" />
            <path className="lp-diagram-outline" d={`M${x + 25} 65V102M${x + 50} 65V102`} />
            <rect className="lp-diagram-shelf" x={x} y="136" width="75" height="37" />
            <path className="lp-diagram-outline" d={`M${x + 25} 136V173M${x + 50} 136V173`} />
          </g>
        ))}
        <path className="lp-capacity-route" d="M55 45H460V188H55V45ZM55 119H460" />
        {[0, 1, 2, 3].map((index) => (
          <g
            key={index}
            className="lp-capacity-unit"
            style={{ offsetDistance: `${index * 25}%`, animationDelay: `${index * -4}s` }}
          >
            <circle className="lp-capacity-halo" r="16" />
            <rect className="lp-capacity-robot" x="-8" y="-5" width="16" height="10" rx="2" />
            <path className="lp-diagram-accent" d="M-4 2H4" />
          </g>
        ))}
        <path className="lp-diagram-accent" d="M445 27H475V51H445V27Z" />
        <path className="lp-diagram-outline" d="M460 31L455 40H465L460 48" />
        <circle className="lp-capacity-charge" cx="460" cy="39" r="22" />
      </svg>
      <div className="lp-capacity-key">
        <span>
          <i /> Маршруты
        </span>
        <span>
          <i /> Работа парка
        </span>
        <span>
          <i /> Общие ресурсы
        </span>
      </div>
    </div>
  )
}

function EconomicsDiagram() {
  return (
    <div className="lp-economics-diagram">
      <div className="lp-finance-baseline">
        <span>БАЗА СРАВНЕНИЯ</span>
        <strong>Как работает объект сейчас</strong>
      </div>
      <div className="lp-finance-options">
        {[
          ['01', 'Покупка', 'Вложения в парк', 'Содержание и сервис'],
          ['02', 'RaaS', 'Роботы как услуга', 'Регулярные платежи'],
          ['03', 'Лизинг', 'Первоначальный взнос', 'График платежей'],
        ].map(([number, title, first, second], index) => (
          <div key={number} style={{ animationDelay: `${index * 0.14 + 0.12}s` }}>
            <span>{number}</span>
            <strong>{title}</strong>
            <p>
              {first}
              <br />
              {second}
            </p>
          </div>
        ))}
      </div>
      <div className="lp-finance-summary">
        <span>Затраты</span>
        <i />
        <span>Эффект</span>
        <i />
        <span>Окупаемость</span>
      </div>
    </div>
  )
}

export function ProductValueSection() {
  const { reveal, reduced } = useLandingMotion()
  const [active, setActive] = useState('fit')
  const [paused, setPaused] = useState(false)
  const scrollRange = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const visible = useInView(content, { amount: 0.15 })
  const { scrollYProgress: storyProgress } = useScroll({ target: scrollRange, offset: ['start start', 'end end'] })
  const introY = useTransform(storyProgress, [0, 0.35, 1], ['0svh', '0svh', '-65svh'])
  // Explicit endpoints keep native scroll timelines from returning to the underlying opacity.
  const introOpacity = useTransform(storyProgress, [0, 0.45, 0.65, 0.88, 1], [1, 1, 0.7, 0, 0])
  const cueOpacity = useTransform(storyProgress, [0, 0.28, 0.48, 1], [0.7, 0.7, 0, 0])
  const contentY = useTransform(storyProgress, [0, 0.45, 1], ['112svh', '112svh', '0svh'])
  const contentOpacity = useTransform(storyProgress, [0, 0.45, 0.68, 0.95, 1], [0, 0, 0.65, 1, 1])
  const contentPointerEvents = useTransform(storyProgress, (value) => (value > 0.6 ? 'auto' : 'none'))
  const indicatorId = useId()
  return (
    <section
      className="lp-value-section"
      id="possibilities"
      aria-labelledby="value-title"
      data-running={visible && !paused && !reduced}
      data-reduced={reduced}
    >
      <div className="lp-value-scroll-range" ref={scrollRange} aria-hidden="true" />
      <div className="lp-value-stage">
        <div className="lp-value-intro">
          <div className="lp-value-intro-pin">
            <div className="landing-container lp-value-intro-shell">
              <div className="landing-section-label">
                <span>03 / ВОПРОСЫ ДО ВНЕДРЕНИЯ</span>
                <span>ОТ СОМНЕНИЙ К АРГУМЕНТАМ</span>
              </div>
              <div className="lp-value-intro-copy-viewport">
                <motion.div
                  className="lp-value-intro-copy"
                  style={{ y: reduced ? 0 : introY, opacity: reduced ? 1 : introOpacity }}
                >
                  <div className="lp-value-heading">
                    <motion.h2
                      id="value-title"
                      aria-label="Сначала разобраться. Потом вкладываться."
                      initial={reduced ? false : 'hidden'}
                      whileInView="visible"
                      viewport={{ once: true, amount: 0.6 }}
                      variants={{ visible: { transition: { staggerChildren: reduced ? 0 : 0.12 } } }}
                    >
                      {['Сначала разобраться.', 'Потом вкладываться.'].map((line, index) => (
                        <span
                          className={`lp-value-title-mask${index ? ' lp-value-title-mask--accent' : ''}`}
                          key={line}
                        >
                          <motion.span
                            variants={{ hidden: { y: '110%', opacity: 0 }, visible: { y: 0, opacity: 1 } }}
                            transition={{ duration: reduced ? 0 : 0.95, ease: EASE }}
                          >
                            {line}
                          </motion.span>
                        </span>
                      ))}
                    </motion.h2>
                    <motion.p {...reveal(0.22, 18)}>
                      Три вопроса, от которых зависит решение о роботизации. Ответьте на них на модели своего объекта.
                    </motion.p>
                  </div>
                </motion.div>
              </div>
              <motion.span
                className="lp-value-scroll-cue"
                style={{ opacity: reduced ? 0 : cueOpacity }}
                aria-hidden="true"
              >
                ПРОКРУТИТЕ, ЧТОБЫ ПРОВЕРИТЬ
                <ArrowDown size={15} strokeWidth={1.5} />
              </motion.span>
            </div>
          </div>
        </div>
        <div
          className="landing-container lp-value-content-track"
          onFocusCapture={(event) => {
            if (
              !(event.target instanceof HTMLElement) ||
              !event.target.matches(':focus-visible') ||
              reduced ||
              storyProgress.get() >= 0.99 ||
              !scrollRange.current
            )
              return
            window.scrollTo({
              top: window.scrollY + scrollRange.current.getBoundingClientRect().bottom - window.innerHeight,
              behavior: 'instant',
            })
          }}
        >
          <motion.div
            className="lp-value-content"
            ref={content}
            style={{
              y: reduced ? 0 : contentY,
              opacity: reduced ? 1 : contentOpacity,
              pointerEvents: reduced ? 'auto' : contentPointerEvents,
            }}
          >
            <Tabs.Root value={active} onValueChange={setActive} className="lp-value-tabs">
              <Tabs.List className="lp-value-tablist" aria-label="Что можно проверить в РобоМере">
                {QUESTIONS.map(({ id, label }, index) => (
                  <Tabs.Trigger className="lp-value-tab" key={id} value={id}>
                    <span>0{index + 1}</span>
                    <strong>{label}</strong>
                    <ArrowUpRight size={18} aria-hidden="true" />
                    {active === id && (
                      <motion.i
                        className="lp-value-tab-indicator"
                        layoutId={indicatorId}
                        transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 34 }}
                        aria-hidden="true"
                      />
                    )}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
              {QUESTIONS.map(({ id, input, output, action, step, diagram, Icon }, index) => (
                <Tabs.Content className="lp-value-panel" key={id} value={id}>
                  <motion.div
                    className="lp-value-note lp-value-note--input"
                    initial={reduced ? false : { opacity: 0, x: -14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: reduced ? 0 : 0.5, ease: EASE }}
                  >
                    <span className="lp-value-note-kicker">ВАШИ УСЛОВИЯ</span>
                    <h3>{input.title}</h3>
                    <p>{input.text}</p>
                  </motion.div>
                  <motion.div
                    className="lp-value-visual"
                    initial={reduced ? false : { opacity: 0, y: 18, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: reduced ? 0 : 0.55, delay: reduced ? 0 : 0.06, ease: EASE }}
                  >
                    <div className="lp-value-visual-head">
                      <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
                      <span>{diagram}</span>
                      <div className="lp-value-visual-tools">
                        {!reduced && (
                          <button
                            type="button"
                            className="lp-value-pause"
                            onClick={() => setPaused((value) => !value)}
                            aria-label={paused ? 'Продолжить анимацию схемы' : 'Приостановить анимацию схемы'}
                            title={paused ? 'Продолжить анимацию' : 'Приостановить анимацию'}
                            aria-pressed={paused}
                          >
                            {paused ? <Play size={11} /> : <Pause size={11} />}
                          </button>
                        )}
                        <span>0{index + 1}</span>
                      </div>
                    </div>
                    {id === 'fit' ? <FitDiagram /> : id === 'capacity' ? <CapacityDiagram /> : <EconomicsDiagram />}
                    <div className="lp-value-visual-foot">
                      <span>ЛОГИКА РАБОТЫ ПЛАТФОРМЫ</span>
                      <span>РОБОМЕРА / {['ПОДБОР', 'ИМИТАЦИЯ', 'ЭКОНОМИКА'][index]}</span>
                    </div>
                  </motion.div>
                  <motion.div
                    className="lp-value-note lp-value-note--output"
                    initial={reduced ? false : { opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : 0.12, ease: EASE }}
                  >
                    <span className="lp-value-note-kicker">ЧТО ПОЛУЧИТЕ</span>
                    <h3>{output.title}</h3>
                    <p>{output.text}</p>
                    <Link className="lp-value-note-link" to={`/demo/warehouse_demo_01?step=${step}`}>
                      {action}
                      <ArrowUpRight size={17} aria-hidden="true" />
                    </Link>
                  </motion.div>
                </Tabs.Content>
              ))}
            </Tabs.Root>
          </motion.div>
        </div>
      </div>
      <div className="lp-value-runway" aria-hidden="true" />
    </section>
  )
}

export function ProjectOutcomeSection() {
  const { reveal } = useLandingMotion()
  return (
    <section className="lp-outcome-section" id="result" aria-labelledby="outcome-title">
      <div className="landing-container">
        <div className="landing-section-label">
          <span>04 / РЕЗУЛЬТАТ ДЛЯ ВАШЕЙ КОМАНДЫ</span>
          <span>СОХРАНИТЕ. ОБСУДИТЕ. ПРИМИТЕ РЕШЕНИЕ.</span>
        </div>
        <div className="lp-outcome-layout">
          <motion.div className="lp-outcome-art" {...reveal()}>
            <DossierStack />
          </motion.div>
          <motion.div className="lp-outcome-copy" {...reveal(0.12)}>
            <h2 id="outcome-title">
              Есть что показать.
              <br />
              <span>Есть что обсудить.</span>
            </h2>
            <p className="lp-outcome-lead">
              Перенесите разговор о роботизации из «кажется, пора» в обсуждение конкретного сценария.
            </p>
            <div className="lp-outcome-points">
              <div>
                <span>01</span>
                <div>
                  <h3>Руководителю — основания</h3>
                  <p>Состав парка, вложения и окупаемость. Варианты внедрения рядом с текущим способом работы.</p>
                </div>
              </div>
              <div>
                <span>02</span>
                <div>
                  <h3>Команде — общая картина</h3>
                  <p>План объекта, маршруты и снимки имитации. Видно, что проверяли и при каких условиях.</p>
                </div>
              </div>
              <div>
                <span>03</span>
                <div>
                  <h3>Для следующего шага — конкретика</h3>
                  <p>
                    Исходные данные, источники и допущения. Понятно, что уточнить при обследовании и обсудить с
                    поставщиком.
                  </p>
                </div>
              </div>
            </div>
            <Link className="lp-outcome-link" to="/demo/warehouse_demo_01?step=report">
              <span>Разобрать готовый пример</span>
              <ArrowUpRight size={20} aria-hidden="true" />
            </Link>
          </motion.div>
        </div>
        <motion.div className="lp-outcome-start" {...reveal()}>
          <div>
            <span className="lp-value-micro">ПЕРВЫЙ ШАГ УЖЕ ПОДГОТОВЛЕН</span>
            <p>Откройте пример. Всё остальное — попробуйте сами.</p>
          </div>
          <Link to="/demo">
            Без регистрации
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </motion.div>
      </div>
    </section>
  )
}

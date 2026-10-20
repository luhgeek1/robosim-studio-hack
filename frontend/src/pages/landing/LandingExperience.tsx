import { lazy, Suspense, useRef, useState } from 'react'
import { motion, useInView, useMotionValueEvent, useScroll } from 'framer-motion'
import { ArrowDown, ArrowUpRight, Pause, Play } from 'lucide-react'
import { Link } from 'react-router'
import type { ObjectKind } from './LandingScene'
import { useLandingMotion } from './use-landing-motion'
import './experience.css'

const SimulationMap = lazy(() => import('./SimulationMap'))
const LandingScene = lazy(() => import('./LandingScene'))

const OBJECTS: { id: ObjectKind; title: string; subtitle: string; text: string; tags: string[]; demo: string }[] = [
  {
    id: 'warehouse',
    title: 'Склад',
    subtitle: 'ВНУТРЕННЯЯ ЛОГИСТИКА',
    text: 'От приёмки до отгрузки. Проверьте, как парк справится с потоком паллет и узкими проходами.',
    tags: ['Перевозка паллет', 'Комплектация'],
    demo: 'warehouse_demo_01',
  },
  {
    id: 'hospital',
    title: 'Больница',
    subtitle: 'СЕРВИСНАЯ ДОСТАВКА',
    text: 'Питание, бельё, медикаменты. Оцените доставку между отделениями с учётом графика работы.',
    tags: ['Доставка питания', 'Между отделениями'],
    demo: 'hospital_demo_01',
  },
  {
    id: 'airport',
    title: 'Аэропорт',
    subtitle: 'НАЗЕМНОЕ ОБСЛУЖИВАНИЕ',
    text: 'Багаж и наземные маршруты. Сравните варианты роботизации для нагрузки вашего аэропорта.',
    tags: ['Перевозка багажа', 'Пиковая нагрузка'],
    demo: 'airport_demo_01',
  },
]

export function LandingHero({ workspace }: { workspace: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)
  const [chapter, setChapter] = useState(0)
  const { enter, reveal } = useLandingMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  useMotionValueEvent(scrollYProgress, 'change', (value) => setChapter(value < 0.25 ? 0 : value < 0.75 ? 1 : 2))
  return (
    <div className="cm-story" ref={ref}>
      <div className="cm-stage" aria-label="3D-сцена, ракурс которой меняется при прокрутке">
        <div className="cm-stage-atmosphere" aria-hidden="true" />
        <div className="cm-stage-model">
          <Suspense fallback={<div className="lp-map-loading">Собираем модель объекта…</div>}>
            <SimulationMap progress={scrollYProgress} paused={paused} />
          </Suspense>
        </div>
        <div className="cm-stage-caption" aria-hidden="true">
          <span>ROBOМЕРА / DIGITAL TWIN</span>
          <span>СХЕМАТИЧЕСКАЯ МОДЕЛЬ СКЛАДА</span>
        </div>
        <div className="cm-stage-hud">
          <div className="cm-orbit-progress" aria-hidden="true">
            <span>РАКУРС</span>
            <i>
              <motion.b style={{ scaleX: scrollYProgress }} />
            </i>
          </div>
          <button
            type="button"
            className="cm-pause"
            onClick={() => setPaused(!paused)}
            aria-label={paused ? 'Продолжить анимацию' : 'Приостановить анимацию'}
            aria-pressed={paused}
          >
            {paused ? <Play size={12} /> : <Pause size={12} />}
            {paused ? 'Продолжить' : 'Пауза движения'}
          </button>
        </div>
        <div className="cm-chapter-indicator" aria-hidden="true">
          <span>0{chapter + 1}</span>
          <i />
          {['ОБЪЕКТ', 'ДВИЖЕНИЕ', 'РЕШЕНИЕ'][chapter]}
        </div>
      </div>
      <div className="cm-narrative">
        <section className="cm-chapter cm-chapter--hero landing-container" aria-labelledby="landing-title">
          <div className="cm-copy">
            <motion.p className="cm-eyebrow" {...enter(0.1)}>
              ИНЖЕНЕРНАЯ ПЛАТФОРМА РОБОТИЗАЦИИ
            </motion.p>
            <motion.h1 id="landing-title" {...enter(0.2)}>
              Сначала
              <br />
              <span>увидеть.</span>
            </motion.h1>
            <motion.p className="cm-description" {...enter(0.35)}>
              Ваш объект. Ваши роботы.
              <br />
              Проверьте, как они будут работать вместе - ещё до внедрения.
            </motion.p>
            <motion.div className="cm-actions" {...enter(0.45)}>
              <Link to="/demo" className="landing-button landing-button-orange">
                Попробовать без регистрации <ArrowUpRight size={18} />
              </Link>
              <Link to={workspace} className="lp-secondary-link">
                Рассчитать свой объект <ArrowUpRight size={15} />
              </Link>
            </motion.div>
            <motion.div className="cm-hero-meta" {...enter(0.55)}>
              <div>
                <span>СРЕДА</span>
                <strong>Ваш объект</strong>
              </div>
              <div>
                <span>МЕТОД</span>
                <strong>Имитация</strong>
              </div>
              <div>
                <span>РЕЗУЛЬТАТ</span>
                <strong>Решение в цифрах</strong>
              </div>
            </motion.div>
          </div>
          <a className="cm-scroll-cue" href="#movement">
            <i />
            <span>ПРОКРУТИТЕ, ЧТОБЫ ИССЛЕДОВАТЬ</span>
            <ArrowDown size={13} />
          </a>
        </section>
        <section className="cm-chapter landing-container" id="movement" aria-labelledby="movement-title">
          <motion.div className="cm-copy" {...reveal()}>
            <p className="cm-eyebrow">01 / ОБЪЕКТ В ДВИЖЕНИИ</p>
            <h2 id="movement-title">
              Каждый
              <br />
              маршрут.
              <br />
              <span>Под контролем.</span>
            </h2>
            <p className="cm-description">
              Проезды, точки загрузки, станции зарядки. Проверьте работу парка на модели и найдите узкие места до
              запуска.
            </p>
            <div className="cm-detail-tags">
              <span>Маршруты</span>
              <span>Очереди</span>
              <span>Зарядка</span>
            </div>
          </motion.div>
        </section>
        <section className="cm-chapter landing-container" aria-labelledby="decision-title">
          <motion.div className="cm-copy" {...reveal()}>
            <p className="cm-eyebrow">02 / ОТ МОДЕЛИ К РЕШЕНИЮ</p>
            <h2 id="decision-title">
              Проверить.
              <br />
              Посчитать.
              <br />
              <span>Решиться.</span>
            </h2>
            <p className="cm-description">
              Сравните состав парка, инвестиции и окупаемость. Выберите сценарий, который подходит вашему объекту.
            </p>
            <Link to="/demo/warehouse_demo_01?step=report" className="cm-text-link">
              Посмотреть расчёт <ArrowUpRight size={20} />
            </Link>
          </motion.div>
        </section>
      </div>
    </div>
  )
}

function ObjectPreview({ kind }: { kind: ObjectKind }) {
  const ref = useRef<HTMLDivElement>(null)
  const visible = useInView(ref, { once: true, margin: '200px' })
  const [paused, setPaused] = useState(false)
  return (
    <div className="lp-object-preview" ref={ref}>
      {visible && (
        <Suspense fallback={<div className="lp-object-loading" />}>
          <LandingScene kind={kind} paused={paused} />
        </Suspense>
      )}
      <button
        type="button"
        className="lp-preview-pause"
        onClick={() => setPaused(!paused)}
        aria-label={paused ? 'Продолжить движение роботов' : 'Приостановить движение роботов'}
        aria-pressed={paused}
      >
        {paused ? <Play size={12} /> : <Pause size={12} />}
      </button>
    </div>
  )
}

export function ApplicationsSection() {
  const { reveal } = useLandingMotion()
  return (
    <section className="lp-applications" id="applications" aria-labelledby="applications-title">
      <div className="landing-container">
        <div className="lp-section-meta">
          <span>01 / СРЕДА ПРИМЕНЕНИЯ</span>
          <span>ВАШ ОБЪЕКТ. ВАШИ УСЛОВИЯ.</span>
        </div>
        <motion.div className="lp-applications-heading" {...reveal()}>
          <h2 id="applications-title">
            Разные пространства.
            <br />
            <span>Один точный подход.</span>
          </h2>
          <p>
            У каждого объекта своя логика.
            <br />
            Соберите её в модели и проверьте,
            <br />
            где роботизация имеет смысл.
          </p>
        </motion.div>
        <div className="lp-objects">
          {OBJECTS.map((object, index) => (
            <motion.article className="lp-object" key={object.id} {...reveal(index * 0.08)}>
              <div className="lp-object-index">
                <span>0{index + 1}</span>
                <span className="lp-object-interaction">ВРАЩАЙТЕ МОДЕЛЬ</span>
              </div>
              <ObjectPreview kind={object.id} />
              <Link
                to={`/demo/${object.demo}`}
                aria-label={`Изучить сценарий: ${object.title}`}
                className="lp-object-link"
              >
                <div className="lp-object-copy">
                  <span className="lp-object-subtitle">{object.subtitle}</span>
                  <h3>{object.title}</h3>
                  <p>{object.text}</p>
                  <div className="lp-object-tags">
                    {object.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <span className="lp-object-action">
                    Изучить сценарий <ArrowUpRight size={16} />
                  </span>
                </div>
              </Link>
            </motion.article>
          ))}
        </div>
        <p className="lp-applications-note">
          <span /> 3D-модели типовых объектов. В проекте планировка строится по вашим параметрам.
        </p>
      </div>
    </section>
  )
}

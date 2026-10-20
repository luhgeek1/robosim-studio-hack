import { useRef, useState } from 'react'
import { motion, useMotionValueEvent } from 'framer-motion'
import { ArrowDown, ArrowUpRight, Pause, Play } from 'lucide-react'
import { Link } from 'react-router'
import { useLandingMotion } from './use-landing-motion'
import { ApplicationsSection } from './ApplicationsSection'
import { WarehouseJourney } from './WarehouseJourney'
import { useWarehouseJourney } from './warehouse-journey'
import './experience.css'

export { ApplicationsSection } from './ApplicationsSection'

export function LandingExperience({ workspace }: { workspace: string }) {
  return (
    <WarehouseJourney>
      <LandingHero workspace={workspace} />
      <ApplicationsSection />
    </WarehouseJourney>
  )
}

export function LandingHero({ workspace }: { workspace: string }) {
  const { controller, progress: scrollYProgress, paused, togglePaused } = useWarehouseJourney()!
  const [chapter, setChapter] = useState(0)
  const chapterIndex = useRef(0)
  const { enter, reveal } = useLandingMotion()
  useMotionValueEvent(scrollYProgress, 'change', (value) => {
    const next = value < 0.25 ? 0 : value < 0.75 ? 1 : 2
    if (next !== chapterIndex.current) {
      chapterIndex.current = next
      setChapter(next)
    }
  })
  return (
    <div className="cm-story" ref={(node) => controller.bindStory(node)}>
      <div className="cm-stage" aria-label="3D-сцена, ракурс которой меняется при прокрутке">
        <div className="cm-stage-atmosphere" aria-hidden="true" />
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
            onClick={togglePaused}
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
              Проверьте, как они будут работать вместе — ещё до внедрения.
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

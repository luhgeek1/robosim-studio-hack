import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { motion, useInView, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { ArrowDown, ArrowRight, ArrowUpRight, Crosshair, Pause, Play } from 'lucide-react'
import { Link } from 'react-router'
import { SceneBoundary } from '@/shared/ui/boundary'
import { DemoEvidence } from './DemoEvidence'
import { LandingStory } from './LandingStory'
import './editorial.css'

const WarehouseSculpture = lazy(() => import('./WarehouseSculpture'))
const PHASES = ['План объекта', 'Маршруты', 'Парк в работе']

function WarehousePoster() {
  return (
    <div className="lab-sculpture">
      <img
        className="lab-poster"
        src="/design-lab/warehouse-fallback.png"
        width="708"
        height="440"
        alt="Статичная пространственная схема склада"
      />
    </div>
  )
}

export function EditorialPage() {
  const [phase, setPhase] = useState(2)
  const [paused, setPaused] = useState(false)
  const [visible, setVisible] = useState(true)
  const heroRef = useRef<HTMLElement>(null)
  const inView = useInView(heroRef)
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], [0, 85])
  useEffect(() => {
    document.title = 'РобоМера — сначала доказательства'
    const update = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return (
    <div className="lab-editorial" id="top">
      <a className="lab-skip" href="#content">
        К содержимому
      </a>
      <header className="lab-header lab-wrap">
        <Link to="/" className="lab-brand">
          <Crosshair size={28} strokeWidth={1.5} />
          РобоМера
        </Link>
        <nav aria-label="Основная навигация">
          <a href="#principle">Принцип работы</a>
          <Link to="/catalog">Каталог роботов</Link>
        </nav>
        <Link to="/demo" className="lab-header-action">
          Открыть платформу <ArrowUpRight size={17} />
        </Link>
      </header>
      <main id="content">
        <section className="lab-hero lab-wrap" ref={heroRef}>
          <div className="lab-hero-topline">
            <span>Независимая оценка роботизации</span>
            <span>От параметров объекта — к решению</span>
          </div>
          <div className="lab-hero-grid">
            <div className="lab-hero-copy">
              <h1>
                Роботизация.
                <br />
                Сначала —<br />
                <em>доказательства.</em>
              </h1>
              <p>
                Какие роботы подойдут. Сколько их нужно.
                <br className="lab-desktop-break" /> Когда вложения имеют смысл.
                <br className="lab-desktop-break" /> Проверьте на модели своего объекта.
              </p>
              <Link to="/demo/warehouse_demo_01" className="lab-button">
                Открыть демо <ArrowUpRight size={21} />
              </Link>
              <span className="lab-caption">Без регистрации. С расчётом и отчётом.</span>
            </div>
            <motion.figure className="lab-hero-visual" style={{ y: reduced ? 0 : y }}>
              <div className="lab-visual-top">
                <span>Склад / пространственная схема</span>
                <span className="lab-cross">+</span>
              </div>
              <SceneBoundary fallback={<WarehousePoster />}>
                <Suspense fallback={<WarehousePoster />}>
                  <WarehouseSculpture phase={phase} moving={inView && visible && !paused && !reduced} />
                </Suspense>
              </SceneBoundary>
              <div className="lab-scene-controls" role="group" aria-label="Слои модели склада">
                {PHASES.map((label, i) => (
                  <button key={label} aria-pressed={phase === i} onClick={() => setPhase(i)}>
                    <span>0{i + 1}</span>
                    {label}
                  </button>
                ))}
                <button
                  className="lab-pause"
                  aria-label={paused ? 'Продолжить движение' : 'Приостановить движение'}
                  aria-pressed={paused}
                  disabled={!!reduced}
                  onClick={() => setPaused(!paused)}
                >
                  {paused || reduced ? <Play size={15} /> : <Pause size={15} />}
                </button>
              </div>
              <figcaption>Иллюстрация принципа. Результаты имитации — в демо.</figcaption>
            </motion.figure>
          </div>
          <div className="lab-hero-bottom">
            <a href="#principle">
              <ArrowDown size={17} /> Посмотрите, на чём строится решение
            </a>
            <span>Склад · Больница · Аэропорт</span>
          </div>
        </section>
        <section id="principle" className="lab-principle lab-wrap">
          <h2>
            Робот в каталоге.
            <br />
            <span>Робот в вашем процессе.</span>
            <br />
            Между ними — проверка.
          </h2>
          <div className="lab-principle-aside">
            <p>
              Паспортная производительность не учитывает вашу планировку. Очереди, зарядка и пиковая нагрузка меняют
              необходимый парк — и цену решения.
            </p>
            <Link to="/demo/warehouse_demo_01?step=simulation" className="lab-text-link">
              Посмотреть имитацию <ArrowRight size={20} />
            </Link>
          </div>
        </section>
        <DemoEvidence />
        <LandingStory />
      </main>
      <footer className="lab-footer lab-wrap">
        <span>РобоМера · Предварительная оценка роботизации</span>
        <Link to="/design-lab">
          Все варианты <ArrowUpRight size={16} />
        </Link>
      </footer>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { motion, MotionConfig } from 'framer-motion'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Box,
  ChartNoAxesCombined,
  Check,
  Menu,
  Route,
  ScanLine,
  X,
} from 'lucide-react'
import { Link } from 'react-router'
import { sessionHome, useSession } from '@/entities/session'
import { Accent, ScrollProgress } from './motion'
import { useLandingMotion } from './use-landing-motion'
import { QuestionsSection } from './QuestionsSection'
import './landing.css'
import { ApplicationsSection, LandingHero } from './LandingExperience'

const STEPS = [
  {
    Icon: ScanLine,
    title: 'Опишите объект',
    lead: 'Площадь, процессы, нагрузка и смены.',
    text: 'Начните с демо-объекта или задайте свои параметры.',
    tag: 'Исходные данные',
  },
  {
    Icon: Box,
    title: 'Найдите своих роботов',
    lead: 'Решения под ваши ограничения.',
    text: 'Сравните роботов и узнайте, почему каждый из них подходит вашему объекту.',
    tag: 'Объяснимый подбор',
  },
  {
    Icon: Route,
    title: 'Проверьте в движении',
    lead: 'Маршруты, очереди и зарядка.',
    text: 'Посмотрите, как парк работает на плане и справляется с пиковой нагрузкой.',
    tag: 'Имитация в 2D и 3D',
  },
  {
    Icon: ChartNoAxesCombined,
    title: 'Посчитайте эффект',
    lead: 'Покупка, RaaS или лизинг.',
    text: 'Сравните сценарии, узнайте окупаемость и подготовьте отчёт для принятия решения.',
    tag: 'Расчёт и отчёт',
  },
]

function Brand({ footer = false }: { footer?: boolean }) {
  return (
    <Link to="/" className="landing-brand" aria-label="РобоМера — на главную">
      <span className="landing-brand-mark">
        <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <circle cx="16" cy="16" r="7" stroke="currentColor" strokeWidth="2.5" />
          <path d="M16 3v5M16 24v5M3 16h5M24 16h5" stroke="currentColor" strokeWidth="2.5" />
          <circle cx="16" cy="16" r="2" fill="currentColor" />
        </svg>
      </span>
      <span>
        РобоМера<span className="landing-brand-period">.</span>
      </span>
      {footer && <span className="landing-brand-descriptor">Решения, у которых есть основания.</span>}
    </Link>
  )
}

export function LandingPage() {
  const { reveal, enter } = useLandingMotion()
  const [menuOpen, setMenuOpen] = useState(false)
  const { user } = useSession()
  const account = user && user.role !== 'guest'
  const workspace = account ? sessionHome(user).path : '/demo?new=1'
  const signIn = account ? sessionHome(user).path : '/login'

  useEffect(() => {
    document.title = 'РобоМера — роботизация начинается с расчёта'
    window.scrollTo({ top: 0, behavior: 'instant' })
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      <div className="landing" id="top">
        <ScrollProgress />
        <a className="landing-skip" href="#main">
          Перейти к содержимому
        </a>
        <div className="landing-dark-intro landing-header-shell">
          <motion.header className="landing-header landing-container" {...enter()}>
            <Brand />
            <nav className="landing-nav" aria-label="Основная навигация">
              <a href="#applications">Для кого</a>
              <a href="#workflow">Как это работает</a>
              <Link to="/catalog">
                Каталог роботов <ArrowUpRight size={13} />
              </Link>
            </nav>
            <Link className="landing-header-login" to={signIn}>
              <span className="hidden min-[701px]:inline">{account ? 'В кабинет' : 'Войти в платформу'}</span>
              <span className="min-[701px]:hidden">{account ? 'Кабинет' : 'Войти'}</span>
              <ArrowUpRight size={17} />
            </Link>
            <button
              className="landing-menu-toggle"
              type="button"
              aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
              aria-expanded={menuOpen}
              aria-controls="landing-mobile-nav"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </motion.header>
          {menuOpen && (
            <nav
              className="landing-mobile-nav"
              id="landing-mobile-nav"
              aria-label="Мобильная навигация"
              onClick={() => setMenuOpen(false)}
            >
              <a href="#applications">
                Для кого <ArrowDownRight size={18} />
              </a>
              <a href="#workflow">
                Как это работает <ArrowDownRight size={18} />
              </a>
              <Link to="/catalog">
                Каталог роботов <ArrowUpRight size={18} />
              </Link>
              <Link to={signIn}>
                Открыть платформу <ArrowUpRight size={18} />
              </Link>
            </nav>
          )}
        </div>
        <main id="main" tabIndex={-1}>
          <LandingHero workspace={workspace} />
          <ApplicationsSection />

          <section className="landing-workflow landing-container" id="workflow" aria-labelledby="workflow-title">
            <div className="landing-section-label">
              <span>02 / КАК ЭТО РАБОТАЕТ</span>
              <span>ЧЕТЫРЕ ШАГА. ОДНА ПЛАТФОРМА.</span>
            </div>
            <motion.div className="landing-section-heading" {...reveal()}>
              <h2 id="workflow-title">
                От «а если» —<br />к решению <Accent>в цифрах.</Accent>
              </h2>
              <p>
                Всё, что нужно для первой оценки роботизации:
                <br className="landing-desktop-break" /> от параметров объекта до отчёта руководству.
              </p>
            </motion.div>
            <div className="landing-steps">
              {STEPS.map(({ Icon, title, lead, text, tag }, i) => (
                <motion.article
                  className={`landing-step${i === STEPS.length - 1 ? ' landing-step--result' : ''}`}
                  key={title}
                  {...reveal(i * 0.09)}
                >
                  <div className="landing-step-top">
                    <span>0{i + 1}</span>
                    <span className="landing-step-icon">
                      <Icon size={25} strokeWidth={1.5} />
                    </span>
                  </div>
                  <h3>{title}</h3>
                  <p>
                    <strong>{lead}</strong> {text}
                  </p>
                  <div className="landing-step-tag">
                    <div>
                      <span>НА ВЫХОДЕ</span>
                      <strong>{tag}</strong>
                    </div>
                    <span className="landing-step-check">
                      <Check size={14} />
                    </span>
                  </div>
                </motion.article>
              ))}
            </div>
          </section>

          <section id="start" className="landing-final-cta" aria-labelledby="create-project-title">
            <div className="landing-launch-scenery" aria-hidden="true">
              <svg viewBox="0 0 1440 820" fill="none" preserveAspectRatio="xMidYMid slice">
                <g className="landing-launch-plan">
                  <path d="M-100 154H348V54H1116V178H1530M-90 682H244V772H1090V650H1540" />
                  <path d="M-40 206H296V104H1064V230H1490M-60 630H296V720H1038V598H1510" />
                  <path d="M-70 258H244V154H1012V282H1520M-80 578H348V668H986V546H1500" />
                  <path d="M348 54V-50M1116 178V650M244 258V682M986 668V900" />
                  {[0, 1, 2].map((i) => (
                    <g key={i} transform={`translate(${i * 88} 0)`}>
                      <rect x="-20" y="350" width="54" height="156" />
                      <path d="M-20 389H34M-20 428H34M-20 467H34" />
                      <rect x="1214" y="328" width="54" height="156" />
                      <path d="M1214 367H1268M1214 406H1268M1214 445H1268" />
                    </g>
                  ))}
                </g>
                <g className="landing-launch-route">
                  <path d="M-40 206H296V104H584M1510 598H1038V720H850" />
                  <rect x="290" y="98" width="12" height="12" />
                  <rect x="1032" y="592" width="12" height="12" />
                  <path d="M576 98L584 104L576 110M858 714L850 720L858 726" />
                </g>
              </svg>
            </div>
            <div className="landing-container landing-cta-card">
              <motion.div className="landing-cta-copy" {...reveal()}>
                <span className="landing-launch-eyebrow">ОТ ПЛАНА К РЕШЕНИЮ</span>
                <h2 id="create-project-title">
                  Теперь —
                  <br />
                  <span>ваш сценарий.</span>
                </h2>
                <Link
                  to={account ? '/projects?new=1' : '/demo?new=1'}
                  state={{ from: '/projects?new=1' }}
                  className="landing-cta-button"
                >
                  Начать
                  <span className="landing-cta-icon" aria-hidden="true">
                    <ArrowUpRight size={21} />
                  </span>
                </Link>
                <div className="landing-launch-steps" aria-label="От объекта через симуляцию к решению">
                  <span>Объект</span>
                  <ArrowRight size={13} aria-hidden="true" />
                  <span>Симуляция</span>
                  <ArrowRight size={13} aria-hidden="true" />
                  <span>Решение</span>
                </div>
              </motion.div>
            </div>
          </section>
          <QuestionsSection workspace="/demo" />
        </main>
        <footer className="landing-footer">
          <div className="landing-container">
            <div className="landing-footer-top">
              <Brand footer />
              <div>
                <Link to="/catalog">
                  Каталог роботов <ArrowUpRight size={13} />
                </Link>
                <a href="#questions">Вопросы и ответы</a>
                <a href="/privacy/">Политика конфиденциальности</a>
                <a href="#top" className="landing-to-top" aria-label="Вернуться наверх">
                  <ArrowRight size={20} />
                </a>
              </div>
            </div>
            <div className="landing-footer-bottom">
              <span>© 2026 РобоМера</span>
              <span>Платформа предварительной оценки роботизации</span>
              <span>
                СОЗДАНО ДЛЯ ОБОСНОВАННЫХ РЕШЕНИЙ <span className="landing-square" />
              </span>
            </div>
          </div>
        </footer>
      </div>
    </MotionConfig>
  )
}

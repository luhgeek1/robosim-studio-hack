import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { motion, MotionConfig, useInView, useReducedMotion } from 'framer-motion'
import {
  ArrowDown,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Box,
  ChartNoAxesCombined,
  Check,
  CircleHelp,
  Hospital,
  Layers3,
  Menu,
  MoveUpRight,
  MousePointer2,
  Pause,
  Plane,
  Play,
  Route,
  ScanLine,
  ShieldCheck,
  Warehouse,
  X,
} from 'lucide-react'
import { Link } from 'react-router'
import { useSession } from '@/entities/session'
import { useDemo } from '@/entities/demo/api'
import { formatNumber, formatRub, formatYears, pluralRu } from '@/shared/lib/format'
import type { ObjectKind } from './LandingScene'
import { Accent, SceneTransition, ScrollProgress, TiltCard } from './motion'
import { EASE, useLandingMotion } from './use-landing-motion'
import { EvidenceSection } from './EvidenceSection'
import { QuestionsSection } from './QuestionsSection'
import './landing.css'

const LandingScene = lazy(() => import('./LandingScene'))
const OBJECTS = [
  {
    id: 'warehouse',
    label: 'Склад',
    Icon: Warehouse,
    process: 'Перемещение паллет',
    robot: 'Паллетные AMR',
    note: 'Стеллажи, зоны приёмки и зарядные станции',
  },
  {
    id: 'hospital',
    label: 'Больница',
    Icon: Hospital,
    process: 'Внутренняя доставка',
    robot: 'Сервисные роботы',
    note: 'Палаты, коридоры и пост персонала',
  },
  {
    id: 'airport',
    label: 'Аэропорт',
    Icon: Plane,
    process: 'Обработка багажа',
    robot: 'Транспортные роботы',
    note: 'Багажные ленты, терминал и зоны сортировки',
  },
] as const

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

function MiniPlan() {
  const ref = useRef<SVGSVGElement>(null)
  const inView = useInView(ref, { amount: 0.1 })
  const reduced = useReducedMotion()
  const playing = inView && !reduced
  return (
    <svg
      ref={ref}
      viewBox="0 0 540 260"
      className="landing-mini-plan"
      role="img"
      aria-label="Схематический план склада с маршрутами роботов"
    >
      <defs>
        <pattern id="landing-plan-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke="#ffffff" strokeOpacity=".06" />
        </pattern>
      </defs>
      <rect width="540" height="260" fill="url(#landing-plan-grid)" />
      <rect x="35" y="27" width="470" height="204" rx="3" fill="none" stroke="#64706e" strokeWidth="2" />
      {[75, 175, 275, 375].flatMap((x) =>
        [60, 130].map((y) => (
          <g key={`${x}-${y}`}>
            <rect x={x} y={y} width="63" height="39" rx="2" fill="#44514e" stroke="#65726c" />
            {[0, 1, 2].map((i) => (
              <path key={i} d={`M${x + 21 * i} ${y}v39`} stroke="#75827a" strokeWidth="1" />
            ))}
            <path d={`M${x} ${y + 39}h63`} stroke="#ff7048" strokeWidth="2" />
          </g>
        )),
      )}
      <path
        className="landing-route-line"
        d="M55 200H470V115H55V45H470"
        fill="none"
        stroke="#ff7048"
        strokeWidth="1.5"
        strokeDasharray="4 5"
        style={{ animationPlayState: playing ? 'running' : 'paused' }}
      />
      {[
        { x: 160, y: 200 },
        { x: 470, y: 157 },
        { x: 248, y: 115 },
        { x: 55, y: 80 },
        { x: 350, y: 45 },
      ].map(({ x, y }, i) => (
        <motion.g
          key={i}
          className="landing-plan-robot"
          initial={false}
          animate={playing ? { x: [55, 470, 470, 55, 55], y: [200, 200, 45, 45, 200] } : { x, y }}
          transition={
            playing
              ? { duration: 22, ease: 'linear', repeat: Infinity, times: [0, 0.364, 0.5, 0.864, 1], delay: -i * 4.4 }
              : { duration: 0 }
          }
        >
          <circle r="13" fill="#ff7048" fillOpacity=".12" />
          <rect x="-6" y="-5" width="12" height="10" rx="3" fill="#ff7048" />
          <path d="M-3 2h6" stroke="#fff4e9" strokeWidth="1.5" />
        </motion.g>
      ))}
      <path d="M20 22v-9h9M511 13h9v9M520 238v9h-9M29 247h-9v-9" stroke="#a1b6ab" strokeWidth="1" />
    </svg>
  )
}

export function LandingPage() {
  const { reduced, reveal, enter } = useLandingMotion()
  const [kind, setKind] = useState<ObjectKind>('warehouse')
  const [paused, setPaused] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [calculation, setCalculation] = useState<'formula' | 'simulation'>('simulation')
  const { status, user } = useSession()
  const workspace =
    status === 'authenticated'
      ? user?.role === 'admin'
        ? '/admin'
        : user?.role === 'vendor'
          ? '/vendor'
          : '/projects'
      : '/demo?new=1'
  const demoQuery = useDemo('warehouse_demo_01')
  const demo = demoQuery.data && 'demo' in demoQuery.data ? demoQuery.data : undefined
  const sweep = demo?.sweep
  const selectedFleet = calculation === 'simulation' && sweep?.applied ? sweep.by_simulation : sweep?.by_formula
  const before = sweep?.by_formula
  const after = sweep?.by_simulation
  const fleetDelta = (after?.total ?? 0) - (before?.total ?? 0)
  const activeObject = OBJECTS.find((item) => item.id === kind)!
  const simulation = calculation === 'simulation'

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
        <div className="landing-dark-intro">
          <motion.header className="landing-header landing-container" {...enter()}>
            <Brand />
            <nav className="landing-nav" aria-label="Основная навигация">
              <a href="#workflow">Как это работает</a>
              <a href="#economics">Экономический эффект</a>
              <Link to="/catalog">
                Каталог роботов <ArrowUpRight size={13} />
              </Link>
            </nav>
            <Link className="landing-header-login" to={workspace}>
              <span className="hidden min-[701px]:inline">
                {status === 'authenticated' ? 'В кабинет' : 'Войти в платформу'}
              </span>
              <span className="min-[701px]:hidden">{status === 'authenticated' ? 'Кабинет' : 'Войти'}</span>
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
              <a href="#workflow">
                Как это работает <ArrowDownRight size={18} />
              </a>
              <a href="#economics">
                Экономический эффект <ArrowDownRight size={18} />
              </a>
              <Link to="/catalog">
                Каталог роботов <ArrowUpRight size={18} />
              </Link>
              <Link to={workspace}>
                Открыть платформу <ArrowUpRight size={18} />
              </Link>
            </nav>
          )}
        </div>
        <main id="main" tabIndex={-1}>
          <div className="landing-dark-intro">
            <section className="landing-hero landing-container" aria-labelledby="landing-title">
              <div className="landing-hero-copy">
                <motion.div className="landing-eyebrow" {...enter(0.1)}>
                  <span className="landing-square" /> ОТ ИДЕИ ДО ОБОСНОВАННОГО РЕШЕНИЯ
                </motion.div>
                <h1 id="landing-title" aria-label="Роботизация начинается с расчёта.">
                  {['Роботизация', 'начинается', 'с расчёта.'].map((line, i) => (
                    <span className="landing-hero-line" key={line} aria-hidden="true">
                      <motion.span
                        className={i === 2 ? 'landing-hero-accent' : undefined}
                        initial={reduced ? false : { y: '110%' }}
                        animate={{ y: 0 }}
                        transition={{ duration: reduced ? 0 : 0.9, delay: reduced ? 0 : 0.16 + i * 0.13, ease: EASE }}
                      >
                        {line}
                      </motion.span>
                    </span>
                  ))}
                </h1>
                <motion.p className="landing-hero-description" {...enter(0.5)}>
                  Подберите роботов для своего объекта.
                  <br className="landing-desktop-break" /> Проверьте их в симуляции. Узнайте,
                  <br className="landing-desktop-break" /> когда окупятся инвестиции.
                </motion.p>
                <motion.div className="landing-hero-actions" {...enter(0.62)}>
                  <Link className="landing-button landing-button-orange" to="/demo">
                    Попробовать без регистрации <ArrowUpRight size={20} />
                  </Link>
                  <Link className="landing-demo-link" to={workspace}>
                    <span>
                      <Play size={12} fill="currentColor" />
                    </span>
                    Рассчитать свой объект
                  </Link>
                </motion.div>
                <motion.div className="landing-hero-note" {...enter(0.72)}>
                  <span /> Готовый расчёт, имитация и отчёт. Сразу, без аккаунта.
                </motion.div>
              </div>
              <motion.div className="landing-visual" id="simulation" {...enter(0.25)}>
                <div className="landing-scene-topline">
                  <span>
                    <span className="landing-live-dot" /> ИНТЕРАКТИВНАЯ МОДЕЛЬ
                  </span>
                  <span>3D / 01—03</span>
                </div>
                <div className="landing-object-switch" role="group" aria-label="Тип объекта в 3D-демонстрации">
                  {OBJECTS.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      className={kind === id ? 'is-active' : ''}
                      aria-pressed={kind === id}
                      onClick={() => setKind(id)}
                    >
                      {kind === id && (
                        <motion.span
                          className="landing-object-indicator"
                          layoutId="landing-object-indicator"
                          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                        />
                      )}
                      <Icon size={16} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
                <div className="landing-scene-grid" aria-hidden="true" />
                <SceneTransition sceneKey={kind}>
                  <Suspense
                    fallback={
                      <div className="landing-scene-loading">
                        <Layers3 size={36} />
                        <span>Собираем ваш объект…</span>
                      </div>
                    }
                  >
                    <LandingScene kind={kind} paused={paused} />
                  </Suspense>
                </SceneTransition>
                <div className="landing-scene-tag" key={kind}>
                  <span className="landing-tag-dot" />
                  <span>
                    <strong>{activeObject.robot}</strong>
                    <small>{activeObject.process}</small>
                  </span>
                  <MoveUpRight size={16} />
                </div>
                <div className="landing-scene-coordinates" aria-hidden="true">
                  <span>Y</span>
                  <i />
                  <span>X</span>
                </div>
                <div className="landing-scene-bottomline">
                  <span>
                    <MousePointer2 size={13} /> Потяните, чтобы повернуть
                  </span>
                  <button
                    type="button"
                    onClick={() => setPaused(!paused)}
                    aria-label={paused ? 'Продолжить анимацию' : 'Приостановить анимацию'}
                    aria-pressed={paused}
                  >
                    {paused ? <Play size={13} /> : <Pause size={13} />}
                    {paused ? 'Продолжить' : 'Пауза'}
                  </button>
                </div>
                <p className="landing-scene-caption" aria-live="polite">
                  {activeObject.note}. Визуальное демо.
                </p>
              </motion.div>
            </section>
            <div className="landing-intro-bottom landing-container">
              <a href="#workflow" className="landing-scroll-link">
                <span className="landing-scroll-icon">
                  <ArrowDown size={15} />
                </span>{' '}
                Весь путь к роботизации
              </a>
              <p>
                Сначала проверяем на модели.
                <br />
                <span>Потом принимаем решения в реальности.</span>
              </p>
              <span className="landing-intro-index">[ РОБОМЕРА / 2026 ]</span>
            </div>
          </div>

          <section className="landing-workflow landing-container" id="workflow" aria-labelledby="workflow-title">
            <div className="landing-section-label">
              <span>01 / КАК ЭТО РАБОТАЕТ</span>
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
                <TiltCard
                  className={`landing-step${i === STEPS.length - 1 ? ' landing-step--result' : ''}`}
                  key={title}
                  delay={i * 0.09}
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
                </TiltCard>
              ))}
            </div>
          </section>

          <section className="landing-economics-section" id="economics" aria-labelledby="economics-title">
            <div className="landing-container">
              <div className="landing-section-label">
                <span>02 / ЭКОНОМИКА, ПРОВЕРЕННАЯ ДВИЖЕНИЕМ</span>
                <span>ПРИМЕР ИЗ ДЕМО-ПРОЕКТА</span>
              </div>
              <div className="landing-economics-grid">
                <motion.div className="landing-result-panel" {...reveal()}>
                  <div className="landing-result-header">
                    <span className="landing-result-icon">
                      <Warehouse size={19} />
                    </span>
                    <div>
                      <strong>Склад 20 000 м²</strong>
                      <span>Перемещение паллет · AMR</span>
                    </div>
                    <span className="landing-result-demo">ДЕМО</span>
                  </div>
                  <div className="landing-result-tabs" role="group" aria-label="Метод расчёта демо-проекта">
                    <button
                      type="button"
                      className={!simulation ? 'is-active' : ''}
                      aria-pressed={!simulation}
                      onClick={() => setCalculation('formula')}
                    >
                      {!simulation && (
                        <motion.span
                          className="landing-result-indicator"
                          layoutId="landing-result-indicator"
                          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                        />
                      )}
                      <span className="landing-result-tab-label">По формуле</span>
                    </button>
                    <button
                      type="button"
                      className={simulation ? 'is-active' : ''}
                      aria-pressed={simulation}
                      onClick={() => setCalculation('simulation')}
                    >
                      {simulation && (
                        <motion.span
                          className="landing-result-indicator"
                          layoutId="landing-result-indicator"
                          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                        />
                      )}
                      <span className="landing-result-tab-label">
                        По имитации{' '}
                        <span>
                          {sweep?.applied
                            ? `${formatNumber(fleetDelta)} ${pluralRu(Math.abs(fleetDelta), ['робот', 'робота', 'роботов'])}`
                            : 'проверка'}
                        </span>
                      </span>
                    </button>
                  </div>
                  <MiniPlan />
                  <div className="landing-result-stats" aria-live="polite">
                    <div>
                      <span>Парк с резервом</span>
                      <strong>
                        {formatNumber(selectedFleet?.total)}
                        <small> роботов</small>
                      </strong>
                    </div>
                    <div>
                      <span>Инвестиции</span>
                      <strong>
                        {selectedFleet ? formatNumber(selectedFleet.capex_rub / 1e6, 1) : '—'}
                        <small> млн ₽</small>
                      </strong>
                    </div>
                    <div>
                      <span>Окупаемость</span>
                      <strong className="landing-result-highlight">
                        <small>{selectedFleet ? formatYears(selectedFleet.payback_years) : 'Готовим расчёт…'}</small>
                      </strong>
                    </div>
                  </div>
                  <div className="landing-result-status">
                    {simulation && sweep?.applied ? (
                      <>
                        <ShieldCheck size={15} />
                        <span>Совместная проверка пройдена: {sweep.joint_validation?.replications} повторений</span>
                        <span className="landing-run-checks">
                          {Array.from({ length: sweep.joint_validation?.replications ?? 0 }, (_, n) => (
                            <motion.span
                              key={n}
                              initial={reduced ? false : { opacity: 0, scale: 0.6 }}
                              whileInView={{ opacity: 1, scale: 1 }}
                              viewport={{ once: true }}
                              transition={{ delay: reduced ? 0 : n * 0.1, duration: reduced ? 0 : 0.3 }}
                            >
                              <Check size={12} />
                            </motion.span>
                          ))}
                        </span>
                      </>
                    ) : (
                      <>
                        <CircleHelp size={15} />
                        <span>Стартовая оценка. Проверьте парк имитацией.</span>
                      </>
                    )}
                  </div>
                </motion.div>
                <motion.div className="landing-economics-copy" {...reveal(0.12)}>
                  <span className="landing-overline">ПРОВЕРЬТЕ ДО ВЛОЖЕНИЙ</span>
                  <h2 id="economics-title">
                    Меньше догадок.
                    <br />
                    <span>Больше оснований.</span>
                  </h2>
                  <p>
                    <strong>Формула — только начало.</strong> Имитация проверяет, как роботы справляются с планировкой
                    объекта, очередями и пиками нагрузки.
                  </p>
                  <p>
                    {before && after ? (
                      <>
                        В текущем примере парк с резервом:{' '}
                        <mark>
                          {before.total} → {after.total} роботов
                        </mark>
                        . Экономика пересчиталась следом.
                      </>
                    ) : (
                      'Имитация проверяет рабочий парк; результат влияет на количество роботов и экономику.'
                    )}
                  </p>
                  <div className="landing-saving">
                    <div>
                      <span className="landing-saving-label">ИЗМЕНЕНИЕ ИНВЕСТИЦИЙ</span>
                      <strong>{before && after ? formatRub(after.capex_rub - before.capex_rub) : '—'}</strong>
                    </div>
                    <p>
                      в демо-сценарии
                      <br />
                      <strong>после проверки имитацией</strong>
                    </p>
                  </div>
                  <Link to="/demo/warehouse_demo_01?step=simulation" className="landing-text-link">
                    Открыть проверенный пример <ArrowUpRight size={20} />
                  </Link>
                  <p className="landing-disclaimer">
                    Пример на данных демонстрационного склада. Результат для вашего объекта зависит от исходных данных и
                    допущений.
                  </p>
                </motion.div>
              </div>
            </div>
          </section>

          <EvidenceSection workspace="/demo/warehouse_demo_01?step=evidence" demo={demo} />

          <section className="landing-final-cta" aria-labelledby="create-project-title">
            <div className="landing-container landing-cta-card">
              <motion.div className="landing-cta-copy" {...reveal()}>
                <h2 id="create-project-title">
                  Посчитайте,
                  <br />
                  прежде чем
                  <br />
                  покупать
                </h2>
                <p>Первый расчёт объекта займёт около 15 минут. Без звонков менеджеру.</p>
                <Link
                  to={status === 'authenticated' ? '/projects?new=1' : '/demo?new=1'}
                  state={{ from: '/projects?new=1' }}
                  className="landing-cta-button"
                >
                  Создать проект <ArrowRight size={20} />
                </Link>
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

import { useEffect } from 'react'
import { Link } from 'react-router'
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  Crosshair,
  FileDown,
  Play,
  Route,
  ScanLine,
  ShieldCheck,
} from 'lucide-react'
import { ProductStage, ExampleFinance } from './ProductStage'
import { RobotPortrait } from './RobotPortrait'
import { IndustryModel } from './IndustryModel'
import './stage.css'
import './sections.css'
import './platform.css'

const industries = [
  {
    id: 'warehouse',
    name: 'Склад',
    task: 'Ускорить движение грузов',
    text: 'Паллеты, стеллажи, приёмка и отгрузка. Проверьте парк на своей планировке.',
    tags: ['Транспортировка', 'Уборка'],
  },
  {
    id: 'hospital',
    name: 'Больница',
    task: 'Освободить время персонала',
    text: 'Доставка внутри здания и сервисные задачи. Учтите коридоры, графики и нагрузку.',
    tags: ['Внутренняя доставка', 'Сервис'],
  },
  {
    id: 'airport',
    name: 'Аэропорт',
    task: 'Справиться с пиковым потоком',
    text: 'Багаж и обслуживание терминала. Проверьте решение для разных процессов.',
    tags: ['Обработка багажа', 'Уборка'],
  },
] as const
const questions = [
  [
    'Нужно ли разбираться в робототехнике?',
    'Нет. Начните с типа объекта, площади и процессов. Платформа покажет подходящие решения и объяснит подбор. Параметры можно уточнять по мере проработки проекта.',
  ],
  [
    'Можно ли начать без регистрации?',
    'Да. Откройте готовый пример или создайте свой объект в гостевом режиме. Аккаунт понадобится для сохранения проекта между сессиями и дальнейшей работы.',
  ],
  [
    'Что будет, если ещё нет точной планировки?',
    'Начните с известных параметров и предварительного расчёта. По мере уточнения планировки, процессов и нагрузки вы сможете проверить сценарий в имитации. Точность оценки зависит от исходных данных.',
  ],
  [
    'Можно ли сразу идти закупать роботов?',
    'Результат помогает сравнить сценарии и обосновать следующий шаг. Перед внедрением уточните технические условия с поставщиком и проверьте решение на реальном объекте.',
  ],
]

function Brand() {
  return (
    <Link className="platform-brand" to="/" aria-label="РобоМера - главная">
      <Crosshair size={26} strokeWidth={1.8} /> РобоМера<span>.</span>
    </Link>
  )
}

export function PlatformPage() {
  useEffect(() => {
    document.title = 'РобоМера - сначала проверьте, потом внедряйте'
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])
  return (
    <div className="platform-page">
      <a className="platform-skip" href="#platform-main">
        Перейти к содержимому
      </a>
      <header className="platform-header platform-wrap">
        <Brand />
        <nav aria-label="Основная навигация">
          <a href="#platform-how">Возможности</a>
          <a href="#platform-objects">Для вашего объекта</a>
          <Link to="/catalog">
            Каталог <ArrowUpRight size={13} />
          </Link>
        </nav>
        <Link className="platform-header-cta" to="/demo">
          Открыть платформу <ArrowUpRight size={15} />
        </Link>
      </header>
      <main id="platform-main">
        <section className="platform-hero platform-wrap">
          <div className="platform-hero-heading">
            <h1>
              Сначала проверьте.
              <br />
              <span>Потом внедряйте.</span>
            </h1>
            <div>
              <p>
                Какие роботы нужны вашему объекту, сколько их должно быть и когда окупятся вложения. Проверьте решение
                на модели - до первой закупки.
              </p>
              <div className="platform-actions">
                <Link className="platform-button" to="/demo?new=1">
                  Рассчитать свой объект <ArrowUpRight size={17} />
                </Link>
                <Link className="platform-demo-link" to="/demo">
                  <Play size={13} fill="currentColor" /> Смотреть демо
                </Link>
              </div>
              <small>Можно начать без регистрации</small>
            </div>
          </div>
          <ProductStage />
          <div className="platform-hero-foot">
            <span>Единая платформа оценки роботизации</span>
            <a href="#platform-how">
              От исходных данных до решения <ArrowDown size={14} />
            </a>
          </div>
        </section>
        <section
          className="platform-workflow platform-wrap"
          id="platform-how"
          aria-labelledby="platform-workflow-title"
        >
          <div className="platform-section-heading">
            <h2 id="platform-workflow-title">
              Вся картина.
              <br />
              <span>До первого вложения.</span>
            </h2>
            <p>
              Не нужно собирать решение из таблиц, каталогов и предположений. Каждый шаг связан с предыдущим - и
              приближает вас к обоснованному выбору.
            </p>
          </div>
          <div className="platform-pipeline">
            {[
              { Icon: ScanLine, title: 'Опишите объект', text: 'Планировка, процессы и нагрузка', href: '/demo?new=1' },
              { Icon: Box, title: 'Подберите роботов', text: 'Возможности и ограничения моделей', href: '/catalog' },
              {
                Icon: Route,
                title: 'Проверьте сценарий',
                text: 'Маршруты, очереди и зарядка',
                href: '/demo/warehouse_demo_01?step=simulation',
              },
              {
                Icon: FileDown,
                title: 'Обоснуйте решение',
                text: 'Экономика и отчёт для обсуждения',
                href: '/demo/warehouse_demo_01?step=report',
              },
            ].map(({ Icon, title, text, href }, i) => (
              <Link to={href} key={title}>
                <div>
                  <span>0{i + 1}</span>
                  <Icon size={24} strokeWidth={1.3} />
                  <ArrowUpRight size={16} />
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </Link>
            ))}
          </div>
          <div className="platform-capabilities">
            <article className="platform-match">
              <div className="platform-feature-copy">
                <h3>
                  Подходящий робот.
                  <br />
                  <span>Понятно, почему.</span>
                </h3>
                <p>
                  Сравнивайте решения по задачам вашего объекта. Грузоподъёмность, габариты и ограничения - перед
                  глазами.
                </p>
                <Link to="/catalog">
                  Посмотреть каталог <ArrowUpRight size={16} />
                </Link>
              </div>
              <RobotPortrait />
            </article>
            <article className="platform-trace">
              <ShieldCheck size={27} strokeWidth={1.3} />
              <h3>
                У каждой цифры
                <br />
                есть основание.
              </h3>
              <p>Откройте исходные данные и допущения. Поймите, что изменит результат, прежде чем принимать решение.</p>
              <div className="platform-trace-lines">
                {[
                  'Параметры вашего объекта',
                  'Характеристики из каталога',
                  'Расчёт цикла и резерва',
                  'Проверка общего парка',
                ].map((line, i) => (
                  <div key={line}>
                    <span className="platform-trace-dot" />
                    <span>{line}</span>
                    {i === 3 ? <Check size={15} /> : <ArrowDown size={12} />}
                  </div>
                ))}
              </div>
              <Link to="/demo/warehouse_demo_01?step=decision">
                Разобрать расчёт <ArrowUpRight size={16} />
              </Link>
            </article>
          </div>
        </section>
        <section className="platform-industries" id="platform-objects">
          <div className="platform-wrap">
            <div className="platform-section-heading">
              <h2>
                Разные объекты.
                <br />
                <span>Один понятный подход.</span>
              </h2>
              <p>
                Важен не просто тип здания. Важны процессы внутри: что перемещается, где возникает очередь и когда
                растёт нагрузка.
              </p>
            </div>
            <div className="platform-industry-grid">
              {industries.map((item) => (
                <article key={item.id}>
                  <div className="platform-industry-title">
                    <h3>{item.name}</h3>
                  </div>
                  <IndustryModel kind={item.id} name={item.name} />
                  <h4>{item.task}</h4>
                  <p>{item.text}</p>
                  <div className="platform-industry-tags">
                    {item.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
            <div className="platform-industries-foot">
              <span>Параметры и состав роботов определяются для каждого проекта отдельно.</span>
              <Link to="/demo?new=1">
                Начать со своего объекта <ArrowRight size={17} />
              </Link>
            </div>
          </div>
        </section>
        <section className="platform-decision platform-wrap">
          <div className="platform-section-heading">
            <h2>
              Решение, которое
              <br />
              <span>можно защитить.</span>
            </h2>
            <p>
              Посмотрите, как меняются затраты при покупке, аренде роботов или сохранении текущего процесса. Возьмите
              результат на обсуждение с командой.
            </p>
          </div>
          <div className="platform-decision-grid">
            <article className="platform-economics">
              <div className="platform-economics-title">
                <h3>Экономика внедрения</h3>
                <span>Демо-склад</span>
              </div>
              <ExampleFinance />
              <div className="platform-scenarios">
                <div>
                  <span>Как сейчас</span>
                  <p>
                    Базовые затраты
                    <br />
                    на текущий процесс
                  </p>
                </div>
                <div>
                  <span>Покупка</span>
                  <p>
                    Вложения в парк
                    <br />и эксплуатация
                  </p>
                </div>
                <div>
                  <span>RaaS / лизинг</span>
                  <p>
                    Регулярные платежи
                    <br />и условия сценария
                  </p>
                </div>
              </div>
              <p className="platform-example-note">
                Числа относятся к демонстрационному складу. Для вашего объекта платформа рассчитает отдельный сценарий.
              </p>
              <Link to="/demo/warehouse_demo_01?step=decision">
                Сравнить в платформе <ArrowUpRight size={16} />
              </Link>
            </article>
            <article className="platform-report">
              <div className="platform-report-sheets" aria-hidden="true">
                <div className="platform-sheet platform-sheet-back">
                  <span>ПРИЛОЖЕНИЕ</span>
                  <b>Исходные данные</b>
                  {Array.from({ length: 6 }, (_, i) => (
                    <i key={i} />
                  ))}
                </div>
                <div className="platform-sheet platform-sheet-front">
                  <Crosshair size={22} />
                  <span>РОБОМЕРА / ОТЧЁТ</span>
                  <b>
                    Основания
                    <br />
                    для следующего
                    <br />
                    шага.
                  </b>
                  <div className="platform-sheet-rule" />
                  <p>Объект → Подбор → Имитация → Экономика</p>
                  <div className="platform-sheet-footer">
                    PDF <span>+ Excel</span>
                  </div>
                </div>
              </div>
              <div className="platform-report-copy">
                <h3>
                  Из расчёта -<br />в предметный разговор.
                </h3>
                <p>Выводы, исходные данные и ограничения модели в одном отчёте.</p>
                <Link to="/demo/warehouse_demo_01?step=report">
                  Посмотреть пример отчёта <ArrowUpRight size={16} />
                </Link>
              </div>
            </article>
          </div>
        </section>
        <section className="platform-faq platform-wrap">
          <h2>
            До старта
            <br />
            <span>
              осталось разобраться
              <br />в деталях.
            </span>
          </h2>
          <div>
            {questions.map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <span />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="platform-final">
          <div className="platform-wrap">
            <div>
              <h2>
                Ваша следующая
                <br />
                инвестиция.
                <br />
                <span>С ясной картиной.</span>
              </h2>
              <p>
                Начните с объекта. Увидьте возможности.
                <br />
                Проверьте решение до внедрения.
              </p>
              <div className="platform-actions">
                <Link className="platform-button" to="/demo?new=1">
                  Рассчитать свой объект <ArrowUpRight size={18} />
                </Link>
                <Link to="/demo">
                  Сначала посмотреть демо <ArrowRight size={16} />
                </Link>
              </div>
            </div>
            <div className="platform-final-mark" aria-hidden="true">
              <Crosshair strokeWidth={0.6} />
            </div>
          </div>
        </section>
      </main>
      <footer className="platform-footer platform-wrap">
        <Brand />
        <span>Роботизация начинается с расчёта.</span>
        <Link to="/design-lab">
          Все варианты <ArrowUpRight size={14} />
        </Link>
      </footer>
    </div>
  )
}

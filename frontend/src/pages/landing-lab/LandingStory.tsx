import { ArrowDown, ArrowUpRight, FileSpreadsheet, FileText, Plus } from 'lucide-react'
import { Link } from 'react-router'
import './story.css'

const METHOD = [
  [
    'Опишите задачу',
    'Площадь, смены, потоки и процессы. Исходные данные можно изменить — и увидеть, что изменится в решении.',
    'Объект → параметры',
  ],
  [
    'Выберите подходящих',
    'Каталог отбирается по требованиям объекта. Видны причины совпадения, ограничения и источники характеристик.',
    'Требования → подбор',
  ],
  [
    'Проверьте нагрузкой',
    'На графе планировки учитываются маршруты, очереди, зарядка и общие ресурсы. Проверенный парк возвращается в расчёт.',
    'Имитация → количество',
  ],
  [
    'Сравните экономику',
    'Как сейчас, покупка, RaaS или лизинг. Инвестиции, расходы и денежные потоки — в сопоставимых сценариях.',
    'Количество → экономика',
  ],
]
const OBJECTS = [
  ['Склад', 'warehouse_demo_01', 'Перемещение грузов, отбор, пиковые потоки', '01'],
  ['Больница', 'hospital_demo_01', 'Уборка и внутренняя доставка', '02'],
  ['Аэропорт', 'airport_demo_01', 'Багаж, уборка, транспортировка', '03'],
]
const QUESTIONS = [
  [
    'Это уже проект внедрения?',
    'Это предварительная оценка: она помогает выбрать сценарий и определить, что проверять на объекте. Обследование, коммерческое предложение и пилот остаются следующими этапами.',
  ],
  [
    'Каким цифрам можно доверять?',
    'У характеристик и нормативов есть источники, у командных допущений — явные пометки. Результат зависит от исходных данных. Внутри проекта можно изучить формулы и чувствительность экономики к изменениям.',
  ],
  [
    'Имитация проверяет все процессы?',
    'Нет. Графовая модель покрывает определённые процессы склада, доставки в больнице и багажа аэропорта. Неподдерживаемые процессы остаются на аналитическом расчёте. Успешные модельные прогоны не гарантируют результат в реальной эксплуатации.',
  ],
  [
    'Можно начать без регистрации?',
    'Да. Откройте готовый пример, изучите подбор, сравните сценарии и скачайте отчёт. В гостевом пространстве можно менять параметры своей копии.',
  ],
]

export function LandingStory() {
  return (
    <>
      <section className="lab-method lab-wrap" aria-labelledby="method-title">
        <div className="lab-section-label">
          <span>02 / От задачи к обоснованию</span>
          <ArrowDown size={17} />
        </div>
        <div className="lab-story-heading">
          <h2 id="method-title">
            Вся логика.
            <br />
            На вашей стороне.
          </h2>
          <p>
            Каждый шаг оставляет след.
            <br />
            Каждое решение можно объяснить.
          </p>
        </div>
        <ol className="lab-method-list">
          {METHOD.map(([title, text, caption], i) => (
            <li key={title}>
              <span className="lab-method-number">0{i + 1}</span>
              <h3>{title}</h3>
              <div>
                <p>{text}</p>
                <span>{caption}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="lab-objects lab-wrap" aria-labelledby="objects-title">
        <div className="lab-section-label">
          <span>03 / Начните с близкого примера</span>
          <span>Разные объекты. Один метод.</span>
        </div>
        <h2 id="objects-title" className="lab-sr-only">
          Выберите демонстрационный объект
        </h2>
        {OBJECTS.map(([title, key, text, index]) => (
          <Link to={`/demo/${key}`} className="lab-object-row" key={key}>
            <span>{index}</span>
            <h3>{title}</h3>
            <p>{text}</p>
            <ArrowUpRight strokeWidth={1} aria-hidden="true" />
          </Link>
        ))}
      </section>
      <section className="lab-report" aria-labelledby="report-title">
        <div className="lab-wrap lab-report-grid">
          <div className="lab-report-copy">
            <div className="lab-section-label">04 / Из модели — на стол решения</div>
            <h2 id="report-title">
              Обоснование,
              <br />
              которое остаётся
              <br />
              <em>у вас.</em>
            </h2>
            <p>
              Не только итоговая цифра. В отчёте — исходные данные, сценарии, экономика и результаты имитации. В Excel —
              формулы для проверки.
            </p>
            <Link to="/demo/warehouse_demo_01?step=report" className="lab-text-link">
              Открыть отчёт примера <ArrowUpRight size={20} />
            </Link>
          </div>
          <div className="lab-report-sheet" aria-label="Состав отчёта">
            <div className="lab-report-sheet-head">
              <span>РобоМера</span>
              <FileText size={23} strokeWidth={1} />
            </div>
            <span className="lab-report-kicker">Предварительная оценка</span>
            <h3>
              От объекта.
              <br />К обоснованному
              <br />
              решению.
            </h3>
            <div className="lab-report-contents">
              {[
                'Исходные данные и допущения',
                'Подбор и состав парка',
                'Сценарии и денежные потоки',
                'Результаты имитации',
              ].map((item, i) => (
                <div key={item}>
                  <span>0{i + 1}</span>
                  {item}
                </div>
              ))}
            </div>
            <div className="lab-report-formats">
              <span>
                <FileText size={14} /> PDF для команды
              </span>
              <span>
                <FileSpreadsheet size={14} /> Excel с формулами
              </span>
            </div>
          </div>
        </div>
      </section>
      <section className="lab-faq lab-wrap" aria-labelledby="faq-title">
        <h2 id="faq-title">До первого расчёта.</h2>
        <div>
          {QUESTIONS.map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <Plus size={18} />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="lab-closing">
        <div className="lab-wrap">
          <span>Решение начинается с вопроса.</span>
          <h2>
            А вашему объекту
            <br />
            нужны роботы?
          </h2>
          <Link to="/demo" className="lab-button">
            Давайте проверим <ArrowUpRight size={22} />
          </Link>
          <p>Готовые примеры · Без регистрации</p>
        </div>
      </section>
    </>
  )
}

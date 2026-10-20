import { ArrowDownToLine, ArrowUpRight, Plus } from 'lucide-react'
import { DEMO, WAREHOUSE } from './scene-state'

const questions = [
  [
    'Можно начать со своего объекта?',
    'Да. Задайте тип объекта и исходные параметры или загрузите файл. РобоМера покажет происхождение данных и недостающие условия, а затем поможет перейти к подбору и расчёту.',
  ],
  [
    'Все процессы проверяются имитацией?',
    'Нет. Имитация поддерживает складской транспорт, G2P, тягачи, служебные доставки в больнице и перевозки в аэропорту. Для неподдерживаемых процессов остаётся аналитическая оценка с явной пометкой.',
  ],
  [
    'Это готовый проект внедрения?',
    'Это предварительная оценка. Она помогает сравнить варианты и определить, что уточнить на обследовании. Для внедрения нужны проверка исходных данных, условия поставщика и пилот на объекте.',
  ],
  [
    'Что останется после расчёта?',
    'Состав парка, сравнение сценариев, экономические показатели, источники и допущения. Результаты можно выгрузить в PDF и Excel с формулами и обсудить с командой.',
  ],
]

export function ClosingSection() {
  return (
    <>
      <section className="im-report">
        <div className="im-report-copy">
          <h2>
            Решение, которое
            <br />
            можно объяснить.
          </h2>
          <p>
            От первых параметров до итогового сценария - вся цепочка остаётся в отчёте. Для обсуждения с командой,
            обследования и следующего шага.
          </p>
          <a href={`${WAREHOUSE}?step=report`} className="im-button">
            Посмотреть отчёт <ArrowDownToLine size={18} />
          </a>
          <div className="im-report-formats">
            <span>PDF для обсуждения</span>
            <span>Excel с формулами</span>
          </div>
        </div>
        <div className="im-report-preview" aria-label="Иллюстрация структуры отчёта">
          <div className="im-report-sheet im-sheet-back">
            <span>СЦЕНАРИИ И ЭКОНОМИКА</span>
            <div className="im-paper-rows">
              <p>
                Как сейчас <span>Базовый сценарий</span>
              </p>
              <p>
                Покупка <span>CAPEX + OPEX</span>
              </p>
              <p>
                RaaS <span>Услуга</span>
              </p>
              <p>
                Лизинг <span>Финансирование</span>
              </p>
            </div>
            <strong>
              Допущения.
              <br />
              Источники.
              <br />
              Следующий шаг.
            </strong>
          </div>
          <div className="im-report-sheet im-sheet-front">
            <div>
              РобоМера<span>Предварительная оценка</span>
            </div>
            <h3>
              Ваш объект.
              <br />
              Обоснованное
              <br />
              решение.
            </h3>
            <div className="im-report-diagram">
              <span>Объект</span>
              <span>Парк</span>
              <span>Экономика</span>
            </div>
            <ol>
              <li>Исходные условия</li>
              <li>Подбор и состав парка</li>
              <li>Проверка процессов</li>
              <li>Сценарии и ограничения</li>
            </ol>
            <small>Иллюстрация состава отчёта</small>
          </div>
        </div>
      </section>
      <section className="im-questions im-paper">
        <h2>
          Перед первым
          <br />
          расчётом.
        </h2>
        <div>
          {questions.map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <Plus size={19} />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="im-closing">
        <div className="im-closing-route" aria-hidden="true">
          <span />
          <i />
          <span />
          <i />
          <span />
        </div>
        <h2>
          Ваш объект.
          <br />
          <span>Ваш следующий шаг.</span>
        </h2>
        <div className="im-actions">
          <a href={DEMO} className="im-button">
            Открыть демо <ArrowUpRight size={20} />
          </a>
          <a href={`${DEMO}?new=1`} className="im-text-link">
            Рассчитать свой объект <ArrowUpRight size={17} />
          </a>
        </div>
        <p>От идеи роботизации - к предварительной оценке.</p>
      </section>
    </>
  )
}

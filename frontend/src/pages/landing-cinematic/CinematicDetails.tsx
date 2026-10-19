import { useRef } from 'react'
import { ArrowUpRight, Crosshair, Plus, FileDown } from 'lucide-react'
import { Link } from 'react-router'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { IndustryAtlas } from './IndustryAtlas'
import { FinanceStory } from './FinanceStory'
import './details.css'

export function CinematicDetails({ reduced }: { reduced: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null)
  useGSAP(
    () => {
      if (reduced) return
      const media = gsap.matchMedia()
      media.add('(min-width: 901px) and (prefers-reduced-motion: no-preference)', () => {
        gsap.from('.cinema-report-sheet-back', {
          rotate: 0,
          x: 0,
          y: 0,
          ease: 'none',
          scrollTrigger: { trigger: '.cinema-report', start: 'top 80%', end: 'center center', scrub: 0.6 },
        })
        gsap.from('.cinema-report-sheet-front', {
          rotate: 0,
          y: 35,
          ease: 'none',
          scrollTrigger: { trigger: '.cinema-report', start: 'top 80%', end: 'center center', scrub: 0.6 },
        })
      })
      return () => media.revert()
    },
    { scope: rootRef, dependencies: [reduced], revertOnUpdate: true },
  )
  return (
    <div ref={rootRef}>
      <IndustryAtlas />
      <FinanceStory />
      <section className="cinema-report">
        <div className="cinema-report-copy">
          <h2>
            Аргумент,
            <br />
            <em>а не обещание.</em>
          </h2>
          <p>
            Покажите команде не только результат, но и путь к нему. Исходные параметры, выбранный парк, сценарии и
            экономика остаются в вашем отчёте.
          </p>
          <div className="cinema-report-formats">
            <span>
              <FileDown size={18} /> PDF для обсуждения
            </span>
            <span>
              <FileDown size={18} /> Excel с формулами
            </span>
          </div>
          <Link to="/demo/warehouse_demo_01?step=report" className="cinema-link">
            Посмотреть отчёт <ArrowUpRight size={20} />
          </Link>
        </div>
        <div className="cinema-report-art" aria-label="Иллюстрация структуры отчёта">
          <div className="cinema-report-sheet cinema-report-sheet-back">
            <span>Сценарии и экономика</span>
            <div className="cinema-report-table">
              {[
                'Исходные условия',
                'Как сейчас',
                'Покупка',
                'RaaS',
                'Лизинг',
                'Денежные потоки',
                'Чувствительность',
              ].map((row) => (
                <div key={row}>
                  <span>{row}</span>
                  <span />
                  <span />
                </div>
              ))}
            </div>
            <small>Прозрачная логика сравнения</small>
          </div>
          <div className="cinema-report-sheet cinema-report-sheet-front">
            <div className="cinema-report-brand">
              <Crosshair size={19} />
              <span>РобоМера</span>
            </div>
            <h3>
              Решение.
              <br />
              Которое
              <br />
              можно
              <br />
              <em>объяснить.</em>
            </h3>
            <div className="cinema-report-lines">
              <span>Объект и допущения</span>
              <span>Роботы и процессы</span>
              <span>Сценарии и экономика</span>
              <span>Имитация и выводы</span>
            </div>
            <div className="cinema-report-bottom">
              Предварительная оценка <ArrowUpRight size={19} />
            </div>
          </div>
          <span className="cinema-report-caption">Иллюстрация состава отчёта</span>
        </div>
      </section>
      <section className="cinema-faq">
        <h2>
          Пара вопросов.
          <br />
          До первого шага.
        </h2>
        <div>
          {[
            [
              'Можно оценить свой объект?',
              'Да. Создайте проект, выберите тип объекта и процессы, задайте исходные параметры. Для собственного проекта потребуется вход; готовые примеры доступны без регистрации.',
            ],
            [
              'С чего начать, если я не инженер?',
              'Откройте близкий демонстрационный объект. Пройдите путь от параметров до решения, посмотрите объяснения, затем создайте свой проект.',
            ],
            [
              'РобоМера продаёт роботов?',
              'Платформа помогает оценить целесообразность роботизации и сравнить решения разных производителей. Она не заменяет обследование объекта и проект внедрения.',
            ],
            [
              'Результат примера повторится у меня?',
              'Нет. Количество роботов и экономика зависят от ваших процессов, планировки, нагрузки и допущений. Примеры показывают метод, а не обещают одинаковую экономию.',
            ],
            [
              'Что именно проверяет имитация?',
              'Поддержанные процессы проверяются на модели планировки с маршрутами, очередями, зарядкой и общими ресурсами. Остальные процессы остаются в аналитическом расчёте с явными ограничениями.',
            ],
          ].map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <Plus size={20} />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="cinema-closing">
        <div className="cinema-closing-orbit" aria-hidden="true">
          <Crosshair strokeWidth={0.65} />
        </div>
        <h2>
          Найдите потенциал.
          <br />
          На <em>вашем</em> объекте.
        </h2>
        <div className="cinema-closing-actions">
          <Link className="cinema-button" to="/projects">
            Оценить свой объект <ArrowUpRight />
          </Link>
          <Link className="cinema-link" to="/demo">
            Сначала посмотреть демо <ArrowUpRight size={20} />
          </Link>
        </div>
        <p>РобоМера. От идеи — к обоснованному решению.</p>
      </section>
    </div>
  )
}

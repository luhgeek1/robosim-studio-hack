import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router'
import { AnimatedFaq } from './motion'
import { useLandingMotion } from './use-landing-motion'

const QUESTIONS = [
  {
    question: 'Можно попробовать без регистрации?',
    answer:
      'Да. Откройте готовый пример или создайте свой проект: загрузите Excel, CSV или JSON, выполните подбор, расчёты и имитацию, скачайте отчёт. Гостевые данные удаляются через 24 часа. Аккаунт нужен для сохранения надолго и совместной работы.',
  },
  {
    question: 'Нужно ли разбираться в робототехнике?',
    answer:
      'Для старта достаточно знать свой объект: площадь, объём работ, число сотрудников и смен. У полей есть подсказки. Можно начать с готового демо-объекта и пройти весь путь до отчёта.',
  },
  {
    question: 'Откуда берутся роботы и данные для расчёта?',
    answer:
      'Подбор использует каталог решений и технические характеристики роботов. У нормативов есть источники и версии, допущения помечены явно. Если характеристика отсутствует, система показывает, что её нужно проверить.',
  },
  {
    question: 'Чем имитация отличается от обычной формулы?',
    answer:
      'Формула даёт стартовое число роботов. Имитация проверяет парк на плане: учитывает очереди, узкие проходы, станции и зарядку. Перебор проверяет несколько вариантов парка и повторений нагрузки. Итог применяется к экономике только после совместной проверки процессов и общих ресурсов.',
  },
  {
    question: 'Можно ли использовать результат для внедрения?',
    answer:
      'РобоМера помогает провести предварительную оценку и сравнить сценарии. Результат зависит от исходных данных и допущений. Перед внедрением нужны обследование объекта, уточнение условий с поставщиком и пилот.',
  },
  {
    question: 'Что можно выгрузить для обсуждения с командой?',
    answer:
      'PDF и Excel с экономикой, исходными параметрами, допущениями, источниками и снимками имитации. В отчёт также входит список данных, которые стоит уточнить при обследовании объекта.',
  },
]

export function QuestionsSection({ workspace }: { workspace: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  const { reveal } = useLandingMotion()
  return (
    <section className="landing-faq-section" id="questions" aria-labelledby="faq-title">
      <div className="landing-container">
        <div className="landing-section-label">
          <span>05 / ПЕРЕД ПЕРВЫМ РАСЧЁТОМ</span>
          <span>ЕСТЬ ВОПРОСЫ? РАЗБЕРЁМСЯ.</span>
        </div>
        <div className="landing-faq-layout">
          <motion.div className="landing-faq-intro" {...reveal()}>
            <span className="landing-faq-kicker">ХОРОШЕЕ РЕШЕНИЕ НАЧИНАЕТСЯ С ВОПРОСОВ</span>
            <h2 id="faq-title">
              Разберёмся
              <br />
              <span>до старта.</span>
            </h2>
            <p>Главное о платформе, данных и результате — до того, как вы создадите свой проект.</p>
            <div className="landing-faq-start">
              <p>
                Демо-объекты уже внутри.
                <br />
                <strong>Можно сразу посмотреть, как всё работает.</strong>
              </p>
              <Link to={workspace}>
                Попробовать платформу <ArrowUpRight size={18} />
              </Link>
            </div>
          </motion.div>
          <div className="landing-faq-list">
            {QUESTIONS.map(({ question, answer }, index) => (
              <AnimatedFaq
                key={question}
                question={question}
                answer={answer}
                index={index}
                open={openIndex === index}
                onToggle={() => setOpenIndex((current) => (current === index ? null : index))}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

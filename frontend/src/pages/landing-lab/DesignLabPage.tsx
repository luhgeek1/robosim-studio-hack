import { useEffect } from 'react'
import { ArrowUpRight, Crosshair } from 'lucide-react'
import { Link } from 'react-router'
import './editorial.css'
import './gallery.css'

const CONCEPTS = [
  {
    label: '01 / Кинематографический',
    name: 'Бизнес в новом движении.',
    href: '/design-lab/cinematic',
    image: 'cinematic-preview.png',
    alt: 'Оранжевый объёмный робот на светлом подиуме и крупная типографика',
    stack: 'React · GSAP · Three.js',
    description:
      'От крупного плана робота к целому объекту. Пространственная история со сменой камеры и света, интерактивными отраслями и финансовыми сценариями.',
    tools: 'Impeccable → Web Design Studio → собственная 3D-сцена + GSAP',
    fresh: false,
  },
  {
    label: '02 / Атлас возможностей',
    name: 'Увидеть потенциал.',
    href: '/design-lab/atlas/index.html',
    image: 'atlas-preview.png',
    alt: 'Альтернативная композиция лендинга Атлас возможностей',
    stack: 'OpenDesign Cloud · Local Codex',
    description:
      'Самостоятельная арт-дирекция: выразительная типографика, пространственный атлас и собственный ритм переходов. Другое прочтение того же продукта.',
    tools: 'Design Taste → Three.js → Motion Lab → локальная адаптация',
    fresh: false,
  },
  {
    label: '03 / Редакционный',
    name: 'Сначала доказательства.',
    href: '/design-lab/editorial',
    image: 'editorial-preview.png',
    alt: 'Светлый лендинг с крупной типографикой и 3D-схемой склада',
    stack: 'React · Motion · R3F',
    description:
      'Спокойное направление первого раунда. Тактильный 3D-макет и живое сравнение парка до и после имитации. Прямой путь от интереса к проверке продукта.',
    tools: 'Web Design Studio → реализация в проекте → Impeccable',
    fresh: false,
  },
  {
    label: '04 / Пространственный',
    name: 'Обосновано движением.',
    href: '/design-lab/opendesign/index.html',
    image: 'opendesign-preview.png',
    alt: 'Лендинг с интерактивной схемой и промышленной графикой',
    stack: 'OpenDesign Cloud · Local Codex',
    description:
      'Первое направление OpenDesign Cloud: подробное раскрытие продукта и интерактивная схема объекта. Сохранено как самостоятельный вариант для сравнения.',
    tools: 'Frontend Design → Motion Lab → Design Polish',
    fresh: false,
  },
]

const LATEST = [
  {
    label: 'Новая версия / Погружение',
    name: 'Изнутри объекта — к решению.',
    href: '/design-lab/immersive',
    image: 'immersive-preview.png',
    alt: 'Оранжевый робот внутри полноэкранного склада с высоким перекрытием и стеллажами',
    stack: 'React · Three.js · R3F',
    description:
      'Один склад меняет масштаб: из прохода — к общей модели, затем в интерфейс расчёта. Связная история процесса, проверенный состав парка и сравнение экономики.',
    tools: 'Архитектурная постановка · непрерывная камера · данные публичного демо',
    fresh: true,
  },
  {
    label: 'Новая версия / Платформа',
    name: 'Сначала проверьте. Потом внедряйте.',
    href: '/design-lab/platform',
    image: 'platform-preview.png',
    alt: 'Продуктовая композиция с параметрами, 3D-складом и результатом расчёта',
    stack: 'React · GSAP · Three.js',
    description:
      'Развитие действующего лендинга: компактная продуктовая сцена, все отрасли одновременно, объёмные модели и понятный путь до отчёта. Без длинных закреплённых экранов.',
    tools: 'Система РобоМеры · Impeccable · GSAP · собственная композиция',
    fresh: true,
  },
  {
    label: 'Новая версия / OpenDesign Cloud',
    name: 'Проверка перед внедрением.',
    href: '/design-lab/system/index.html',
    image: 'system-preview.png',
    alt: 'Тёмная продуктовая композиция с объёмным складом, проверками и панелью решения',
    stack: 'OpenDesign Cloud · Local Codex',
    description:
      'Система Linear адаптирована к РобоМере: компактный интерактивный склад, маршруты, очереди и зарядка, четыре финансовых сценария и состав отчёта.',
    tools: 'Linear (адаптация) → Design Taste → Three.js → Design Review',
    fresh: true,
  },
]

function ConceptCard({ concept }: { concept: (typeof CONCEPTS)[number] }) {
  return (
    <article>
      <a href={concept.href} className="lab-gallery-preview">
        <img src={'/design-lab/' + concept.image} width="1440" height="900" alt={concept.alt} />
        {concept.fresh && <strong className="lab-gallery-new">Новая итерация</strong>}
        <span>
          Открыть вариант <ArrowUpRight size={20} />
        </span>
      </a>
      <div className="lab-gallery-title">
        <span>{concept.label}</span>
        <span>{concept.stack}</span>
      </div>
      <h2>{concept.name}</h2>
      <p>{concept.description}</p>
      <div className="lab-gallery-tools">{concept.tools}</div>
    </article>
  )
}

export function DesignLabPage() {
  useEffect(() => {
    document.title = 'РобоМера — новая итерация лендинга'
  }, [])
  return (
    <div className="lab-editorial lab-gallery">
      <header className="lab-header lab-wrap">
        <Link to="/" className="lab-brand">
          <Crosshair size={28} strokeWidth={1.5} />
          РобоМера
        </Link>
        <span className="lab-gallery-label">Дизайн-исследование / 20.10.2026</span>
      </header>
      <main className="lab-wrap">
        <div className="lab-gallery-intro">
          <p>РобоМера / Новая итерация</p>
          <h1>
            От эффектной сцены.
            <br />
            <span>К цельному продукту.</span>
          </h1>
          <div>
            Новые версии развивают сильные стороны действующего лендинга: ясную подачу, плотную композицию и наглядность
            продукта. Предыдущие эксперименты сохранены ниже для сравнения.
          </div>
        </div>
        <div className="lab-gallery-grid lab-gallery-latest">
          {LATEST.map((concept) => (
            <ConceptCard key={concept.href} concept={concept} />
          ))}
        </div>
        <h2 className="lab-gallery-archive-title">Предыдущие направления</h2>
        <div className="lab-gallery-grid">
          {CONCEPTS.map((concept) => (
            <ConceptCard key={concept.href} concept={concept} />
          ))}
        </div>
        <aside className="lab-gallery-reference">
          <div>
            <h2>Для сравнения — текущая версия</h2>
            <p>Оригинальный лендинг доступен рядом для сравнения со всеми семью концепциями.</p>
          </div>
          <Link to="/" className="lab-header-action">
            Открыть исходный <ArrowUpRight size={18} />
          </Link>
        </aside>
      </main>
      <footer className="lab-footer lab-wrap">
        <span>РобоМера · Галерея концепций</span>
        <span>Самостоятельная платформа. Ваш объект. Ваш сценарий.</span>
      </footer>
    </div>
  )
}

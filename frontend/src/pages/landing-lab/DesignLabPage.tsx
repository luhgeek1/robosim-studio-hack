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
    fresh: true,
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
    fresh: true,
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

export function DesignLabPage() {
  useEffect(() => {
    document.title = 'РобоМера — четыре направления лендинга'
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
          <p>Один продукт. Четыре направления.</p>
          <h1>
            Почувствовать движение.
            <br />
            <span>Увидеть возможности.</span>
          </h1>
          <div>
            Две новые визуальные истории и два варианта первого раунда. Откройте каждый на весь экран, прокрутите до
            конца и попробуйте интерактивные блоки.
          </div>
        </div>
        <div className="lab-gallery-grid">
          {CONCEPTS.map((concept) => (
            <article key={concept.href}>
              <a href={concept.href} className="lab-gallery-preview">
                <img src={'/design-lab/' + concept.image} width="1440" height="900" alt={concept.alt} />
                {concept.fresh && <strong className="lab-gallery-new">Новое направление</strong>}
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
          ))}
        </div>
        <aside className="lab-gallery-reference">
          <div>
            <h2>Для сравнения — текущая версия</h2>
            <p>Оригинальный лендинг доступен рядом. Новые варианты пока не опубликованы.</p>
          </div>
          <Link to="/" className="lab-header-action">
            Открыть исходный <ArrowUpRight size={18} />
          </Link>
        </aside>
      </main>
      <footer className="lab-footer lab-wrap">
        <span>РобоМера · Локальные концепции</span>
        <span>Самостоятельная платформа. Ваш объект. Ваш сценарий.</span>
      </footer>
    </div>
  )
}

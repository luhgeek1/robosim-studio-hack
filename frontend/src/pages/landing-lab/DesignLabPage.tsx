import { useEffect } from 'react'
import { ArrowUpRight, Crosshair } from 'lucide-react'
import { Link } from 'react-router'
import './editorial.css'
import './gallery.css'

export function DesignLabPage() {
  useEffect(() => {
    document.title = 'РобоМера — два направления лендинга'
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
          <p>Один продукт. Два взгляда.</p>
          <h1>
            Сначала впечатление.
            <br />
            <span>Затем — доказательства.</span>
          </h1>
          <div>
            Два самостоятельных лендинга в цветах РобоМеры. Откройте каждый, прокрутите до конца и попробуйте
            интерактивные блоки.
          </div>
        </div>
        <div className="lab-gallery-grid">
          <article>
            <Link to="/design-lab/editorial" className="lab-gallery-preview">
              <img
                src="/design-lab/editorial-preview.png"
                width="1440"
                height="900"
                alt="Светлый лендинг с крупной типографикой и 3D-схемой склада"
              />
              <span>
                Открыть вариант <ArrowUpRight size={20} />
              </span>
            </Link>
            <div className="lab-gallery-title">
              <span>01 / Редакционный</span>
              <span>React · Motion · R3F</span>
            </div>
            <h2>Сначала доказательства.</h2>
            <p>
              Крупная типографика, тактильный 3D-макет и живое сравнение парка до и после имитации. Наиболее прямой путь
              от интереса к проверке продукта.
            </p>
            <div className="lab-gallery-tools">Web Design Studio → реализация в проекте → Impeccable</div>
          </article>
          <article>
            <a href="/design-lab/opendesign/index.html" className="lab-gallery-preview">
              <img
                src="/design-lab/opendesign-preview.png"
                width="1440"
                height="900"
                alt="Альтернативный лендинг с интерактивной схемой и промышленной графикой"
              />
              <span>
                Открыть вариант <ArrowUpRight size={20} />
              </span>
            </a>
            <div className="lab-gallery-title">
              <span>02 / Пространственный</span>
              <span>OpenDesign Cloud · Local Codex</span>
            </div>
            <h2>Обосновано движением.</h2>
            <p>
              Другой визуальный ритм и интерактивная схема объекта. Отдельная генерация по продуктовому брифу, затем
              проверка и адаптация для локального просмотра.
            </p>
            <div className="lab-gallery-tools">Frontend Design → Motion Lab → Design Polish</div>
          </article>
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
        <span>Движение объясняет продукт. Данные подтверждают результат.</span>
      </footer>
    </div>
  )
}

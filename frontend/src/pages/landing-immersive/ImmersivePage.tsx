import { useEffect } from 'react'
import { ArrowUpRight, Crosshair } from 'lucide-react'
import { ImmersiveStory } from './ImmersiveStory'
import { ProcessSection } from './ProcessSection'
import { EvidenceSection } from './EvidenceSection'
import { ClosingSection } from './ClosingSection'
import { DEMO } from './scene-state'
import './immersive.css'
import './story.css'
import './product-frame.css'
import './story-responsive.css'
import './sections.css'
import './evidence.css'
import './finance.css'
import './closing.css'
import './sections-responsive.css'
import './static.css'

export function ImmersivePage() {
  useEffect(() => {
    document.title = 'РобоМера - роботизация начинается с расчёта'
  }, [])
  return (
    <div className="immersive">
      <a className="im-skip" href="#immersive-main">
        Перейти к содержимому
      </a>
      <header className="im-header">
        <a href="/design-lab" className="im-brand" aria-label="РобоМера - галерея вариантов">
          <Crosshair strokeWidth={1.5} /> РобоМера<span>.</span>
        </a>
        <nav aria-label="Основная навигация">
          <a href="#immersive-model">Как это работает</a>
          <a href="#immersive-process">Для вашего объекта</a>
          <a href="https://prooood.ru/catalog">
            Каталог <ArrowUpRight size={13} />
          </a>
        </nav>
        <a href={DEMO} className="im-header-action">
          Открыть демо <ArrowUpRight size={16} />
        </a>
      </header>
      <main id="immersive-main">
        <ImmersiveStory />
        <ProcessSection />
        <EvidenceSection />
        <ClosingSection />
      </main>
      <footer className="im-footer">
        <a href="/design-lab" className="im-brand">
          <Crosshair /> РобоМера.
        </a>
        <span>Предварительная оценка роботизации</span>
        <a href={`${DEMO}?new=1`}>
          Ваш объект <ArrowUpRight size={16} />
        </a>
      </footer>
    </div>
  )
}

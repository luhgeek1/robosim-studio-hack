import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { ArrowDown, ArrowRight, ArrowUpRight, Crosshair, MoveUpRight, Pause, Play } from 'lucide-react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { SceneBoundary } from '@/shared/ui/boundary'
import { DemoEvidence } from '../landing-lab/DemoEvidence'
import { CinematicDetails } from './CinematicDetails'
import type { SceneSignal } from './scene-state'
import './cinematic.css'

gsap.registerPlugin(ScrollTrigger, useGSAP)
const CinematicScene = lazy(() => import('./CinematicScene'))
const subscribeMotion = (callback: () => void) => {
  const media = matchMedia('(prefers-reduced-motion: reduce)')
  media.addEventListener('change', callback)
  return () => media.removeEventListener('change', callback)
}
const readMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

function SceneFailure({ onFailure }: { onFailure: () => void }) {
  useEffect(onFailure, [onFailure])
  return null
}

export function CinematicPage() {
  const rootRef = useRef<HTMLDivElement>(null)
  const storyRef = useRef<HTMLElement>(null)
  const signalRef = useRef<SceneSignal>({ progress: 0, yaw: 0 })
  const invalidateRef = useRef<(() => void) | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [still, setStill] = useState(false)
  const osReduced = useSyncExternalStore(subscribeMotion, readMotion, () => true)
  const reduced = osReduced || still || failed
  const onReady = useCallback(() => setReady(true), [])
  const onFailure = useCallback(() => setFailed(true), [])
  useEffect(() => {
    document.title = 'РобоМера — бизнес в новом движении'
  }, [])
  useEffect(() => {
    if (ready || failed) return
    const timer = setTimeout(onFailure, 15000)
    return () => clearTimeout(timer)
  }, [ready, failed, onFailure])
  useGSAP(
    () => {
      if (!ready || reduced) {
        signalRef.current.progress = reduced ? 0.82 : 0
        invalidateRef.current?.()
        return
      }
      const story = storyRef.current
      if (!story) return
      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: story,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.65,
          invalidateOnRefresh: true,
        },
      })
      timeline.to(
        signalRef.current,
        { progress: 1, duration: 1, ease: 'none', onUpdate: () => invalidateRef.current?.() },
        0,
      )
      timeline.to('.cinema-stage', { backgroundColor: '#172b25', duration: 0.18, ease: 'none' }, 0.54)
      timeline.to(story, { '--scene-ink': '#eeefe4', duration: 0.14, ease: 'none' }, 0.55)
      timeline.to('.cinema-progress-fill', { scaleY: 1, duration: 1, ease: 'none' }, 0)
      gsap.from('.cinema-hero h1 span', { yPercent: 25, opacity: 0.7, duration: 1, stagger: 0.11, ease: 'expo.out' })
      let active = true
      document.fonts.ready.then(() => {
        if (active) ScrollTrigger.refresh()
      })
      return () => {
        active = false
      }
    },
    { scope: rootRef, dependencies: [ready, reduced], revertOnUpdate: true },
  )
  return (
    <div ref={rootRef} className="cinema-page" data-motion={reduced ? 'reduced' : 'full'}>
      <a className="cinema-skip" href="#cinema-content">
        К содержимому
      </a>
      <header className="cinema-header">
        <Link to="/design-lab" className="cinema-logo" aria-label="РобоМера — все варианты">
          <Crosshair strokeWidth={1.5} />
          РобоМера<span>®</span>
        </Link>
        <nav aria-label="Основная навигация">
          <a href="#cinema-method">Как это работает</a>
          <a href="#cinema-use">Для вашего объекта</a>
          <Link to="/catalog">Каталог</Link>
        </nav>
        <Link to="/demo" className="cinema-header-cta">
          В платформу <ArrowUpRight size={18} />
        </Link>
      </header>
      <main id="cinema-content">
        <section ref={storyRef} className="cinema-story" data-ready={ready && !failed ? 'true' : 'false'}>
          <div className="cinema-stage">
            <div
              className="cinema-scene"
              data-renderer={failed ? 'fallback' : ready ? 'ready' : 'loading'}
              onPointerMove={(event) => {
                if (reduced || !matchMedia('(hover: hover) and (pointer: fine)').matches) return
                signalRef.current.yaw = (event.clientX / innerWidth - 0.5) * 0.18
                invalidateRef.current?.()
              }}
              onPointerLeave={() => {
                signalRef.current.yaw = 0
                invalidateRef.current?.()
              }}
            >
              {(!ready || failed) && (
                <img
                  className="cinema-poster"
                  src="/design-lab/cinematic/robot-poster.png"
                  alt="Объёмная модель мобильного робота"
                />
              )}
              {!failed && (
                <SceneBoundary fallback={<SceneFailure onFailure={onFailure} />}>
                  <Suspense fallback={null}>
                    <CinematicScene
                      signalRef={signalRef}
                      invalidateRef={invalidateRef}
                      onReady={onReady}
                      onFailure={onFailure}
                    />
                  </Suspense>
                </SceneBoundary>
              )}
            </div>
            <div className="cinema-stage-bottom">
              <span>
                {failed ? 'Статичная схема' : 'Пространственная история'}
                <small>Иллюстрация возможностей</small>
              </span>
              <button
                onClick={() => setStill(!still)}
                disabled={osReduced || failed}
                aria-pressed={still || osReduced}
                aria-label={still ? 'Включить движение' : 'Уменьшить движение'}
              >
                {reduced ? <Play size={14} /> : <Pause size={14} />}
              </button>
            </div>
            <div className="cinema-progress" aria-hidden="true">
              <span>Объект</span>
              <div>
                <i className="cinema-progress-fill" />
              </div>
              <span>Решение</span>
            </div>
          </div>
          <div className="cinema-chapters">
            <div className="cinema-chapter cinema-hero">
              <div className="cinema-chapter-copy">
                <h1>
                  <span>Бизнес</span>
                  <span>в новом</span>
                  <span>
                    <em>движении.</em>
                  </span>
                </h1>
                <p>Оцените роботизацию своего объекта: от подходящих роботов до экономики внедрения.</p>
                <Link to="/projects" className="cinema-button">
                  Оценить свой объект <ArrowUpRight size={22} />
                </Link>
                <Link to="/demo" className="cinema-hero-note">
                  Исследовать демо без регистрации <ArrowRight size={14} />
                </Link>
              </div>
              <a className="cinema-scroll" href="#cinema-method">
                <span>
                  <ArrowDown size={19} />
                </span>
                Прокрутите. И увидите целую систему.
              </a>
              <div className="cinema-hero-side" aria-hidden="true">
                Движение имеет значение.
              </div>
            </div>
            <article className="cinema-chapter" id="cinema-method">
              <div className="cinema-chapter-copy">
                <span className="cinema-chapter-index" aria-label="Первый шаг">
                  01
                </span>
                <h2>
                  Сначала —<br />
                  ваш объект.
                </h2>
                <p>
                  Каждый проход, каждая смена, каждый поток. РобоМера собирает условия в модель, в которой роботы должны
                  работать.
                </p>
                <div className="cinema-chapter-tags">
                  <span>Планировка</span>
                  <span>Процессы</span>
                  <span>Нагрузка</span>
                </div>
              </div>
            </article>
            <article className="cinema-chapter">
              <div className="cinema-chapter-copy">
                <span className="cinema-chapter-index" aria-label="Второй шаг">
                  02
                </span>
                <h2>
                  Потом —<br />
                  его ритм.
                </h2>
                <p>
                  Один робот на пустом полу и целый парк в час пик — разные задачи. Маршруты, очереди и зарядка
                  становятся частью решения.
                </p>
                <div className="cinema-chapter-tags">
                  <span>Общий парк</span>
                  <span>Общие ресурсы</span>
                </div>
              </div>
            </article>
            <article className="cinema-chapter">
              <div className="cinema-chapter-copy">
                <span className="cinema-chapter-index" aria-label="Третий шаг">
                  03
                </span>
                <h2>
                  В итоге —<br />
                  <em>ясность.</em>
                </h2>
                <p>
                  Какие роботы подходят. Сколько их нужно. Что выгоднее: купить, взять в лизинг или платить за сервис.
                </p>
                <a className="cinema-link" href="#cinema-evidence">
                  Посмотреть эффект <ArrowRight size={21} />
                </a>
              </div>
            </article>
          </div>
        </section>
        <section className="cinema-manifesto">
          <span className="cinema-orbit-mark" aria-hidden="true">
            <Crosshair strokeWidth={0.7} />
          </span>
          <h2>
            У роботов — работа.
            <br />У вас — <em>полная картина.</em>
          </h2>
          <p>От первой идеи до решения, которое можно объяснить команде. В одной платформе.</p>
          <MoveUpRight size={56} strokeWidth={1} />
        </section>
        <div id="cinema-evidence" className="cinema-evidence">
          <DemoEvidence />
        </div>
        <CinematicDetails reduced={reduced} />
      </main>
      <footer className="cinema-footer">
        <Link to="/design-lab" className="cinema-logo">
          <Crosshair strokeWidth={1.5} />
          РобоМера
        </Link>
        <span>Предварительная оценка роботизации</span>
        <Link to="/design-lab">
          Все варианты <ArrowUpRight size={18} />
        </Link>
      </footer>
    </div>
  )
}

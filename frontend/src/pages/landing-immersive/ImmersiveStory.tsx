import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUpRight } from 'lucide-react'
import { SceneBoundary } from '@/shared/ui/boundary'
import { ProductFrame } from './ProductFrame'
import { DEMO, type ImmersiveSignal } from './scene-state'
import { useCompactScene, useImmersiveMotion, useReducedScene } from './use-immersive-motion'

const ImmersiveScene = lazy(() => import('./ImmersiveScene'))

function SceneFailure({ onFailure }: { onFailure: () => void }) {
  useEffect(onFailure, [onFailure])
  return null
}

function SolutionHeading() {
  return (
    <article className="im-chapter im-solution" id="immersive-solution">
      <h2>
        Теперь это -<br className="im-mobile-break" /> основа решения.
      </h2>
      <p>Модель уточняет парк. Парк меняет экономику.</p>
    </article>
  )
}

export function ImmersiveStory() {
  const rootRef = useRef<HTMLElement>(null)
  const signalRef = useRef<ImmersiveSignal>({ progress: 0, compact: false })
  const invalidateRef = useRef<(() => void) | null>(null)
  const reduced = useReducedScene()
  const compact = useCompactScene()
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const onReady = useCallback(() => setReady(true), [])
  const onFailure = useCallback(() => setFailed(true), [])
  const staticView = compact || reduced || failed
  useEffect(() => {
    if (ready || staticView) return
    const timeout = window.setTimeout(onFailure, 12000)
    return () => clearTimeout(timeout)
  }, [ready, staticView, onFailure])
  useImmersiveMotion(rootRef, signalRef, invalidateRef, ready && !staticView)
  return (
    <section
      ref={rootRef}
      className={`im-story ${staticView ? 'im-story-static' : ''}`}
      data-renderer={staticView ? 'static' : ready ? 'ready' : 'loading'}
      aria-label="Изнутри объекта - к решению"
    >
      <div className="im-stage">
        {!staticView && <ProductFrame initiallyHidden />}
        <div className="im-world" aria-label="Архитектурная иллюстрация склада с мобильным роботом">
          <img
            className="im-scene-poster"
            src="/design-lab/immersive/warehouse.jpg"
            alt="Оранжевый робот на полу складского прохода под металлическими перекрытиями"
          />
          {!staticView && (
            <SceneBoundary fallback={<SceneFailure onFailure={onFailure} />}>
              <Suspense fallback={null}>
                <ImmersiveScene
                  signalRef={signalRef}
                  invalidateRef={invalidateRef}
                  onReady={onReady}
                  onFailure={onFailure}
                />
              </Suspense>
            </SceneBoundary>
          )}
        </div>
        <div className="im-scene-shade" />
        <div className="im-scene-caption">
          <span>Склад / пространственная иллюстрация</span>
          <span>Объект → модель → решение</span>
        </div>
      </div>
      <div className="im-chapters">
        <div className="im-chapter im-hero" id="immersive-top">
          <div className="im-hero-copy">
            <h1>
              Роботизация
              <br />
              начинается
              <br />с <em>расчёта.</em>
            </h1>
            <p>Подберите роботов, проверьте поддерживаемые процессы в симуляции и сравните сценарии внедрения.</p>
            <div className="im-actions">
              <a href={DEMO} className="im-button">
                Открыть демо <ArrowUpRight size={20} />
              </a>
              <a href={`${DEMO}?new=1`} className="im-text-link">
                Рассчитать свой объект <ArrowUpRight size={16} />
              </a>
            </div>
            <span className="im-hero-note">Предварительная оценка. Демо без регистрации.</span>
          </div>
          <a href="#immersive-model" className="im-scroll-link">
            <ArrowDown size={17} /> Взглянуть на объект целиком
          </a>
          <div className="im-robot-label" aria-hidden="true">
            <span /> AMR / мобильный робот
          </div>
        </div>
        <article className="im-chapter im-model" id="immersive-model">
          <div className="im-model-copy">
            <h2>
              Увидеть
              <br /> все связи.
            </h2>
            <p>
              У робота есть маршрут.
              <br />У маршрута - ограничения.
            </p>
            <p className="im-secondary">
              Ширина прохода, очередь на загрузку, время зарядки. Из этих условий складывается работа всего парка.
            </p>
            <div className="im-route-legend">
              <span /> Маршрут <span /> Точки обслуживания
            </div>
          </div>
          <img
            className="im-static-model"
            src="/design-lab/immersive/model.jpg"
            alt="Тот же склад сверху: стеллажи, проходы и оранжевый маршрут"
            loading="lazy"
          />
        </article>
        <SolutionHeading />
        {staticView && (
          <div className="im-static-product">
            <ProductFrame />
            <img
              src="/design-lab/immersive/model.jpg"
              alt="Модель складских маршрутов внутри интерфейса оценки"
              loading="lazy"
            />
          </div>
        )}
      </div>
    </section>
  )
}

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CirclePause,
  CirclePlay,
  Layers3,
  Maximize2,
  Route,
  ScanLine,
  Warehouse,
} from 'lucide-react'
import { Link } from 'react-router'
import { useReducedMotion } from 'framer-motion'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SceneBoundary } from '@/shared/ui/boundary'
import { useSession } from '@/entities/session'
import { useDemo } from '@/entities/demo/api'
import { formatNumber, formatRub, formatYears } from '@/shared/lib/format'
import type { StageMotion } from './PlatformScene'

gsap.registerPlugin(useGSAP, ScrollTrigger)
const PlatformScene = lazy(() => import('./PlatformScene'))

function usePlatformExample() {
  const { status } = useSession()
  const query = useDemo('warehouse_demo_01', { timeoutMs: 8000, enabled: status !== 'restoring' })
  const snapshot = query.data && !('status' in query.data) ? query.data : undefined
  const sweep = snapshot?.sweep
  const verified = sweep?.applied && sweep.joint_validation?.status === 'passed'
  return { query, before: sweep?.by_formula, after: verified ? sweep.by_simulation : undefined }
}

function ScenePoster({ onFallback }: { onFallback?: () => void }) {
  useEffect(() => {
    onFallback?.()
  }, [onFallback])
  return (
    <img
      className="platform-scene-poster"
      src="/design-lab/atlas/assets/visuals/warehouse.svg"
      alt="Схема склада с зонами хранения и маршрутами"
    />
  )
}

export function ProductStage() {
  const root = useRef<HTMLDivElement>(null)
  const motion = useRef<StageMotion>({ progress: 0, plan: false })
  const reduced = useReducedMotion()
  const [paused, setPaused] = useState(false)
  const [plan, setPlan] = useState(false)
  const [visible, setVisible] = useState(true)
  const [failed, setFailed] = useState(false)
  const [pageVisible, setPageVisible] = useState(!document.hidden)
  const onFailure = useCallback(() => setFailed(true), [])
  const { query, before, after } = usePlatformExample()
  const playing = !paused && !reduced && visible && pageVisible
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    if (root.current) observer.observe(root.current)
    const visibility = () => setPageVisible(!document.hidden)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])
  useGSAP(
    () => {
      if (reduced || !root.current) return
      gsap.to(motion.current, {
        progress: 1,
        ease: 'none',
        scrollTrigger: { trigger: root.current, start: 'top 30%', end: 'bottom top', scrub: 0.6 },
      })
    },
    { scope: root, dependencies: [reduced], revertOnUpdate: true },
  )
  return (
    <div className="platform-stage" ref={root}>
      <div className="platform-stage-bar">
        <span>
          <Warehouse size={15} /> Демонстрационный склад <span className="platform-stage-tag">Пример</span>
        </span>
        <div>
          <span className="platform-stage-dot" /> Модель объекта
        </div>
      </div>
      <div className="platform-stage-body">
        <aside className="platform-stage-input">
          <span className="platform-mini-label">Исходные данные</span>
          <strong>
            Ваш объект.
            <br />
            Ваши условия.
          </strong>
          <dl>
            <div>
              <dt>Объект</dt>
              <dd>Склад</dd>
            </div>
            <div>
              <dt>Площадь</dt>
              <dd>
                20 000 <small>м²</small>
              </dd>
            </div>
            <div>
              <dt>Процесс</dt>
              <dd>Перемещение паллет</dd>
            </div>
          </dl>
          <div className="platform-stage-layers">
            <span>
              <Layers3 size={14} /> Планировка
            </span>
            <span>
              <Route size={14} /> Маршруты
            </span>
            <span>
              <ScanLine size={14} /> Зоны и ограничения
            </span>
          </div>
          <Link to="/demo?new=1">
            Задать свои <ArrowUpRight size={16} />
          </Link>
        </aside>
        <div className="platform-stage-world">
          <div className="platform-world-caption">
            <span>Цифровая модель</span>
            <span>Иллюстрация процессов</span>
          </div>
          <SceneBoundary fallback={<ScenePoster onFallback={onFailure} />}>
            {failed ? (
              <ScenePoster />
            ) : (
              <Suspense fallback={<ScenePoster />}>
                <PlatformScene motion={motion} plan={plan} playing={playing} onFailure={onFailure} />
              </Suspense>
            )}
          </SceneBoundary>
          <div className="platform-world-note">
            <span /> Приёмка <ArrowRight size={12} /> Хранение <ArrowRight size={12} /> Отгрузка
          </div>
          {!failed && (
            <div className="platform-world-controls">
              <button
                aria-pressed={plan}
                onClick={() => {
                  motion.current.plan = !plan
                  setPlan(!plan)
                }}
              >
                <Maximize2 size={14} /> {plan ? 'Перспектива' : 'Вид сверху'}
              </button>
              <button
                aria-label={paused ? 'Включить движение модели' : 'Приостановить движение модели'}
                aria-pressed={paused}
                onClick={() => setPaused(!paused)}
              >
                {paused ? <CirclePlay size={17} /> : <CirclePause size={17} />}
              </button>
            </div>
          )}
        </div>
        <aside className="platform-stage-result">
          <span className="platform-mini-label">Результат примера</span>
          <h2>
            От оценки —<br />к проверке.
          </h2>
          {before && after ? (
            <>
              <div className="platform-fleet-pair">
                <div>
                  <span>По формуле</span>
                  <strong>{formatNumber(before.total)}</strong>
                </div>
                <ArrowRight size={22} />
                <div>
                  <span>После имитации</span>
                  <strong>{formatNumber(after.total)}</strong>
                </div>
              </div>
              <span className="platform-fleet-unit">роботов, включая резерв</span>
              <div className="platform-mini-fleet" aria-hidden="true">
                {Array.from({ length: Math.min(before.total, 40) }, (_, i) => (
                  <i key={i} className={i >= after.total ? 'is-removed' : ''} />
                ))}
              </div>
              <p className="platform-stage-passed">
                <Check size={15} /> Парк проверен в имитации
              </p>
            </>
          ) : (
            <p className="platform-stage-pending">
              {query.isError
                ? 'Откройте пример, чтобы посмотреть расчёт парка.'
                : 'Загружаем результат демонстрационного склада…'}
            </p>
          )}
          <p>На другом объекте результат будет другим. Платформа рассчитает его по вашим данным.</p>
          <Link to="/demo">
            Проверить на примере <ArrowUpRight size={16} />
          </Link>
        </aside>
      </div>
      <div className="platform-stage-bottom">
        <span>Роботы подобраны под процессы</span>
        <span>Очереди и зарядка учтены</span>
        <span>Экономика пересчитана</span>
      </div>
    </div>
  )
}

export function ExampleFinance() {
  const { after } = usePlatformExample()
  return (
    <div className="platform-finance-numbers">
      <div>
        <span>Инвестиции в покупку</span>
        <strong>{after ? formatRub(after.capex_rub) : 'Расчёт в демо'}</strong>
      </div>
      <div>
        <span>Простая окупаемость</span>
        <strong>{after ? formatYears(after.payback_years) : 'Расчёт в демо'}</strong>
      </div>
    </div>
  )
}

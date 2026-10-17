import { useEffect, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import { ArrowRight, ArrowUpRight, Check, CircleDot, LoaderCircle } from 'lucide-react'
import { useDemo, useDemoList, useDemoWhatIf, type DemoChanges, type DemoSnapshot } from '@/entities/demo/api'
import { useSession } from '@/entities/session'
import { ErrorBlock } from '@/shared/ui/states'
import { problemText } from '@/shared/api/problem'
import { WhatIfPanel, INITIAL } from './WhatIfPanel'
import { Decision } from './Decision'
import { Evidence } from './Evidence'
import { Simulation } from './Simulation'
import { Report } from './Report'
import './demo.css'

const STEPS = [
  ['decision', 'Решение'],
  ['evidence', 'Почему эти роботы'],
  ['simulation', 'Имитация'],
  ['report', 'Отчёт и мой проект'],
] as const

export function DemoPage() {
  const { demoKey } = useParams()
  const { status } = useSession()
  const examples = useDemoList()
  const snapshot = useDemo(demoKey ?? 'warehouse_demo_01')
  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Попробовать без регистрации — РобоМера'
    window.scrollTo(0, 0)
    return () => {
      document.title = previousTitle
    }
  }, [demoKey])
  if (!demoKey) return <Navigate to="/demo/warehouse_demo_01" replace />
  return (
    <div className="demo-page">
      <header className="demo-header">
        <Link to="/" className="demo-brand">
          <CircleDot size={25} />
          РобоМера<span>.</span>
        </Link>
        <span className="demo-header-label">Открытая демонстрация</span>
        <nav>
          <Link to="/catalog">Каталог</Link>
          <Link to={status === 'authenticated' ? '/app' : '/login'} state={{ from: `/demo/${demoKey}?step=report` }}>
            {status === 'authenticated' ? 'Мой кабинет' : 'Войти'}
            <ArrowUpRight size={15} />
          </Link>
        </nav>
      </header>
      <main className="demo-container">
        <div className="demo-intro">
          <div className="demo-eyebrow">
            <span className="demo-dot" /> БЕЗ РЕГИСТРАЦИИ · ВСЕ ЭТАПЫ ОТКРЫТЫ
          </div>
          <h1>Решение, которое можно проверить.</h1>
          <p>
            Готовый объект → подбор роботов → экономика → проверка имитацией → отчёт. Меняйте условия и смотрите, что
            произойдёт.
          </p>
        </div>
        <div className="demo-examples" aria-label="Выберите объект">
          {examples.data?.map((item, i) => (
            <Link
              key={item.key}
              to={`/demo/${item.key}`}
              className={item.key === demoKey ? 'is-active' : ''}
              aria-current={item.key === demoKey ? 'page' : undefined}
            >
              <small>
                {i === 0 ? 'НАЧНИТЕ ЗДЕСЬ' : item.object_type === 'warehouse' ? 'НЕСКОЛЬКО ПРОЦЕССОВ' : 'ДРУГОЙ ОБЪЕКТ'}
              </small>
              <span>
                {item.name}
                <ArrowUpRight size={16} />
              </span>
            </Link>
          ))}
        </div>
        {snapshot.isError ? (
          <ErrorBlock error={snapshot.error} onRetry={() => snapshot.refetch()} />
        ) : !snapshot.data || 'status' in snapshot.data ? (
          <section className="demo-panel demo-loading" role="status">
            <LoaderCircle className="animate-spin" />
            <h2>{snapshot.data && 'status' in snapshot.data ? snapshot.data.stage : 'Открываем пример…'}</h2>
            <p>
              Готовим проверенный расчёт для текущей версии каталога и нормативов. После первого открытия он доступен
              сразу.
            </p>
            <button className="demo-text-button" onClick={() => void snapshot.refetch()}>
              Проверить готовность
            </button>
            <Link to="/catalog">Пока можно посмотреть каталог →</Link>
          </section>
        ) : (
          <Journey
            key={`${demoKey}:${snapshot.data.revision}`}
            demo={snapshot.data}
            refresh={() => void snapshot.refetch()}
          />
        )}
        <footer className="demo-footer">
          Экспресс-оценка роботизации. Источники и допущения открыты; внедрение требует обследования объекта.
          <Link to="/">
            О платформе <ArrowUpRight size={14} />
          </Link>
        </footer>
      </main>
    </div>
  )
}

function Journey({ demo, refresh }: { demo: DemoSnapshot; refresh: () => void }) {
  const [search, setSearch] = useSearchParams()
  const step = STEPS.find(([id]) => id === search.get('step'))?.[0] ?? 'decision'
  const [changes, setChanges] = useState<DemoChanges>(INITIAL)
  const [applied, setApplied] = useState<DemoChanges>(INITIAL)
  useEffect(() => {
    const timer = setTimeout(() => setApplied(changes), 350)
    return () => clearTimeout(timer)
  }, [changes])
  const changed = JSON.stringify(applied) !== JSON.stringify(INITIAL)
  const result = useDemoWhatIf(demo, applied, changed)
  const base = demo.calculations.find((c) => c.scenario_id === demo.primary_scenario_id)!
  const preview = changed && !result.isError ? result.data : undefined
  const current = preview?.calculation ?? base
  const pending = JSON.stringify(changes) !== JSON.stringify(applied) || (changed && result.isFetching)
  const currentIndex = STEPS.findIndex(([id]) => id === step)
  return (
    <>
      <div className="demo-context">
        <h2>{demo.demo.name}</h2>
        <p>{demo.demo.description}</p>
      </div>
      <nav className="demo-steps" aria-label="Путь по примеру">
        {STEPS.map(([id, label], i) => (
          <button
            key={id}
            className={step === id ? 'is-active' : ''}
            aria-current={step === id ? 'step' : undefined}
            onClick={() => setSearch({ step: id }, { replace: true })}
          >
            <span>{i + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      {step === 'decision' && (
        <div className="demo-workspace">
          <div>
            {result.isError && changed && (
              <div className="demo-notice" role="alert">
                Новые условия не рассчитаны: {problemText(result.error)}. Ниже исходный пример.{' '}
                <button onClick={() => void result.refetch()}>Повторить</button> ·{' '}
                <button onClick={refresh}>Обновить исходный пример</button>
              </div>
            )}
            <Decision demo={demo} current={current} result={preview} changed={!!preview} pending={pending} />
          </div>
          <WhatIfPanel
            value={changes}
            onChange={setChanges}
            horizon={base.metrics.horizon_years}
            cashShare={(base.metrics.labor_cash_realization_pct ?? 100) / 100}
            pending={pending}
          />
        </div>
      )}
      {step !== 'decision' && JSON.stringify(changes) !== JSON.stringify(INITIAL) && (
        <div className="demo-notice">
          Этот раздел относится к исходному примеру. Ваши пробные условия и их результат — во вкладке «Решение».
        </div>
      )}
      {step === 'evidence' && <Evidence demo={demo} />}
      {step === 'simulation' && <Simulation demo={demo} changedVolume={(changes.volume_multiplier ?? 1) !== 1} />}
      {step === 'report' && <Report demo={demo} changed={JSON.stringify(changes) !== JSON.stringify(INITIAL)} />}
      <div className="demo-next">
        <span>
          <Check size={16} /> Расчёт, имитация и отчёт — без аккаунта
        </span>
        {currentIndex < STEPS.length - 1 && (
          <button
            className="demo-button"
            onClick={() => {
              setSearch({ step: STEPS[currentIndex + 1][0] }, { replace: true })
              document.querySelector('.demo-steps')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
            }}
          >
            {STEPS[currentIndex + 1][1]}
            <ArrowRight size={17} />
          </button>
        )}
      </div>
    </>
  )
}

import { useCallback, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Pause, Play, Sparkles, X } from 'lucide-react'
import { Twin } from '../twin/Twin'
import { robotStatus } from '../twin/Robots'
import { STEPS, useConfig, useRobot, useStore, type ExplainTab } from '../store'
import { COUNTS, explain, zoneNames, zoneStatus, zoneStatusLabel, type Robot, type RobotCount } from '../data/robots'
import { demand } from '../data/project'
import { KpiNumber } from '../components/KpiNumber'
import { Bar, Button, Dot, Pill, Segmented, type Tone } from '../components/ui'

const fmt1 = (v: number) => v.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function slaTone(sla: number): Tone {
  return sla >= demand.slaTarget ? 'ok' : sla >= 88 ? 'warn' : 'crit'
}
const slaLabel: Record<string, string> = { ok: 'SLA выполняется', warn: 'SLA под угрозой', crit: 'SLA не выполняется' }

const DEMO: { caption: string; count?: RobotCount; mode?: 'normal' | 'peak'; ms: number; tab?: ExplainTab }[] = [
  { caption: 'Сейчас 3 робота в пиковом режиме: очередь короткая, SLA 96 %.', count: 3, mode: 'peak', ms: 3800 },
  { caption: 'Убираем одного робота. Конфигурация дешевле на 2,7 млн ₽.', count: 2, ms: 4200, tab: 'notTwo' },
  { caption: 'Оставшиеся два работают почти без остановок. На приёмке накапливается очередь.', ms: 5200 },
  { caption: 'SLA падает до 64 %. Два робота не обеспечивают пиковую нагрузку.', ms: 4200 },
  { caption: 'Возвращаем третьего робота.', count: 3, ms: 3600, tab: 'why' },
  { caption: 'Очередь рассасывается, приёмка возвращается в норму, SLA снова 96 %.', ms: 7000 },
  { caption: '3 робота — оптимальная конфигурация: справляется с пиком без простоя.', ms: 5000 },
]

function useDemo() {
  const timer = useRef<number | null>(null)
  const stop = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
    useStore.getState().setDemo(-1, null)
  }, [])
  const start = useCallback(() => {
    const s = useStore.getState()
    s.selectRobot('ronavi-h1500')
    s.setRunning(true)
    const run = (i: number) => {
      if (i >= DEMO.length) {
        stop()
        return
      }
      const st = DEMO[i]
      const g = useStore.getState()
      if (st.count) g.setRobotCount(st.count)
      if (st.mode) g.setLoadMode(st.mode)
      if (st.tab) g.setExplainTab(st.tab)
      g.setDemo(i, st.caption)
      timer.current = window.setTimeout(() => run(i + 1), st.ms)
    }
    run(0)
  }, [stop])
  useEffect(() => () => stop(), [stop])
  return { start, stop }
}

function buildExplain(robot: Robot): Record<ExplainTab, { title: string; body: string; points: string[] }> {
  if (robot.id === 'ronavi-h1500') return explain
  const n = robot.recommendedCount
  const c = robot.configs
  const lo = (n - 1) as RobotCount
  const hi = Math.min(4, n + 1) as RobotCount
  const cn = c[n]
  const cl = c[lo]
  const ch = c[hi]
  return {
    why: {
      title: `Почему ${n}`,
      body: robot.meetsSla
        ? `${n} × ${robot.name} — минимальная конфигурация, которая выполняет SLA: пропускная способность ${cn.normal.throughput} паллет в час при пике ${demand.peakPerHour}, очередь ${cn.normal.queue}, загрузка ${cn.normal.utilization} %.`
        : `Даже ${n} × ${robot.name} не выполняют SLA: пропускная способность ${cn.normal.throughput} паллет в час ниже пика ${demand.peakPerHour}. Пятый робот выводит конфигурацию за бюджет. Для этого склада решение не рекомендуется.`,
      points: [`SLA ${cn.normal.sla} % в норме и ${cn.peak.sla} % в пик`, `Окупаемость ${cn.econ.payback ? fmt1(cn.econ.payback) + ' года' : '—'}`, `CAPEX ${fmt1(cn.econ.capex)} млн ₽`],
    },
    notTwo: {
      title: `Почему не ${lo}`,
      body: `${lo} робота дешевле на ${fmt1(cn.econ.capex - cl.econ.capex)} млн ₽, но дают только ${cl.normal.throughput} паллет в час. Очередь растёт до ${cl.normal.queue}, SLA падает до ${cl.normal.sla} %.`,
      points: [`Дешевле на ${fmt1(cn.econ.capex - cl.econ.capex)} млн ₽`, `SLA ${cl.normal.sla} % при требовании 95 %`, `Загрузка ${cl.normal.utilization} % — без запаса`],
    },
    notFour: {
      title: hi === n ? 'Почему не 5' : `Почему не ${hi}`,
      body:
        hi === n
          ? `Пятый робот стоит ещё ${fmt1(robot.price)} млн ₽ и выводит CAPEX за бюджет 15 млн ₽.`
          : `${hi} робота дают ${ch.normal.throughput} паллет в час, но загрузка падает до ${ch.normal.utilization} %: часть машин простаивает. Инвестиции выше на ${fmt1(ch.econ.capex - cn.econ.capex)} млн ₽.`,
      points: hi === n ? ['Выше бюджета', 'Долгая окупаемость'] : [`Дороже на ${fmt1(ch.econ.capex - cn.econ.capex)} млн ₽`, `Загрузка ${ch.normal.utilization} %`, `ROI 5 лет ${ch.econ.roi5y ?? '—'} %`],
    },
  }
}

export function SimulationScreen() {
  const robot = useRobot()
  const cfg = useConfig()
  const count = useStore((s) => s.robotCount)
  const mode = useStore((s) => s.loadMode)
  const running = useStore((s) => s.running)
  const live = useStore((s) => s.live)
  const explainTab = useStore((s) => s.explainTab)
  const demoStep = useStore((s) => s.demoStep)
  const demoCaption = useStore((s) => s.demoCaption)
  const selection = useStore((s) => s.selection)
  const { setRobotCount, setLoadMode, setRunning, setExplainTab, setSelection, setStep, prev } = useStore.getState()
  const { start, stop } = useDemo()
  const demoOn = demoStep >= 0

  const tone = slaTone(live.sla)
  const ex = buildExplain(robot)
  const econ = cfg.econ
  const demandNow = mode === 'peak' ? demand.peakPerHour : demand.averagePerHour
  const idx = STEPS.findIndex((s) => s.id === 'simulation')

  const manual = <T,>(fn: (v: T) => void) => (v: T) => {
    if (demoOn) stop()
    fn(v)
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] px-6 pb-12 pt-7">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="meta mb-2 num">Шаг {idx + 1} из {STEPS.length} · {STEPS[idx].question}</div>
          <h1 className="h1">
            {count} × {robot.name}
            <span className="ml-3 align-middle">
              <Pill tone={tone} className="!h-7 !px-2.5 !text-[13px]">
                <Dot tone={tone} pulse={tone !== 'ok'} />
                {slaLabel[tone]}
              </Pill>
            </span>
          </h1>
          <p className="mt-2 max-w-[720px] text-[15px] text-ink-2">
            {count === robot.recommendedCount
              ? robot.meetsSla
                ? 'Минимальная конфигурация, которая стабильно справляется с пиковой нагрузкой склада. Переключите количество роботов и режим нагрузки — двойник и показатели пересчитаются.'
                : 'Даже рекомендуемое количество этого робота не выполняет SLA на вашем складе. Сравните с Ronavi H1500 на шаге «Роботы».'
              : count < robot.recommendedCount
                ? 'Конфигурация дешевле, но не справляется с потоком: смотрите очередь на приёмке и SLA.'
                : 'Конфигурация справляется с запасом, но часть роботов простаивает — экономика хуже.'}
          </p>
        </div>
        <Button variant={demoOn ? 'secondary' : 'primary'} icon={demoOn ? <X size={15} /> : <Sparkles size={15} />} onClick={demoOn ? stop : start}>
          {demoOn ? 'Остановить сценарий' : 'Показать демо-сценарий'}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
        {/* Twin */}
        <div className="card relative h-[640px] overflow-hidden">
          <Twin mode="sim" />

          {/* selection card */}
          <AnimatePresence>
            {selection && (
              <motion.div
                key={selection.kind + ('index' in selection ? selection.index : '')}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="absolute right-4 top-4 z-10 w-[260px] rounded-[12px] border border-line bg-white/95 p-4 shadow-card backdrop-blur"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="meta">{selection.kind === 'zone' ? 'Зона' : 'Робот'}</div>
                    <div className="h3">{selection.kind === 'zone' ? zoneNames[selection.index] : `${robot.name} · ${selection.index + 1}`}</div>
                  </div>
                  <button type="button" className="text-ink-4 hover:text-ink" onClick={() => setSelection(null)} aria-label="Закрыть">
                    <X size={15} />
                  </button>
                </div>
                {selection.kind === 'zone' ? (
                  <ZoneInfo index={selection.index} />
                ) : (
                  <RobotInfo index={selection.index} util={live.utilization} />
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* demo caption */}
          <AnimatePresence>
            {demoCaption && (
              <motion.div
                key={demoCaption}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3 }}
                className="pointer-events-none absolute bottom-[84px] left-1/2 z-10 w-[min(640px,90%)] -translate-x-1/2 rounded-[12px] bg-ink px-5 py-3 text-center text-[14.5px] font-medium text-white shadow-float"
              >
                {demoCaption}
              </motion.div>
            )}
          </AnimatePresence>

          {/* controls */}
          <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-[14px] border border-line bg-white/95 p-2 shadow-card backdrop-blur">
            <Segmented
              layoutId="robots-count"
              value={count}
              onChange={manual(setRobotCount)}
              options={COUNTS.map((n) => ({ value: n, label: `${n} робота` }))}
            />
            <div className="h-6 w-px bg-line" />
            <Segmented
              layoutId="load-mode"
              value={mode}
              onChange={manual(setLoadMode)}
              options={[
                { value: 'normal', label: 'Обычная нагрузка', hint: `${demand.averagePerHour} паллет / ч` },
                { value: 'peak', label: 'Пик', hint: `${demand.peakPerHour} паллет / ч` },
              ]}
            />
            <div className="h-6 w-px bg-line" />
            <Button variant="ghost" size="sm" onClick={() => setRunning(!running)} className="!px-2.5" aria-label={running ? 'Пауза' : 'Продолжить'}>
              {running ? <Pause size={15} /> : <Play size={15} />}
              <span className="hidden sm:inline">{running ? 'Пауза' : 'Продолжить'}</span>
            </Button>
          </div>

          <div className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-2">
            <span className="rounded-full border border-line bg-white/90 px-2.5 py-1 text-[12px] text-ink-3">
              нагрузка сейчас <span className="num font-medium text-ink">{demandNow} паллет / ч</span>
            </span>
            {!running && <span className="rounded-full bg-ink px-2.5 py-1 text-[12px] font-medium text-white">Пауза</span>}
          </div>
        </div>

        {/* KPI panel */}
        <aside className="card scroll-thin flex h-[640px] flex-col overflow-y-auto">
          <div className="p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-ink-2">Отгрузки в срок · SLA</span>
              <span className="meta">цель {demand.slaTarget} %</span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <KpiNumber value={live.sla} digits={live.sla >= 99 ? 1 : 0} className={`display text-[44px] ${tone === 'ok' ? 'text-ink' : tone === 'warn' ? 'text-warn' : 'text-crit'}`} />
              <span className="display text-[22px] text-ink-3">%</span>
            </div>
            <div className="mt-2">
              <SlaBar value={live.sla} tone={tone} />
            </div>
          </div>

          <div className="grid grid-cols-3 divide-x divide-line border-y border-line">
            <Kpi label="Мощность" value={live.throughput} unit="паллет/ч" hint={`нужно ${demandNow}`} tone={live.throughput >= demandNow ? 'neutral' : 'crit'} />
            <Kpi label="Очередь" value={live.queue} unit="паллет" hint={live.queue > 15 ? 'растёт' : live.queue > 6 ? 'умеренная' : 'в норме'} tone={live.queue > 15 ? 'crit' : live.queue > 6 ? 'warn' : 'neutral'} />
            <Kpi label="Загрузка роботов" value={live.utilization} unit="%" hint={live.utilization > 93 ? 'без запаса' : live.utilization < 72 ? 'простой' : 'оптимально'} tone={live.utilization > 93 ? 'crit' : live.utilization < 72 ? 'warn' : 'neutral'} />
          </div>

          <div className="p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="h3">Нагрузка по зонам</span>
              <span className="meta">нажмите, чтобы выделить</span>
            </div>
            <ul className="space-y-2.5">
              {zoneNames.map((z, i) => {
                const load = live.zones[i]
                const st = zoneStatus(load)
                const t: Tone = st === 'critical' ? 'crit' : st === 'high' ? 'warn' : 'neutral'
                return (
                  <li key={z}>
                    <button
                      type="button"
                      onClick={() => setSelection(selection?.kind === 'zone' && selection.index === i ? null : { kind: 'zone', index: i })}
                      className="group w-full text-left"
                    >
                      <div className="mb-1 flex items-center justify-between text-[13px]">
                        <span className="text-ink group-hover:text-accent">{z}</span>
                        <span className="flex items-center gap-2">
                          <span className={`text-[12px] ${t === 'crit' ? 'text-crit' : t === 'warn' ? 'text-warn' : 'text-ink-3'}`}>{zoneStatusLabel[st]}</span>
                          <KpiNumber value={load * 100} className="w-9 text-right text-ink-2" suffix=" %" />
                        </span>
                      </div>
                      <Bar value={load * 100} tone={t === 'neutral' ? 'neutral' : t} height={5} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="grid grid-cols-3 divide-x divide-line border-y border-line bg-surface-2">
            <Kpi label="CAPEX" value={econ.capex} digits={1} unit="млн ₽" />
            <Kpi label="Окупаемость" value={econ.payback ?? 0} digits={1} unit={econ.payback ? 'года' : ''} hint={econ.payback ? undefined : 'не окупается'} />
            <Kpi label="ROI 5 лет" value={econ.roi5y ?? 0} unit="%" />
          </div>

          <div className="p-5">
            <div className="mb-3 flex flex-wrap gap-1">
              {(['why', 'notTwo', 'notFour'] as ExplainTab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setExplainTab(t)}
                  className={`h-7 rounded-full px-2.5 text-[12.5px] font-medium transition-colors ${
                    explainTab === t ? 'bg-ink text-white' : 'bg-black/[0.05] text-ink-2 hover:bg-black/[0.08]'
                  }`}
                >
                  {ex[t].title}
                </button>
              ))}
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={explainTab}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
              >
                <p className="text-[13.5px] leading-relaxed text-ink-2">{ex[explainTab].body}</p>
                <ul className="mt-3 space-y-1.5">
                  {ex[explainTab].points.map((p) => (
                    <li key={p} className="flex items-center gap-2 text-[13px] text-ink">
                      <span className="h-1 w-1 rounded-full bg-ink-3" />
                      {p}
                    </li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>
          </div>
        </aside>
      </div>

      <div className="mt-8 flex items-center justify-between hairline pt-6">
        <Button variant="ghost" icon={<ArrowLeft size={15} />} onClick={prev}>
          Роботы
        </Button>
        <Button variant="primary" size="lg" onClick={() => setStep('economics')}>
          Далее: экономика
          <ArrowRight size={16} />
        </Button>
      </div>
    </div>
  )
}

function SlaBar({ value, tone }: { value: number; tone: Tone }) {
  return (
    <div className="relative h-2 w-full rounded-full bg-black/[0.06]">
      <motion.div
        className={`h-full rounded-full ${tone === 'ok' ? 'bg-ink' : tone === 'warn' ? 'bg-warn' : 'bg-crit'}`}
        initial={false}
        animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 24 }}
      />
      <span className="absolute -top-1 h-4 w-px bg-ink-2" style={{ left: `${demand.slaTarget}%` }} title={`Цель ${demand.slaTarget} %`} />
    </div>
  )
}

function Kpi({ label, value, unit, hint, digits = 0, tone = 'neutral' }: { label: string; value: number; unit: string; hint?: string; digits?: number; tone?: Tone }) {
  const c = tone === 'crit' ? 'text-crit' : tone === 'warn' ? 'text-warn' : 'text-ink'
  return (
    <div className="px-4 py-4">
      <div className="text-[12.5px] text-ink-3">{label}</div>
      <div className="mt-1 flex items-baseline gap-1 whitespace-nowrap">
        <KpiNumber value={value} digits={digits} className={`display text-[24px] ${c}`} />
        <span className="text-[12px] text-ink-3">{unit}</span>
      </div>
      {hint && <div className={`mt-0.5 whitespace-nowrap text-[12px] ${tone === 'crit' ? 'text-crit' : tone === 'warn' ? 'text-warn' : 'text-ink-3'}`}>{hint}</div>}
    </div>
  )
}

function ZoneInfo({ index }: { index: number }) {
  const load = useStore((s) => s.live.zones[index])
  const queue = useStore((s) => s.live.queue)
  const st = zoneStatus(load)
  const t: Tone = st === 'critical' ? 'crit' : st === 'high' ? 'warn' : 'ok'
  const facts: Record<number, string[]> = {
    0: [`Очередь ${Math.round(queue)} паллет`, `Ожидание ${(Math.round(queue) * 1.3).toFixed(0)} мин`],
    1: ['Заполнение 87 %', '4 200 паллето-мест'],
    2: ['640 заказов в сутки', 'Зависит от подачи со склада'],
    3: ['4 дока', 'Отгрузка по графику перевозчика'],
  }
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-[13px]">
        <span className="text-ink-2">Нагрузка</span>
        <span className="num font-medium">{Math.round(load * 100)} %</span>
      </div>
      <Bar value={load * 100} tone={t === 'ok' ? 'neutral' : t} height={5} />
      <div className="mt-2">
        <Pill tone={t}>{zoneStatusLabel[st]}</Pill>
      </div>
      <ul className="mt-3 space-y-1 text-[13px] text-ink-2">
        {facts[index].map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </div>
  )
}

function RobotInfo({ index, util }: { index: number; util: number }) {
  const st = robotStatus(index)
  return (
    <div className="mt-3 space-y-2 text-[13px]">
      <div className="flex items-center justify-between">
        <span className="text-ink-2">Статус</span>
        <span className="font-medium">{st.task}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-ink-2">Груз</span>
        <span className="font-medium">{st.loaded ? 'паллета на борту' : 'пусто'}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-ink-2">Загрузка за смену</span>
        <span className="num font-medium">{Math.round(util)} %</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-ink-2">Заряд</span>
        <span className="num font-medium">{[82, 67, 91, 74][index]} %</span>
      </div>
    </div>
  )
}

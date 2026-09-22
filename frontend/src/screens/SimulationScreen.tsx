import { useCallback, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Pause, Play, Sparkles, X } from 'lucide-react'
import { Twin } from '../twin/Twin'
import { robotStatus } from '../twin/Robots'
import { STEPS, useConfiguration, useStore, type ExplainTab } from '../store'
import { api, fmt, type ConfigurationsOut } from '../api'
import { useQuery } from '../query'
import { zoneNames, zoneStatus, zoneStatusLabel } from '../data/zones'
import { KpiNumber } from '../components/KpiNumber'
import { QueueSparkline } from '../components/QueueSparkline'
import { Bar, Button, Dot, Pill, Segmented, type Tone } from '../components/ui'
import { ErrorState, Loading } from '../components/States'

function slaTone(sla: number, target: number): Tone {
  return sla >= target ? 'ok' : sla >= target - 7 ? 'warn' : 'crit'
}
const slaLabel: Record<string, string> = { ok: 'SLA выполняется', warn: 'SLA под угрозой', crit: 'SLA не выполняется' }

function useDemo(cfg: ConfigurationsOut | null) {
  const timer = useRef<number | null>(null)
  const stop = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
    useStore.getState().setDemo(-1, null)
  }, [])
  const start = useCallback(() => {
    if (!cfg || cfg.recommended_count === null) return
    const rec = cfg.recommended_count
    const lower = cfg.configurations.find((c) => c.count === rec - 1)
    if (!lower) return
    const recCfg = cfg.configurations.find((c) => c.count === rec)!
    const f = (v: number) => Math.round(v)
    const steps: { caption: string; count?: number; mode?: 'normal' | 'peak'; ms: number; tab?: ExplainTab }[] = [
      { caption: `Сейчас ${rec} робота в пиковом режиме: очередь короткая, SLA ${f(recCfg.peak.sla)} %.`, count: rec, mode: 'peak', ms: 3800 },
      { caption: `Убираем одного робота. Конфигурация дешевле на ${fmt.mln(recCfg.econ.capex_mln - lower.econ.capex_mln)} млн ₽.`, count: rec - 1, ms: 4200, tab: 'not_fewer' },
      { caption: 'Оставшиеся работают почти без остановок. На приёмке накапливается очередь.', ms: 5200 },
      { caption: `SLA падает до ${f(lower.peak.sla)} %. ${rec - 1} робота не обеспечивают пиковую нагрузку.`, ms: 4200 },
      { caption: 'Возвращаем робота.', count: rec, ms: 3600, tab: 'why' },
      { caption: `Очередь рассасывается, приёмка возвращается в норму, SLA снова ${f(recCfg.peak.sla)} %.`, ms: 7000 },
      { caption: `${rec} робота — минимальная конфигурация, которая стабильно выполняет SLA.`, ms: 5000 },
    ]
    const s = useStore.getState()
    s.setRunning(true)
    const run = (i: number) => {
      if (i >= steps.length) {
        stop()
        return
      }
      const st = steps[i]
      const g = useStore.getState()
      if (st.count) g.setRobotCount(st.count)
      if (st.mode) g.setLoadMode(st.mode)
      if (st.tab) g.setExplainTab(st.tab)
      g.setDemo(i, st.caption)
      timer.current = window.setTimeout(() => run(i + 1), st.ms)
    }
    run(0)
  }, [cfg, stop])
  useEffect(() => () => stop(), [stop])
  return { start, stop }
}

export function SimulationScreen() {
  const project = useStore((s) => s.project)!
  const robotId = useStore((s) => s.robotId)
  const count = useStore((s) => s.robotCount)
  const mode = useStore((s) => s.loadMode)
  const running = useStore((s) => s.running)
  const live = useStore((s) => s.live)
  const explainTab = useStore((s) => s.explainTab)
  const demoStep = useStore((s) => s.demoStep)
  const demoCaption = useStore((s) => s.demoCaption)
  const selection = useStore((s) => s.selection)
  const { setRobotCount, setLoadMode, setRunning, setExplainTab, setSelection, setStep, prev, setConfigurations, selectRobot } = useStore.getState()

  const { data, error, loading, reload } = useQuery(`configurations:${project.id}:${project.version}:${robotId ?? 'best'}`, () => api.configurations(project.id, robotId))
  useEffect(() => {
    if (!data) return
    setConfigurations(data)
    if (robotId !== data.robot.id) selectRobot(data.robot.id)
    if (!data.configurations.some((c) => c.count === useStore.getState().robotCount)) setRobotCount(data.recommended_count ?? data.configurations[0].count)
  }, [data, robotId, setConfigurations, selectRobot, setRobotCount])
  const cfg = useConfiguration()
  const simKey = data ? `simulation:${project.id}:${project.version}:${data.robot.id}:${count}:${mode}` : null
  const { data: sim } = useQuery(simKey, () => api.simulation(project.id, data!.robot.id, count, mode))
  const { start, stop } = useDemo(data ?? null)
  const demoOn = demoStep >= 0
  const target = Number(data?.sizing.required_throughput_peak ?? 0)
  const slaTarget = 95
  const tone = slaTone(live.sla, slaTarget)
  const demandNow = data ? Number(mode === 'peak' ? data.sizing.required_throughput_peak : data.sizing.required_throughput_avg) : 0
  const idx = STEPS.findIndex((s) => s.id === 'simulation')
  const manual = <T,>(fn: (v: T) => void) => (v: T) => {
    if (demoOn) stop()
    fn(v)
  }
  const rec = data?.recommended_count ?? null
  const lead = !data
    ? ''
    : rec === null
      ? 'Ни одна конфигурация в бюджете не выполняет SLA. Посмотрите, что происходит, и вернитесь к выбору робота.'
      : count === rec
        ? 'Минимальная конфигурация, которая стабильно справляется с пиковой нагрузкой склада. Переключите количество роботов и режим нагрузки — двойник и показатели пересчитаются.'
        : count < rec
          ? 'Конфигурация дешевле, но не справляется с потоком: смотрите очередь на приёмке и SLA.'
          : 'Конфигурация справляется с запасом, но часть роботов простаивает — экономика хуже.'

  return (
    <div className="mx-auto w-full max-w-[1440px] px-6 pb-12 pt-7">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="meta mb-2 num">Шаг {idx + 1} из {STEPS.length} · {STEPS[idx].question}</div>
          <h1 className="h1">
            {count} × {data?.robot.short_name ?? '…'}
            {data && (
              <span className="ml-3 align-middle">
                <Pill tone={tone} className="!h-7 !px-2.5 !text-[13px]">
                  <Dot tone={tone} pulse={tone !== 'ok'} />
                  {slaLabel[tone]}
                </Pill>
              </span>
            )}
          </h1>
          <p className="mt-2 max-w-[720px] text-[15px] text-ink-2">{lead}</p>
        </div>
        <Button variant={demoOn ? 'secondary' : 'primary'} icon={demoOn ? <X size={15} /> : <Sparkles size={15} />} onClick={demoOn ? stop : start} disabled={!data || rec === null}>
          {demoOn ? 'Остановить сценарий' : 'Показать демо-сценарий'}
        </Button>
      </div>

      {loading && !data && <Loading label="Запускаем симуляцию конфигураций…" />}
      {error && <ErrorState error={error} onRetry={reload} />}

      {data && cfg && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
          <div className="card relative h-[640px] overflow-hidden">
            <Twin mode="sim" />

            <AnimatePresence>
              {selection && (
                <motion.div key={selection.kind + ('index' in selection ? selection.index : '')} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="absolute right-4 top-4 z-10 w-[260px] rounded-[12px] border border-line bg-white/95 p-4 shadow-card backdrop-blur">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="meta">{selection.kind === 'zone' ? 'Зона' : 'Робот'}</div>
                      <div className="h3">{selection.kind === 'zone' ? zoneNames[selection.index] : `${data.robot.short_name} · ${selection.index + 1}`}</div>
                    </div>
                    <button type="button" className="text-ink-4 hover:text-ink" onClick={() => setSelection(null)} aria-label="Закрыть">
                      <X size={15} />
                    </button>
                  </div>
                  {selection.kind === 'zone' ? <ZoneInfo index={selection.index} /> : <RobotInfo index={selection.index} util={live.utilization} />}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {demoCaption && (
                <motion.div key={demoCaption} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3 }} className="pointer-events-none absolute bottom-[84px] left-1/2 z-10 w-[min(640px,90%)] -translate-x-1/2 rounded-[12px] bg-ink px-5 py-3 text-center text-[14.5px] font-medium text-white shadow-float">
                  {demoCaption}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-[14px] border border-line bg-white/95 p-2 shadow-card backdrop-blur">
              <Segmented layoutId="robots-count" value={count} onChange={manual(setRobotCount)} options={data.configurations.map((c) => ({ value: c.count, label: `${c.count} робота`, hint: c.status === 'optimal' ? 'рекомендуемая конфигурация' : undefined }))} />
              <div className="h-6 w-px bg-line" />
              <Segmented
                layoutId="load-mode"
                value={mode}
                onChange={manual(setLoadMode)}
                options={[
                  { value: 'normal', label: 'Обычная нагрузка', hint: `${fmt.int(Number(data.sizing.required_throughput_avg))} паллет / ч в среднем` },
                  { value: 'peak', label: 'Пик', hint: `${fmt.int(target)} паллет / ч` },
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
                нагрузка сейчас <span className="num font-medium text-ink">{fmt.int(demandNow)} паллет / ч</span>
              </span>
              {!running && <span className="rounded-full bg-ink px-2.5 py-1 text-[12px] font-medium text-white">Пауза</span>}
            </div>
          </div>

          <aside className="card scroll-thin flex h-[640px] flex-col overflow-y-auto">
            <div className="p-5">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-ink-2">Отгрузки в срок · SLA</span>
                <span className="meta">цель {slaTarget} %</span>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <KpiNumber value={live.sla} digits={live.sla >= 99 ? 1 : 0} className={`display text-[44px] ${tone === 'ok' ? 'text-ink' : tone === 'warn' ? 'text-warn' : 'text-crit'}`} />
                <span className="display text-[22px] text-ink-3">%</span>
              </div>
              <div className="mt-2">
                <SlaBar value={live.sla} tone={tone} target={slaTarget} />
              </div>
            </div>

            <div className="grid grid-cols-3 divide-x divide-line border-y border-line">
              <Kpi label="Мощность" value={live.throughput} unit="паллет/ч" hint={`нужно ${fmt.int(demandNow)}`} tone={live.throughput >= demandNow ? 'neutral' : 'crit'} />
              <Kpi label="Очередь" value={live.queue} unit="паллет" hint={live.queue > 15 ? 'растёт' : live.queue > 6 ? 'умеренная' : 'в норме'} tone={live.queue > 15 ? 'crit' : live.queue > 6 ? 'warn' : 'neutral'} />
              <Kpi label="Загрузка роботов" value={live.utilization} unit="%" hint={live.utilization > 90 ? 'без запаса' : live.utilization < 55 ? 'простой' : 'оптимально'} tone={live.utilization > 90 ? 'crit' : live.utilization < 55 ? 'warn' : 'neutral'} />
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
                      <button type="button" onClick={() => setSelection(selection?.kind === 'zone' && selection.index === i ? null : { kind: 'zone', index: i })} className="group w-full text-left">
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
              {sim && (
                <div className="mt-4">
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-[13px] text-ink-2">Очередь в течение дня</span>
                    <span className="meta">по событиям симуляции</span>
                  </div>
                  <QueueSparkline events={sim.events} mode={mode} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 divide-x divide-line border-y border-line bg-surface-2">
              <Kpi label="CAPEX" value={cfg.econ.capex_mln} digits={1} unit="млн ₽" />
              <Kpi label="Окупаемость" value={cfg.econ.payback_years ?? 0} digits={1} unit={cfg.econ.payback_years ? 'года' : ''} hint={cfg.econ.payback_years ? undefined : 'не окупается'} tone={cfg.econ.payback_years ? 'neutral' : 'crit'} />
              <Kpi label="ROI 5 лет" value={cfg.econ.roi_5y ?? 0} unit="%" tone={(cfg.econ.roi_5y ?? 0) < 0 ? 'crit' : 'neutral'} />
            </div>

            <div className="p-5">
              <div className="mb-3 flex flex-wrap gap-1">
                {(['why', 'not_fewer', 'not_more'] as ExplainTab[]).map((t) => (
                  <button key={t} type="button" onClick={() => setExplainTab(t)} className={`h-7 rounded-full px-2.5 text-[12.5px] font-medium transition-colors ${explainTab === t ? 'bg-ink text-white' : 'bg-black/[0.05] text-ink-2 hover:bg-black/[0.08]'}`}>
                    {data.explanations[t].title}
                  </button>
                ))}
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={explainTab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
                  <p className="text-[13.5px] leading-relaxed text-ink-2">{data.explanations[explainTab].body}</p>
                  <ul className="mt-3 space-y-1.5">
                    {data.explanations[explainTab].points.map((p) => (
                      <li key={p} className="flex items-center gap-2 text-[13px] text-ink">
                        <span className="h-1 w-1 shrink-0 rounded-full bg-ink-3" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              </AnimatePresence>
              <p className="mt-4 text-[12px] leading-relaxed text-ink-4">
                Расчёт: {String(data.sizing.formula)}. Эффективная производительность робота на вашем складе — {String(data.sizing.effective_throughput)} паллет/ч при номинальных {String(data.sizing.nominal_throughput)}.
              </p>
            </div>
          </aside>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between hairline pt-6">
        <Button variant="ghost" icon={<ArrowLeft size={15} />} onClick={prev}>
          Роботы
        </Button>
        <Button variant="primary" size="lg" onClick={() => setStep('economics')} disabled={!data}>
          Далее: экономика
          <ArrowRight size={16} />
        </Button>
      </div>
    </div>
  )
}

function SlaBar({ value, tone, target }: { value: number; tone: Tone; target: number }) {
  return (
    <div className="relative h-2 w-full rounded-full bg-black/[0.06]">
      <motion.div className={`h-full rounded-full ${tone === 'ok' ? 'bg-ink' : tone === 'warn' ? 'bg-warn' : 'bg-crit'}`} initial={false} animate={{ width: `${Math.max(0, Math.min(100, value))}%` }} transition={{ type: 'spring', stiffness: 120, damping: 24 }} />
      <span className="absolute -top-1 h-4 w-px bg-ink-2" style={{ left: `${target}%` }} title={`Цель ${target} %`} />
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
    0: [`Очередь ${Math.round(queue)} паллет`, `Ожидание около ${Math.max(1, Math.round(queue * 0.6))} мин`],
    1: ['Паллетное хранение', 'Роботы ставят паллеты в проходах'],
    2: ['Станции комплектации', 'Зависит от подачи со склада'],
    3: ['Доки отгрузки', 'Отгрузка по графику перевозчика'],
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
      <div className="flex items-center justify-between"><span className="text-ink-2">Статус</span><span className="font-medium">{st.task}</span></div>
      <div className="flex items-center justify-between"><span className="text-ink-2">Груз</span><span className="font-medium">{st.loaded ? 'паллета на борту' : 'пусто'}</span></div>
      <div className="flex items-center justify-between"><span className="text-ink-2">Загрузка за смену</span><span className="num font-medium">{Math.round(util)} %</span></div>
      <div className="flex items-center justify-between"><span className="text-ink-2">Заряд</span><span className="num font-medium">{[82, 67, 91, 74, 88, 59, 77, 95][index % 8]} %</span></div>
    </div>
  )
}

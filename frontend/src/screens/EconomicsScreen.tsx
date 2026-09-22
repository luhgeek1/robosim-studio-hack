import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Screen } from '../components/Screen'
import { CashCurve } from '../components/CashCurve'
import { api, fmt, type Scenario } from '../api'
import { useQuery } from '../query'
import { useStore } from '../store'
import { KpiNumber } from '../components/KpiNumber'
import { Pill } from '../components/ui'
import { ErrorState, Loading } from '../components/States'

type Row = { key: string; label: string; render: (s: Scenario) => React.ReactNode; hint?: string }

export function EconomicsScreen() {
  const project = useStore((s) => s.project)!
  const robotId = useStore((s) => s.robotId)
  const count = useStore((s) => s.robotCount)
  const scenario = useStore((s) => s.scenario)
  const { setScenario, setRobotCount, setStep, setConfigurations, selectRobot } = useStore.getState()
  const { data: cfg, error: cfgError, loading: cfgLoading, reload: reloadCfg } = useQuery(`configurations:${project.id}:${project.version}:${robotId ?? 'best'}`, () => api.configurations(project.id, robotId))
  useEffect(() => {
    if (!cfg) return
    setConfigurations(cfg)
    if (robotId !== cfg.robot.id) selectRobot(cfg.robot.id)
    if (!cfg.configurations.some((c) => c.count === useStore.getState().robotCount)) setRobotCount(cfg.recommended_count ?? cfg.configurations[0].count)
  }, [cfg, robotId, setConfigurations, selectRobot, setRobotCount])
  const key = cfg ? `scenarios:${project.id}:${project.version}:${cfg.robot.id}:${count}` : null
  const { data: scenarios, error, loading, reload } = useQuery(key, () => api.scenarios(project.id, cfg!.robot.id, count))

  const purchase = scenarios?.[1]
  const raas = scenarios?.[2]
  const best = scenarios?.find((s) => s.recommended)
  const maxTco = scenarios ? Math.max(...scenarios.map((s) => s.tco5y)) : 1
  const rec = cfg?.recommended_count ?? null

  const rows: Row[] = [
    { key: 'capex', label: 'Инвестиции · CAPEX', render: (s) => <Money v={s.capex} /> },
    { key: 'opex', label: 'Расходы в год · OPEX', hint: 'персонал, техника, потери от опозданий, роботы', render: (s) => <Money v={s.opex} /> },
    {
      key: 'tco',
      label: 'Стоимость за 5 лет · TCO',
      hint: 'с индексацией зарплат',
      render: (s) => (
        <div>
          <Money v={s.tco5y} />
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-black/[0.06]">
            <motion.div className={`h-full rounded-full ${s.recommended ? 'bg-ink' : 'bg-ink-4'}`} initial={false} animate={{ width: `${(s.tco5y / maxTco) * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 24 }} />
          </div>
        </div>
      ),
    },
    { key: 'savings', label: 'Выгода за 5 лет', render: (s) => (s.savings5y > 0 ? <Money v={s.savings5y} prefix="+" strong /> : s.id === 'current' ? <span className="text-ink-4">—</span> : <Money v={s.savings5y} strong tone="crit" />) },
    { key: 'roi', label: 'ROI за 5 лет', render: (s) => (s.roi5y !== null ? <span className={`num text-[15px] font-medium ${s.roi5y < 0 ? 'text-crit' : ''}`}>{s.roi5y} %</span> : <span className="text-ink-4">{s.id === 'raas' ? 'без CAPEX' : '—'}</span>) },
    { key: 'payback', label: 'Окупаемость', render: (s) => <span className={`text-[15px] ${s.payback ? 'font-medium' : 'text-ink-4'}`}>{s.payback_label}</span> },
    { key: 'thr', label: 'Мощность', render: (s) => <span className="text-[15px]"><span className="num font-medium">{fmt.int(s.throughput)}</span> <span className="text-ink-3">паллет / ч</span></span> },
    { key: 'sla', label: 'Отгрузки в срок · SLA', render: (s) => <span className={`num text-[15px] font-medium ${s.sla >= 95 ? 'text-ink' : 'text-warn'}`}>{fmt.int(s.sla)} %</span> },
    { key: 'robots', label: 'Роботов', render: (s) => <span className="num text-[15px] font-medium">{s.robots || '—'}</span> },
  ]

  const curves = purchase && raas ? [
    { id: 'purchase', label: `Покупка · ${count} робота`, points: purchase.curve, color: '#17171a' },
    { id: 'raas', label: 'RaaS · аренда', points: raas.curve, color: '#2f55d4', dashed: true },
  ] : []

  return (
    <Screen
      wide
      title={
        !scenarios || !purchase || !raas || !best
          ? 'Экономика сценариев'
          : best.id === 'purchase'
            ? `Покупка выгоднее аренды: +${fmt.mln(purchase.savings5y - raas.savings5y)} млн ₽ за 5 лет`
            : purchase.savings5y <= 0
              ? 'Эта конфигурация не окупается — вернитесь к рекомендуемой'
              : 'Аренда выгоднее покупки при этой конфигурации'
      }
      lead={
        cfg && purchase && raas && best ? (
          best.id === 'purchase' ? (
            <>
              Три сценария для {count} × {cfg.robot.short_name}: оставить всё как есть, купить роботов или взять их как сервис. Покупка требует {fmt.mln(purchase.capex)} млн ₽ сразу, но за 5 лет даёт наибольшую выгоду{purchase.capex <= Number(project ? 1e9 : 0) ? '' : ''}. RaaS снимает капитальные затраты и подходит, если нужен пилот.
            </>
          ) : (
            <>Три сценария для {count} × {cfg.robot.short_name}. {purchase.savings5y <= 0 ? 'Конфигурация не выполняет SLA: потери от опозданий и ручная обработка съедают экономию.' : 'Аренда без капитальных затрат оказывается выгоднее покупки.'} {rec !== null && count !== rec ? `Для полноценного эффекта вернитесь к ${rec} роботам.` : ''}</>
          )
        ) : undefined
      }
      nextLabel="Перейти к решению"
    >
      {(cfgLoading || loading) && !scenarios && <Loading label="Считаем экономику сценариев…" />}
      {cfgError && <ErrorState error={cfgError} onRetry={reloadCfg} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {cfg && scenarios && purchase && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-[13.5px] text-ink-2">
              <span>Конфигурация:</span>
              <div className="inline-flex rounded-[9px] bg-black/[0.05] p-[3px]">
                {cfg.configurations.map((c) => (
                  <button key={c.count} type="button" onClick={() => setRobotCount(c.count)} className={`h-8 rounded-[7px] px-3 text-[13px] font-medium transition-colors ${count === c.count ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-ink-3 hover:text-ink'}`}>
                    {c.count} робота
                  </button>
                ))}
              </div>
              {rec !== null && count !== rec && (
                <button type="button" className="text-[13px] font-medium text-accent hover:underline" onClick={() => setRobotCount(rec)}>
                  вернуть рекомендуемые {rec}
                </button>
              )}
            </div>
            <button type="button" className="text-[13px] font-medium text-accent hover:underline" onClick={() => setStep('simulation')}>
              Проверить в симуляции
            </button>
          </div>

          <div className="card overflow-hidden">
            <div className="grid grid-cols-[200px_repeat(3,1fr)] items-stretch">
              <div className="border-b border-line" />
              {scenarios.map((s) => {
                const active = s.id === scenario
                return (
                  <button key={s.id} type="button" onClick={() => setScenario(s.id)} className={`relative border-b border-l border-line px-5 py-4 text-left transition-colors ${active ? 'bg-surface-2' : 'hover:bg-surface-2/60'}`}>
                    {active && <motion.span layoutId="scenario-top" className="absolute inset-x-0 top-0 h-[2px] bg-ink" />}
                    <div className="flex items-center gap-2">
                      <span className="text-[16px] font-semibold">{s.name}</span>
                      {s.recommended && <Pill tone="accent">Рекомендуем</Pill>}
                    </div>
                    <div className="mt-0.5 text-[13px] text-ink-3">{s.caption}</div>
                  </button>
                )
              })}
              {rows.map((r) => (
                <RowCells key={r.key} row={r} scenarios={scenarios} active={scenario} />
              ))}
            </div>
            <div className="grid grid-cols-[200px_repeat(3,1fr)] bg-surface-2/60">
              <div />
              {scenarios.map((s) => (
                <div key={s.id} className="border-l border-line px-5 py-3 text-[12.5px] leading-relaxed text-ink-3">
                  {s.note}
                </div>
              ))}
            </div>
          </div>

          <section className="mt-10">
            <div className="mb-3 flex items-baseline justify-between">
              <div className="h3">Когда инвестиция выходит в плюс</div>
              <span className="meta">линия нуля — если ничего не менять</span>
            </div>
            <div className="card p-5">
              <CashCurve curves={curves} payback={purchase.payback} paybackLabel={`Окупаемость покупки · ${purchase.payback_label}`} />
            </div>
          </section>

          <section className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            <Breakdown title="Из чего складывается CAPEX" items={cfg.configurations.find((c) => c.count === count)?.econ.capex_breakdown ?? {}} labels={{ robots: 'Роботы', integration: 'Интеграция с WMS и пусконаладка', charging: 'Зарядные станции', software: 'Программное обеспечение', marking: 'Разметка пола', reserve: 'Резерв 10 %', total: 'Итого' }} />
            <Breakdown title="Расходы в год после внедрения" items={cfg.configurations.find((c) => c.count === count)?.econ.opex_breakdown ?? {}} labels={{ labor: 'Персонал зоны', equipment: 'Техника', sla_losses: 'Потери от опозданий', robots_maintenance: 'Обслуживание роботов', robots_energy: 'Электроэнергия', robots_licences: 'Лицензии', robots_batteries: 'Резерв на батареи' }} />
          </section>
        </>
      )}
    </Screen>
  )
}

function Breakdown({ title, items, labels }: { title: string; items: Record<string, number>; labels: Record<string, string> }) {
  const entries = Object.entries(items).filter(([k]) => k !== 'total')
  const total = items.total ?? entries.reduce((a, [, v]) => a + v, 0)
  return (
    <div className="card p-5">
      <div className="h3 mb-3">{title}</div>
      <ul className="divide-y divide-line">
        {entries.map(([k, v]) => (
          <li key={k} className="flex items-center justify-between py-1.5 text-[13.5px]">
            <span className="text-ink-2">{labels[k] ?? k}</span>
            <span className="num">{fmt.mln(v)} млн ₽</span>
          </li>
        ))}
        <li className="flex items-center justify-between py-1.5 text-[13.5px] font-semibold">
          <span>Итого</span>
          <span className="num">{fmt.mln(total)} млн ₽</span>
        </li>
      </ul>
    </div>
  )
}

function RowCells({ row, scenarios, active }: { row: Row; scenarios: Scenario[]; active: string }) {
  return (
    <>
      <div className="flex flex-col justify-center border-b border-line px-5 py-3.5">
        <span className="text-[13px] text-ink-2">{row.label}</span>
        {row.hint && <span className="text-[11.5px] text-ink-4">{row.hint}</span>}
      </div>
      {scenarios.map((s) => (
        <div key={s.id} className={`flex flex-col justify-center border-b border-l border-line px-5 py-3.5 ${s.id === active ? 'bg-surface-2' : ''}`}>
          {row.render(s)}
        </div>
      ))}
    </>
  )
}

function Money({ v, prefix = '', strong = false, tone }: { v: number; prefix?: string; strong?: boolean; tone?: 'crit' }) {
  return (
    <span className={`text-[15px] ${strong ? 'font-semibold' : 'font-medium'} ${tone === 'crit' ? 'text-crit' : ''}`}>
      <KpiNumber value={v} digits={1} prefix={prefix} /> <span className="font-normal text-ink-3">млн ₽</span>
    </span>
  )
}

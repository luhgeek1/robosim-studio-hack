import { motion } from 'framer-motion'
import { Screen } from '../components/Screen'
import { CashCurve } from '../components/CashCurve'
import { buildScenarios, fmtMln, purchaseCurve, raasCurve, type Scenario, type ScenarioId } from '../data/economics'
import { useConfig, useRobot, useStore } from '../store'
import { KpiNumber } from '../components/KpiNumber'
import { Pill } from '../components/ui'
import { COUNTS } from '../data/robots'

type Row = { key: string; label: string; render: (s: Scenario, all: Scenario[]) => React.ReactNode; hint?: string }

export function EconomicsScreen() {
  const robot = useRobot()
  const cfg = useConfig()
  const count = useStore((s) => s.robotCount)
  const scenario = useStore((s) => s.scenario)
  const setScenario = useStore((s) => s.setScenario)
  const setRobotCount = useStore((s) => s.setRobotCount)
  const setStep = useStore((s) => s.setStep)
  const scenarios = buildScenarios(robot, count)
  const purchase = scenarios[1]
  const raas = scenarios[2]
  const best = scenarios.find((s) => s.recommended)!
  const maxTco = Math.max(...scenarios.map((s) => s.tco5y))

  const rows: Row[] = [
    {
      key: 'capex',
      label: 'Инвестиции · CAPEX',
      render: (s) => <Money v={s.capex} />,
    },
    {
      key: 'opex',
      label: 'Расходы в год · OPEX',
      render: (s) => <Money v={s.opex} />,
    },
    {
      key: 'tco',
      label: 'Стоимость за 5 лет · TCO',
      hint: 'с индексацией зарплат 8 % в год',
      render: (s) => (
        <div>
          <Money v={s.tco5y} />
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-black/[0.06]">
            <motion.div
              className={`h-full rounded-full ${s.recommended ? 'bg-ink' : 'bg-ink-4'}`}
              initial={false}
              animate={{ width: `${(s.tco5y / maxTco) * 100}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 24 }}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'savings',
      label: 'Выгода за 5 лет',
      render: (s) => (s.savings5y > 0 ? <Money v={s.savings5y} prefix="+" strong /> : <span className="text-ink-4">—</span>),
    },
    {
      key: 'roi',
      label: 'ROI за 5 лет',
      render: (s) => (s.roi5y ? <span className="num text-[15px] font-medium">{s.roi5y} %</span> : <span className="text-ink-4">{s.id === 'raas' ? 'без CAPEX' : '—'}</span>),
    },
    {
      key: 'payback',
      label: 'Окупаемость',
      render: (s) => <span className={`text-[15px] ${s.payback ? 'font-medium' : 'text-ink-4'}`}>{s.paybackLabel}</span>,
    },
    {
      key: 'thr',
      label: 'Мощность в пик',
      render: (s) => (
        <span className="text-[15px]">
          <span className="num font-medium">{s.throughput}</span> <span className="text-ink-3">паллет / ч</span>
        </span>
      ),
    },
    {
      key: 'sla',
      label: 'Отгрузки в срок · SLA',
      render: (s) => (
        <span className={`num text-[15px] font-medium ${s.sla >= 95 ? 'text-ink' : 'text-warn'}`}>{s.sla} %</span>
      ),
    },
    {
      key: 'robots',
      label: 'Роботов',
      render: (s) => <span className="num text-[15px] font-medium">{s.robots || '—'}</span>,
    },
  ]

  const curves = [
    { id: 'purchase', label: `Покупка · ${count} робота`, points: purchaseCurve(cfg.econ), color: '#17171a' },
    { id: 'raas', label: 'RaaS · аренда', points: raasCurve(raas.savings5y), color: '#2f55d4', dashed: true },
  ]

  return (
    <Screen
      wide
      title={
        best.id === 'purchase'
          ? `Покупка выгоднее аренды: +${fmtMln(purchase.savings5y - raas.savings5y)} млн ₽ за 5 лет`
          : `Аренда выгоднее покупки при этой конфигурации`
      }
      lead={
        best.id === 'purchase' ? (
          <>
            Три сценария для {count} × {robot.name}: оставить всё как есть, купить роботов или взять их как сервис. Покупка требует {fmtMln(purchase.capex)} млн ₽
            сразу, но за 5 лет даёт наибольшую выгоду и укладывается в бюджет 15 млн ₽. RaaS снимает капитальные затраты и подходит, если нужен пилот.
          </>
        ) : (
          <>
            Три сценария для {count} × {robot.name}. Эта конфигурация не выполняет SLA, поэтому выгода от покупки ниже, а аренда без капитальных затрат
            оказывается выгоднее. Для полноценного эффекта вернитесь к рекомендуемому количеству роботов.
          </>
        )
      }
      nextLabel="Перейти к решению"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-[13.5px] text-ink-2">
          <span>Конфигурация:</span>
          <div className="inline-flex rounded-[9px] bg-black/[0.05] p-[3px]">
            {COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRobotCount(n)}
                className={`h-8 rounded-[7px] px-3 text-[13px] font-medium transition-colors ${count === n ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-ink-3 hover:text-ink'}`}
              >
                {n} робота
              </button>
            ))}
          </div>
          {count !== robot.recommendedCount && (
            <button type="button" className="text-[13px] font-medium text-accent hover:underline" onClick={() => setRobotCount(robot.recommendedCount)}>
              вернуть рекомендуемые {robot.recommendedCount}
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
              <button
                key={s.id}
                type="button"
                onClick={() => setScenario(s.id as ScenarioId)}
                className={`relative border-b border-l border-line px-5 py-4 text-left transition-colors ${active ? 'bg-surface-2' : 'hover:bg-surface-2/60'}`}
              >
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
          <CashCurve curves={curves} payback={purchase.payback} paybackLabel={`Окупаемость покупки · ${purchase.paybackLabel}`} />
        </div>
      </section>
    </Screen>
  )
}

function RowCells({ row, scenarios, active }: { row: Row; scenarios: Scenario[]; active: ScenarioId }) {
  return (
    <>
      <div className="flex flex-col justify-center border-b border-line px-5 py-3.5">
        <span className="text-[13px] text-ink-2">{row.label}</span>
        {row.hint && <span className="text-[11.5px] text-ink-4">{row.hint}</span>}
      </div>
      {scenarios.map((s) => (
        <div key={s.id} className={`flex flex-col justify-center border-b border-l border-line px-5 py-3.5 ${s.id === active ? 'bg-surface-2' : ''}`}>
          {row.render(s, scenarios)}
        </div>
      ))}
    </>
  )
}

function Money({ v, prefix = '', strong = false }: { v: number; prefix?: string; strong?: boolean }) {
  return (
    <span className={`text-[15px] ${strong ? 'font-semibold' : 'font-medium'}`}>
      <KpiNumber value={v} digits={1} prefix={prefix} /> <span className="font-normal text-ink-3">млн ₽</span>
    </span>
  )
}

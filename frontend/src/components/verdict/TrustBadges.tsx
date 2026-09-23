import { ChevronRight, Database, FlaskConical, Percent, Scale, Sigma, type LucideIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { useNavigate } from 'react-router'
import { useMonteCarlo, useTrace } from '@/api/scenarios'
import type { CalculationRun, Project } from '@/api/types'
import { filledShare, formatPct, formatRub, formatValue, isNum } from '@/lib/format'
import { stepPath } from '@/lib/story'
import { useStore } from '@/store'
import { MC_REQUEST, shortName } from '../economics/model'
import { MonteCarloSummary } from '../economics/Robustness'
import { Button, Popover, type Tone } from '../ui'

const TONE_ICON: Record<Tone, string> = {
  ok: 'text-ok bg-ok-soft',
  warn: 'text-warn bg-warn-soft',
  crit: 'text-crit bg-crit-soft',
  accent: 'text-accent bg-accent-soft',
  neutral: 'text-ink-3 bg-black/[0.05]',
}

// A radix trigger passes its handlers and ref through the props (React 19), so the badge spreads them on the button.
function Badge({
  tone,
  icon: Icon,
  label,
  ...rest
}: ComponentProps<'button'> & { tone: Tone; icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      {...rest}
      className="group flex w-full items-center gap-2.5 rounded-[12px] border border-line bg-surface py-2 pr-2.5 pl-2 text-left text-[13px] leading-snug transition-colors hover:border-line-2 hover:bg-surface-2"
    >
      <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] ${TONE_ICON[tone]}`}>
        <Icon size={15} />
      </span>
      <span className="min-w-0 flex-1 font-medium text-ink">{label}</span>
      <ChevronRight size={14} className="shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

// «Почему этому можно верить»: each badge is a short claim from the API; a click opens the proof (level 3).
export function TrustBadges({
  calc,
  scenarioId,
  project,
}: {
  calc: CalculationRun
  scenarioId: string
  project: Project
}) {
  const navigate = useNavigate()
  const openTrace = useStore((s) => s.openTrace)
  const setTrustOpen = useStore((s) => s.setTrustOpen)
  const trace = useTrace(calc.id)
  const mc = useMonteCarlo(scenarioId, MC_REQUEST)
  const simulated = calc.sizing.some((s) => s.count.source === 'simulated')
  const calibration = calc.calibration
  const fill = filledShare(project.data_quality.counts)
  const le3 = mc.data?.probability?.payback_le_3y
  const undocumented = trace.data?.undocumented_constants

  return (
    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-3">
      {simulated ? (
        <Popover
          width={380}
          align="start"
          trigger={<Badge tone="ok" icon={FlaskConical} label="Число роботов подтверждено имитацией" />}
        >
          <div className="h3 mb-2">Откуда число роботов</div>
          <ul className="space-y-2.5 text-[13px] leading-relaxed">
            {calc.sizing.map((s) => (
              <li key={s.process_key}>
                <div className="font-medium">
                  {s.count.final} × {shortName(s.product_name)}
                </div>
                <div className="text-ink-2">{s.count.explanation}</div>
              </li>
            ))}
          </ul>
          <Button size="sm" className="mt-3" onClick={() => navigate(stepPath(project.id, 'simulation'))}>
            Открыть симуляцию
          </Button>
        </Popover>
      ) : (
        <Badge
          tone="warn"
          icon={FlaskConical}
          label="Число роботов по расчёту — проверьте в симуляции"
          onClick={() => navigate(stepPath(project.id, 'simulation'))}
        />
      )}

      {calibration && (
        <Popover
          width={500}
          align="start"
          trigger={
            <Badge
              tone={calibration.within_tolerance ? 'ok' : 'warn'}
              icon={Scale}
              label={
                calibration.within_tolerance || !isNum(calibration.deviation_pct)
                  ? 'Сверено с методикой ФЦ БАС'
                  : `Сверено с методикой ФЦ БАС: расхождение ${formatPct(calibration.deviation_pct, { digits: 0 })}`
              }
            />
          }
        >
          <div className="h3">Сверка с методикой ФЦ БАС</div>
          {calibration.reference && <div className="meta mt-1">{calibration.reference}</div>}
          {calibration.note && <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{calibration.note}</p>}
          {calibration.checks && calibration.checks.length > 0 && (
            <table className="mt-3 w-full text-[12.5px]">
              <thead className="text-ink-3">
                <tr>
                  <th className="py-1 text-left font-normal">Показатель</th>
                  <th className="py-1 pl-3 text-right font-normal">У нас</th>
                  <th className="py-1 pl-3 text-right font-normal">ФЦ БАС</th>
                  <th className="py-1 pl-3 text-right font-normal">Разница</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {calibration.checks.map((c) => (
                  <tr key={c.key}>
                    <td className="py-1.5 pr-2">{c.name}</td>
                    <td className="num py-1.5 pl-3 text-right">{checkValue(c.ours, c.unit)}</td>
                    <td className="num py-1.5 pl-3 text-right">{checkValue(c.reference, c.unit)}</td>
                    <td
                      className={`num py-1.5 pl-3 text-right whitespace-nowrap ${isNum(c.tolerance_pct) && Math.abs(c.deviation_pct) > c.tolerance_pct ? 'text-warn' : 'text-ok'}`}
                    >
                      {signedPct(c.deviation_pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Popover>
      )}

      {isNum(le3) && mc.data && (
        <Popover
          width={420}
          align="start"
          trigger={
            <Badge
              tone="accent"
              icon={Percent}
              label={`Вероятность окупиться быстрее 3 лет — ${formatPct(le3, { share: true, digits: 0 })}`}
            />
          }
        >
          <div className="h3 mb-3">Разброс результата</div>
          <MonteCarloSummary result={mc.data} compact />
        </Popover>
      )}

      <Badge
        tone={fill.filled === fill.total ? 'ok' : 'warn'}
        icon={Database}
        label={`Данные объекта: заполнено ${fill.filled} из ${fill.total}`}
        onClick={() => setTrustOpen(true)}
      />

      {isNum(undocumented) && (
        <Badge
          tone={undocumented === 0 ? 'ok' : 'crit'}
          icon={Sigma}
          label={`${undocumented} недокументированных коэффициентов`}
          onClick={() => openTrace(calc.id)}
        />
      )}
    </div>
  )
}

// Rounded to whole percent; «−0 %» would read as a deviation, so zero loses its sign.
const signedPct = (value: number) => {
  const rounded = Math.round(value) || 0
  return `${rounded > 0 ? '+' : ''}${formatPct(rounded, { digits: 0 })}`
}

const checkValue = (value: number, unit: string | null | undefined) =>
  unit === '₽' ? formatRub(value) : formatValue(value, unit)

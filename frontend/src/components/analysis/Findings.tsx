import type { ReactNode } from 'react'
import type { ProcessDemand, ProjectParam } from '@/api/types'
import { displayValue } from '@/components/object/paramValue'
import { SourceDot } from '@/components/Provenance'
import { Check, Pill } from '@/components/ui'
import { formatNumber, formatPct, formatRub, isNum, pluralRu } from '@/lib/format'
import { MISSING_NOTE, lowerFirst, shortName, unitOf } from './process'

type Finding = { tone: 'ok' | 'warn'; text: ReactNode }

function composeFindings(processes: ProcessDemand[], main: ProcessDemand): Finding[] {
  const findings: Finding[] = []
  const name = shortName(main)
  const unit = unitOf(main)
  const fte = main.current?.fte
  const cost = main.current?.cost_rub_year

  if (isNum(cost) && cost > 0)
    findings.push({
      tone: 'warn',
      text: (
        <>
          {name}: {isNum(fte) && `${formatNumber(fte)} чел. в пересчёте на полную ставку, `}
          {formatRub(cost)} в год — главная статья затрат на персонал.
        </>
      ),
    })

  if (isNum(main.peak_per_hour) && isNum(main.avg_per_hour))
    findings.push(
      main.peak_per_hour > main.avg_per_hour
        ? {
            tone: 'warn',
            text: (
              <>
                {name} в пиковый час — {formatNumber(main.peak_per_hour)} {unit}/ч против{' '}
                {formatNumber(main.avg_per_hour)} в среднем. Количество роботов считаем под пик, а не под среднее.
              </>
            ),
          }
        : {
            tone: 'ok',
            text: (
              <>
                {name} идёт равномерно: {formatNumber(main.avg_per_hour)} {unit}/ч весь рабочий день.
              </>
            ),
          },
    )

  const robotizable = processes.filter((p) => p.robotizable)
  const manual = processes.filter((p) => !p.robotizable)
  const total = processes.length
  findings.push({
    tone: robotizable.length > 0 ? 'ok' : 'warn',
    text:
      manual.length === 0 ? (
        <>
          Все {total} {pluralRu(total, ['процесс', 'процесса', 'процессов'])} можно роботизировать — подбор ищет решения
          для каждого.
        </>
      ) : (
        <>
          {robotizable.length} из {total} {total === 1 ? 'процесса' : 'процессов'} можно роботизировать. Без роботов
          остаются: {manual.map((p) => lowerFirst(shortName(p))).join(', ')}.
        </>
      ),
  })

  const gaps = processes.filter((p) => p.notes?.some((n) => n.startsWith(MISSING_NOTE)))
  if (gaps.length > 0)
    findings.push({
      tone: 'warn',
      text: (
        <>
          Не хватает данных: {gaps.map((p) => lowerFirst(shortName(p))).join(', ')}. Уточните параметры на шаге «Объект»
          — оценка станет точнее.
        </>
      ),
    })

  return findings
}

export function Findings({ processes, main }: { processes: ProcessDemand[]; main: ProcessDemand }) {
  return (
    <section>
      <div className="h3 mb-3">Что это значит</div>
      <ul className="space-y-3">
        {composeFindings(processes, main).map((f, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[14px] leading-snug">
            <Check tone={f.tone} />
            <span>{f.text}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

type Requirement = { key: string; label: string; prefix?: string }

// Object constraints a robot must fit; only those present in this object type's parameters are shown.
const REQUIREMENT_PARAMS: Requirement[] = [
  { key: 'aisle_width_m', label: 'ширина рабочих проходов' },
  { key: 'corridor_width_m', label: 'ширина коридоров' },
  { key: 'ceiling_height_m', label: 'высота потолков' },
  { key: 'capex_budget_mln_rub', label: 'бюджет на роботизацию', prefix: '≤ ' },
  { key: 'sla_target_share', label: 'операций в срок', prefix: '≥ ' },
]

function requirementValue(param: ProjectParam, req: Requirement): string {
  if (param.key === 'sla_target_share' && isNum(param.value))
    return `${req.prefix}${formatPct(param.value, { share: true, digits: 0 })}`
  return `${req.prefix ?? ''}${displayValue(param)}`
}

export function Requirements({
  main,
  params,
  canMatch,
}: {
  main: ProcessDemand
  params: ProjectParam[]
  canMatch: boolean | undefined
}) {
  const byKey = new Map(params.map((p) => [p.key, p]))
  const found = REQUIREMENT_PARAMS.flatMap((req) => {
    const param = byKey.get(req.key)
    return param && param.value !== null && param.value !== '' ? [{ req, param }] : []
  }).slice(0, 3)

  return (
    <section className="rounded-[12px] bg-surface-2 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="h3">Требования к решению</span>
        {canMatch !== undefined && (
          <Pill tone={canMatch ? 'ok' : 'crit'}>
            {canMatch ? 'Данных хватает для подбора' : 'Есть ошибки в данных'}
          </Pill>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        {isNum(main.peak_per_hour) && (
          <div>
            <dt className="display num text-[20px]">
              ≥ {formatNumber(main.peak_per_hour)} <span className="text-[14px]">{unitOf(main)}/ч</span>
            </dt>
            <dd className="meta">{lowerFirst(shortName(main))} в пиковый час</dd>
          </div>
        )}
        {found.map(({ req, param }) => (
          <div key={req.key}>
            <dt className="display num text-[20px]">{requirementValue(param, req)}</dt>
            <dd className="meta flex items-center gap-1.5">
              {req.label}
              <SourceDot provenance={param.provenance} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

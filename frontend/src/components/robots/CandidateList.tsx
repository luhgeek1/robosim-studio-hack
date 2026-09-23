import { AnimatePresence, motion } from 'framer-motion'
import { Info } from 'lucide-react'
import type { Candidate } from '@/api/types'
import { Bar, Button, Hint, Pill, type Tone } from '@/components/ui'
import { formatNumber, formatRub, formatYears } from '@/lib/format'
import { useStore } from '@/store'
import { groupReasons, robotsText, shortName } from './model'
import { PassedList, RiskList } from './Reasons'

export type ChooseState = {
  // No main scenario yet: the next button builds it, so the card has nothing to choose into.
  enabled: boolean
  // The process already has a product in the scenario — choosing replaces it.
  replaces: boolean
  busy: boolean
}

const scoreTone = (score: number): Tone => (score >= 70 ? 'ok' : score >= 45 ? 'accent' : 'warn')

export function CandidateList({
  candidates,
  openId,
  scenarioProductId,
  choose,
  onOpen,
  onChoose,
}: {
  candidates: Candidate[]
  openId: string | undefined
  scenarioProductId: string | undefined
  choose: ChooseState
  onOpen: (productId: string) => void
  onChoose: (candidate: Candidate) => void
}) {
  return (
    <div className="card divide-y divide-line overflow-hidden">
      {candidates.map((c) => (
        <CandidateRow
          key={c.product.id}
          candidate={c}
          open={c.product.id === openId}
          inScenario={c.product.id === scenarioProductId}
          choose={choose}
          onOpen={() => onOpen(c.product.id)}
          onChoose={() => onChoose(c)}
        />
      ))}
    </div>
  )
}

function summary(c: Candidate): string {
  const parts = [c.product.subtype || c.product.solution_type_name, `от ${formatRub(c.product.price_from.amount_rub)}`]
  const n = c.estimate?.robots_count
  if (n != null) parts.push(`≈${robotsText(n)}`)
  if (c.estimate?.capex_rub != null) parts.push(`CAPEX ${formatRub(c.estimate.capex_rub)}`)
  return parts.filter(Boolean).join(' · ')
}

function CandidateRow({
  candidate: c,
  open,
  inScenario,
  choose,
  onOpen,
  onChoose,
}: {
  candidate: Candidate
  open: boolean
  inScenario: boolean
  choose: ChooseState
  onOpen: () => void
  onChoose: () => void
}) {
  const openProduct = useStore((s) => s.openProduct)
  const score = c.score ?? 0
  return (
    <div className="bg-surface transition-colors hover:bg-surface-2/60">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-5 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${open ? 'border-ink bg-ink' : 'border-line-2'}`}
        >
          {open && <span className="h-2 w-2 rounded-full bg-white" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[15px] font-semibold" title={c.product.name}>
              {shortName(c.product.name)}
            </span>
            {inScenario && <Pill tone="ok">в сценарии</Pill>}
            {c.status === 'check' && <Pill tone="warn">требует проверки ТТХ</Pill>}
            {c.status === 'manual' && <Pill tone="crit">добавлен вручную</Pill>}
          </span>
          <span className="mt-0.5 block text-[13px] text-ink-3">{summary(c)}</span>
        </span>
        <span className="flex w-[150px] shrink-0 items-center gap-3">
          <span className="flex-1">
            <Bar value={score} tone={scoreTone(score)} height={5} />
          </span>
          <span className="display num w-[56px] text-right text-[20px]">{formatNumber(score, 0)} %</span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <CandidateBody
              candidate={c}
              inScenario={inScenario}
              choose={choose}
              onDetails={() => openProduct(c.product.id)}
              onChoose={onChoose}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function CandidateBody({
  candidate: c,
  inScenario,
  choose,
  onDetails,
  onChoose,
}: {
  candidate: Candidate
  inScenario: boolean
  choose: ChooseState
  onDetails: () => void
  onChoose: () => void
}) {
  const groups = groupReasons(c)
  const risky = groups.blocking.length + groups.warnings.length + groups.missing.length
  const n = c.estimate?.robots_count
  return (
    <div className="px-5 pb-5 pl-[60px]">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <div className="mb-2 text-[13px] font-medium text-ink-2">Подходит потому что</div>
          <PassedList reasons={groups.passed} />
        </div>
        <div>
          <div className="mb-2 text-[13px] font-medium text-ink-2">
            {risky > 1 ? 'Ограничения и риски' : risky === 1 ? 'Риск' : 'Ограничения'}
          </div>
          <RiskList groups={groups} />
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <Button size="sm" onClick={onDetails}>
          Подробнее о роботе
        </Button>
        {choose.enabled &&
          (inScenario ? (
            <span className="text-[13px] font-medium text-ok">Это решение в сценарии</span>
          ) : (
            <Button size="sm" variant="primary" disabled={choose.busy} onClick={onChoose}>
              {choose.replaces ? 'Выбрать для сценария' : 'Добавить в сценарий'}
            </Button>
          ))}
        <span className="meta ml-auto flex items-center gap-1.5">
          {n != null ? (
            <>
              На вашем объекте: <span className="num font-medium text-ink">≈{robotsText(n)}</span>
              {c.estimate?.payback_years != null && (
                <span>
                  · окупаемость <span className="num text-ink-2">{formatYears(c.estimate.payback_years)}</span>
                </span>
              )}
            </>
          ) : (
            'Количество по спросу не оценивается — задаётся вручную'
          )}
          <Hint
            content={
              c.estimate?.note ??
              'Оценка по времени цикла и пиковому спросу; точное число даст имитация на планировке объекта.'
            }
          >
            <Info size={13} className="cursor-help text-ink-4" aria-label="Как оценено количество" />
          </Hint>
        </span>
      </div>
    </div>
  )
}

import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { formatValue } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import {
  DERIVATION_GROUPS,
  DERIVATION_INPUT_KIND_LABEL,
  type DerivationInput,
  type LayoutDerivationStep,
} from './labels'

const KIND_DOT: Record<DerivationInput['kind'], string> = {
  param: 'bg-ok',
  norm: 'bg-ink-4',
  metric: 'bg-info',
}

type Group = { title: string; steps: { step: LayoutDerivationStep; index: number }[] }

/* Every size of the plan is a formula over the object's parameters and norms: the groups follow what they size,
   the numbering follows the generator's order, so «из шага выше» can be traced back. */
export function Derivation({ steps }: { steps: LayoutDerivationStep[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const columns = splitColumns(groupSteps(steps))

  return (
    <div className="mt-14">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h2 className="h2">Как получена геометрия</h2>
          <p className="mt-1 text-[14px] text-ink-3">
            {steps.length} шагов: каждый размер — формула из параметров объекта и нормативов. Нажмите, чтобы увидеть
            подстановку.
          </p>
        </div>
        <div className="flex gap-4 text-[12.5px] text-ink-3">
          {(Object.keys(KIND_DOT) as DerivationInput['kind'][]).map((kind) => (
            <span key={kind} className="flex items-center gap-1.5">
              <span className={cn('size-2 rounded-full', KIND_DOT[kind])} />
              {DERIVATION_INPUT_KIND_LABEL[kind]}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {columns.map((column, i) => (
          <div key={i} className="space-y-4">
            {column.map((group) => (
              <section key={group.title} className="card overflow-hidden">
                <div className="flex items-baseline justify-between px-5 pt-4 pb-1.5">
                  <h3 className="text-[13px] text-ink-2">{group.title}</h3>
                  <span className="meta num">{group.steps.length}</span>
                </div>
                <ul className="divide-y divide-line">
                  {group.steps.map(({ step, index }) => (
                    <StepRow
                      key={step.key}
                      step={step}
                      index={index}
                      open={open === step.key}
                      onToggle={() => setOpen((prev) => (prev === step.key ? null : step.key))}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function StepRow({
  step,
  index,
  open,
  onToggle,
}: {
  step: LayoutDerivationStep
  index: number
  open: boolean
  onToggle: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          'group flex w-full items-center gap-3.5 px-5 py-3 text-left transition-colors',
          open ? 'bg-surface-2' : 'hover:bg-surface-2',
        )}
      >
        <span className="num w-5 shrink-0 text-[12px] text-ink-4">{index + 1}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] text-ink">{step.name}</span>
          <span className="mt-0.5 block truncate font-mono text-[11.5px] text-ink-3">{substitution(step)}</span>
        </span>
        <span className="num shrink-0 text-[15px] font-semibold tracking-[-0.01em]">
          {formatValue(step.value, step.unit)}
        </span>
        <ChevronDown
          size={15}
          className={cn('shrink-0 text-ink-4 transition-transform group-hover:text-ink-3', open && 'rotate-180')}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden bg-surface-2"
          >
            <div className="px-5 pt-1 pb-4 pl-13.5">
              <div className="rounded-lg bg-card px-3.5 py-3 font-mono text-[12px] leading-relaxed ring-1 ring-line">
                <div className="text-ink-3">{step.formula}</div>
                <div className="mt-1 font-medium text-ink">{step.formula_rendered}</div>
              </div>
              {step.inputs.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {step.inputs.map((input) => (
                    <li key={input.key} className="flex items-start gap-2.5 text-[12.5px]">
                      <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', KIND_DOT[input.kind])} />
                      <span className="min-w-0 flex-1">
                        <span className="text-ink-2">{input.name}</span>
                        <span className="ml-1.5 text-ink-4">{DERIVATION_INPUT_KIND_LABEL[input.kind]}</span>
                      </span>
                      <span className="num shrink-0 font-medium">{formatValue(input.value, input.unit)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  )
}

// «⌊(10 − 0,5) / 1,9⌋ = 5 шт» → «⌊(10 − 0,5) / 1,9⌋»: the result already stands on the right of the row.
function substitution(step: LayoutDerivationStep) {
  const text = step.formula_rendered
  const cut = text.lastIndexOf(' = ')
  return cut > 0 ? text.slice(0, cut) : text
}

function groupSteps(steps: LayoutDerivationStep[]): Group[] {
  const indexed = steps.map((step, index) => ({ step, index }))
  const known = new Set(DERIVATION_GROUPS.flatMap((g) => g.keys))
  const groups = DERIVATION_GROUPS.map((g) => ({
    title: g.title,
    steps: indexed.filter(({ step }) => g.keys.includes(step.key)),
  }))
  groups.push({ title: 'Прочее', steps: indexed.filter(({ step }) => !known.has(step.key)) })
  return groups.filter((g) => g.steps.length > 0)
}

// Greedy by row count: two columns of about the same height, groups keep their order inside a column.
function splitColumns(groups: Group[]): Group[][] {
  const columns: Group[][] = [[], []]
  const heights = [0, 0]
  for (const group of [...groups].sort((a, b) => b.steps.length - a.steps.length)) {
    const i = heights[0] <= heights[1] ? 0 : 1
    columns[i].push(group)
    heights[i] += group.steps.length + 1.5
  }
  const order = new Map(groups.map((g, i) => [g, i]))
  return columns
    .filter((c) => c.length > 0)
    .map((c) => c.sort((a, b) => order.get(a)! - order.get(b)!))
    .sort((a, b) => order.get(a[0])! - order.get(b[0])!)
}

import { useState } from 'react'
import type { ValidationIssue, ValidationReport } from '@/api/types'
import { pluralRu } from '@/lib/format'

const BLOCK_LABEL: Record<NonNullable<ValidationIssue['blocks']>[number], string> = {
  matching: 'подбор',
  calculation: 'расчёт',
  simulation: 'имитацию',
  report: 'отчёт',
}

const RANK: Record<ValidationIssue['severity'], number> = { error: 0, warning: 1, info: 2 }

const TONE: Record<ValidationIssue['severity'], string> = {
  error: 'bg-crit-soft text-crit',
  warning: 'bg-warn-soft text-warn',
  info: 'bg-black/[0.04] text-ink-2',
}

// A blank object can have dozens of missing fields: the first few are enough to act on, the rest stay one click away.
const VISIBLE = 3

const scrollToParam = (key: string) =>
  document.getElementById(`param-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })

export function ValidationIssues({ report }: { report: ValidationReport }) {
  const [all, setAll] = useState(false)
  if (report.issues.length === 0) return null
  const issues = [...report.issues].sort((a, b) => RANK[a.severity] - RANK[b.severity])
  const hidden = issues.length - VISIBLE
  return (
    <ul className="mt-5 space-y-1.5">
      {(all ? issues : issues.slice(0, VISIBLE)).map((issue, i) => (
        <li key={`${issue.key}-${issue.code}-${i}`}>
          <button
            type="button"
            onClick={() => scrollToParam(issue.key)}
            className={`w-full rounded-[9px] px-3 py-2 text-left text-[13px] leading-snug transition-opacity hover:opacity-85 ${TONE[issue.severity]}`}
          >
            <span className="font-medium">{issue.message}</span>
            {issue.how_to_fix && <span className="text-ink-2"> — {issue.how_to_fix}</span>}
            {issue.severity === 'error' && issue.blocks && issue.blocks.length > 0 && (
              <span className="mt-0.5 block text-[12px] opacity-80">
                Блокирует {issue.blocks.map((b) => BLOCK_LABEL[b]).join(', ')}
              </span>
            )}
          </button>
        </li>
      ))}
      {hidden > 0 && (
        <li>
          <button
            type="button"
            onClick={() => setAll((v) => !v)}
            className="px-1 text-[13px] font-medium text-accent hover:underline"
          >
            {all ? 'Свернуть замечания' : `Ещё ${hidden} ${pluralRu(hidden, ['замечание', 'замечания', 'замечаний'])}`}
          </button>
        </li>
      )}
    </ul>
  )
}

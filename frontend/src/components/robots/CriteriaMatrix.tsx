import { CRITERION_LABEL } from '@/api/matching'
import type { Candidate } from '@/api/types'
import { Bar, Hint, type Tone } from '@/components/ui'
import { formatNumber, formatPct } from '@/lib/format'
import { shortName } from './model'

const pointsTone = (points: number): Tone => (points >= 70 ? 'ok' : points >= 40 ? 'accent' : 'warn')

// ТЗ 3.4.5: every criterion with its weight, the points of each solution and — on hover — why and the contribution.
export function CriteriaMatrix({
  candidates,
  weights,
  openId,
  onOpen,
}: {
  candidates: Candidate[]
  weights: Record<string, number>
  openId: string | undefined
  onOpen: (productId: string) => void
}) {
  const criteria = Object.keys(weights)
  return (
    <div className="card overflow-hidden">
      <table className="w-full table-fixed text-[13px]">
        <colgroup>
          <col />
          {candidates.map((c) => (
            <col key={c.product.id} className="w-[100px]" />
          ))}
        </colgroup>
        <thead>
          <tr className="text-ink-3">
            <th className="px-4 py-3 text-left font-normal">Критерий</th>
            {candidates.map((c) => {
              const open = c.product.id === openId
              return (
                <th
                  key={c.product.id}
                  className={`px-1.5 py-3 text-center align-bottom font-medium ${open ? 'bg-accent-soft/40 text-ink' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => onOpen(c.product.id)}
                    className="line-clamp-2 w-full text-[12.5px] leading-tight hover:text-ink"
                    title={c.product.name}
                  >
                    {shortName(c.product.name)}
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {criteria.map((key) => (
            <tr key={key}>
              <td className="px-4 py-2 text-ink-2">
                {CRITERION_LABEL[key] ?? key}
                <span className="num block text-[11.5px] text-ink-4">
                  вес {formatPct(weights[key], { share: true, digits: 0 })}
                </span>
              </td>
              {candidates.map((c) => {
                const part = c.score_breakdown?.find((s) => s.criterion === key)
                const open = c.product.id === openId
                return (
                  <td key={c.product.id} className={`px-3 py-2.5 ${open ? 'bg-accent-soft/40' : ''}`}>
                    {part ? (
                      <Hint
                        content={
                          <div className="space-y-1">
                            <div className="font-medium">{part.name}</div>
                            <div>{part.explanation}</div>
                            <div className="opacity-75">
                              {formatNumber(part.points, 0)} баллов × вес{' '}
                              {formatPct(part.weight, { share: true, digits: 0 })}
                              {part.contribution != null && ` = вклад ${formatNumber(part.contribution, 1)} в балл`}
                            </div>
                          </div>
                        }
                      >
                        <div className="cursor-help">
                          <div className="num mb-1 text-center text-[13px] font-medium">
                            {formatNumber(part.points, 0)}
                          </div>
                          <Bar value={part.points} tone={pointsTone(part.points)} height={3} />
                        </div>
                      </Hint>
                    ) : (
                      <div className="text-center text-ink-4">—</div>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
          <tr className="bg-surface-2">
            <td className="px-4 py-3 font-medium">Итоговый балл</td>
            {candidates.map((c) => (
              <td
                key={c.product.id}
                className={`num px-2 py-3 text-center text-[15px] font-semibold ${c.product.id === openId ? 'bg-accent-soft/40' : ''}`}
              >
                {c.score != null ? formatNumber(c.score, 0) : '—'}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

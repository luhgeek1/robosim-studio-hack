import { DataQualityBar, useDataQuality } from '@/entities/project'
import { ProvenanceBadge } from '@/entities/provenance'
import type { DataQualityReport, ProvenanceStatus } from '@/shared/api/types'
import { formatPct } from '@/shared/lib/format'
import { Section } from '@/shared/ui/page'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { ToneBadge, type Tone } from '@/shared/ui/tone'
import { scrollToParam } from './scroll'

type Item = DataQualityReport['items'][number]

const IMPACT_RANK: Record<Item['impact'], number> = { high: 0, medium: 1, low: 2, unknown: 3 }
const IMPACT_LABEL: Record<Item['impact'], string> = {
  high: 'сильно влияет',
  medium: 'влияет',
  low: 'слабо влияет',
  unknown: '',
}
const IMPACT_TONE: Record<Item['impact'], Tone> = { high: 'crit', medium: 'warn', low: 'muted', unknown: 'muted' }
const STATUS_RANK: Partial<Record<ProvenanceStatus, number>> = { missing: 0, assumption: 1, default: 2 }
const LIMIT = 8

export function TrustPanel({ projectId }: { projectId: string }) {
  const quality = useDataQuality(projectId)

  if (quality.isPending) return <LoadingBlock rows={2} />
  if (quality.error) return <ErrorBlock error={quality.error} onRetry={() => quality.refetch()} />

  const { summary, items } = quality.data
  const toClarify = items
    .filter((i) => STATUS_RANK[i.status] !== undefined && (i.impact !== 'low' || i.status === 'missing'))
    .sort(
      (a, b) =>
        IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact] || (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9),
    )
  // Without a sensitivity run every impact is "unknown": then show only real gaps (missing, assumptions), not defaults.
  const noImpact = items.every((i) => i.impact === 'unknown')
  const list = (noImpact ? toClarify.filter((i) => i.status !== 'default') : toClarify).slice(0, LIMIT)
  const total = noImpact ? toClarify.filter((i) => i.status !== 'default').length : toClarify.length

  return (
    <Section title="Панель доверия" description="Откуда взяты параметры объекта и что стоит уточнить в первую очередь">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="num shrink-0 text-2xl font-semibold tracking-tight whitespace-nowrap">
          {formatPct(summary.score, { share: true, digits: 0 })}
        </span>
        <span className="text-xs text-muted-foreground">
          индекс доверия — взвешенная доля введённых и подтверждённых значений среди влияющих на результат
        </span>
      </div>
      <DataQualityBar summary={summary} />

      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="font-medium">Что стоит уточнить</h3>
          {total > LIMIT && (
            <span className="text-xs text-muted-foreground">
              показаны {LIMIT} из {total}
            </span>
          )}
        </div>
        {list.length === 0 ? (
          <p className="text-muted-foreground">Пропусков и допущений среди важных параметров нет.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
            {list.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => scrollToParam(item.key)}
                  className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted"
                  title={item.source_title ? `${item.name} · ${item.source_title}` : item.name}
                >
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {item.impact !== 'unknown' && (
                    <ToneBadge tone={IMPACT_TONE[item.impact]}>{IMPACT_LABEL[item.impact]}</ToneBadge>
                  )}
                  <ProvenanceBadge status={item.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {noImpact && (
          <p className="mt-2 text-xs text-muted-foreground">
            Оценки влияния параметров на результат пока нет, поэтому порядок такой: сначала «нет данных», затем
            допущения.
          </p>
        )}
      </div>
    </Section>
  )
}

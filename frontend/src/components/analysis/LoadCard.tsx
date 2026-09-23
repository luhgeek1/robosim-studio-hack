import type { ProcessDemand } from '@/api/types'
import { HourlyLoadChart } from '@/components/HourlyLoadChart'
import { SourceDot } from '@/components/Provenance'
import { Select } from '@/components/ui'
import { formatNumber, isNum } from '@/lib/format'
import { shortName, unitOf } from './process'

export function LoadCard({
  processes,
  selected,
  onSelect,
  peakFactor,
}: {
  processes: ProcessDemand[]
  selected: ProcessDemand
  onSelect: (key: string) => void
  peakFactor?: number | null
}) {
  const unit = unitOf(selected)
  const profile = selected.hourly_profile ?? []
  const hasFlow = isNum(selected.avg_per_hour) && isNum(selected.peak_per_hour)

  return (
    <div id="load-card" className="card scroll-mt-24 p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="h3">Нагрузка по часам суток</div>
          <div className="meta mt-0.5">доля суточного объёма по часам, %</div>
        </div>
        <Select
          ariaLabel="Процесс"
          value={selected.process_key}
          onChange={onSelect}
          options={processes.map((p) => ({ value: p.process_key, label: shortName(p) }))}
          className="!h-8 !w-auto max-w-[280px] !text-[13px]"
        />
      </div>

      {profile.length > 0 ? (
        <HourlyLoadChart profile={profile} />
      ) : (
        <div className="flex min-h-[250px] flex-col justify-center rounded-[12px] bg-surface-2 px-6 py-6">
          <p className="max-w-[520px] text-[14px] leading-relaxed text-ink-2">
            Почасового профиля для этого процесса нет.{' '}
            {isNum(peakFactor)
              ? `Пиковый час оценён через пиковый коэффициент ×${formatNumber(peakFactor)} к среднему часу.`
              : 'Пиковый и средний час взяты из параметров объекта.'}
          </p>
          {hasFlow && (
            <div className="mt-5 flex gap-10">
              <div>
                <div className="display num text-[28px]">{formatNumber(selected.avg_per_hour)}</div>
                <div className="meta">{unit}/ч в среднем</div>
              </div>
              <div>
                <div className="display num text-[28px] text-warn">{formatNumber(selected.peak_per_hour)}</div>
                <div className="meta">{unit}/ч в пиковый час</div>
              </div>
            </div>
          )}
        </div>
      )}

      {hasFlow && (
        <div className="hairline mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 pt-3 text-[13px] text-ink-2">
          <span>
            Пиковый час — <span className="num font-medium text-ink">{formatNumber(selected.peak_per_hour)}</span>{' '}
            {unit}/ч, в среднем —{' '}
            <span className="num font-medium text-ink">{formatNumber(selected.avg_per_hour)}</span> {unit}/ч
          </span>
          {selected.profile_provenance && (
            <span className="ml-auto flex items-center gap-1.5 text-[12.5px] text-ink-3">
              <SourceDot provenance={selected.profile_provenance} />
              откуда профиль
            </span>
          )}
        </div>
      )}
    </div>
  )
}

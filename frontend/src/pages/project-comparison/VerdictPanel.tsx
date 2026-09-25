import { TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { BAND_LABEL, VerdictBadge } from '@/entities/scenario'
import type { ComparisonTable } from '@/shared/api/types'

/* Why the recommended option wins: the rationale and the drivers on the left, the caveats aside —
   the same two-column card as a process on «Где деньги». */
export function VerdictPanel({ table }: { table: ComparisonTable }) {
  const { verdict, recommendation } = table
  const recommended = table.scenarios.find((s) => s.scenario_id === recommendation?.scenario_id)
  const band = BAND_LABEL[verdict.band]
  const caveats = [...(verdict.caveats ?? []), ...(recommendation?.caveats ?? [])]

  return (
    <article className="card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5 pb-4">
        <h2 className="h3 text-[18px]">{recommended ? `Почему «${recommended.name}»` : 'Рекомендовать нечего'}</h2>
        <div className="flex items-center gap-2">
          {band && <span className="meta">{band}</span>}
          <VerdictBadge verdict={verdict.verdict} />
        </div>
      </header>

      <div className="hairline grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-6 px-6 py-5">
          {recommended ? (
            !!recommendation?.rationale?.length && (
              <Block title="Чем лучше остальных">
                {recommendation.rationale.map((r) => (
                  <Item key={r} marker={<span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink" />}>
                    <span className="text-ink">{r}</span>
                  </Item>
                ))}
              </Block>
            )
          ) : (
            <p className="flex gap-2 text-[13.5px] text-ink-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
              Ни один сценарий роботизации не окупается в горизонте расчёта.
            </p>
          )}

          {!!verdict.key_drivers?.length && (
            <Block title="Что определяет результат">
              {verdict.key_drivers.map((d, i) => (
                <Item key={d} marker={<span className="num w-4 shrink-0 text-[12.5px] text-ink-4">{i + 1}</span>}>
                  {d}
                </Item>
              ))}
            </Block>
          )}
        </div>

        <div className="flex flex-col border-t border-line bg-surface-2/60 px-6 py-5 lg:border-t-0 lg:border-l">
          {caveats.length > 0 && (
            <Block title="Оговорки">
              {caveats.map((c) => (
                <Item key={c} marker={<span className="mt-2 size-1 shrink-0 rounded-full bg-ink-4" />}>
                  <span className="text-ink-3">{c}</span>
                </Item>
              ))}
            </Block>
          )}
          <p className="meta mt-auto pt-5">Предварительная оценка — требует верификации при обследовании объекта.</p>
        </div>
      </div>
    </article>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2.5 text-[13px] text-ink-2">{title}</div>
      <ul className="space-y-2">{children}</ul>
    </div>
  )
}

function Item({ marker, children }: { marker: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-2.5 text-[13.5px] leading-relaxed text-ink-2">
      {marker}
      <span className="min-w-0">{children}</span>
    </li>
  )
}

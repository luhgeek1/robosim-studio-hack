import { ArrowRight, Info, Star, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { BAND_LABEL, SCENARIO_KIND_LABEL, VerdictBadge } from '@/entities/scenario'
import type { ComparisonTable } from '@/shared/api/types'
import { Section } from '@/shared/ui/page'

export function VerdictPanel({ table }: { table: ComparisonTable }) {
  const { verdict, recommendation } = table
  const recommended = table.scenarios.find((s) => s.scenario_id === recommendation?.scenario_id)
  const band = BAND_LABEL[verdict.band]

  return (
    <div className="grid grid-cols-[1.4fr_1fr] items-start gap-6">
      <Section className="border-l-2 border-l-primary">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <VerdictBadge verdict={verdict.verdict} />
          {band && <span className="text-xs text-muted-foreground">{band}</span>}
        </div>
        <h2 className="text-lg leading-snug font-semibold">{verdict.headline}</h2>
        <p className="mt-2 text-muted-foreground">{verdict.summary}</p>

        {!!verdict.key_drivers?.length && (
          <div className="mt-4">
            <div className="mb-1 text-xs text-muted-foreground">Что определяет результат</div>
            <ul className="space-y-1">
              {verdict.key_drivers.map((d) => (
                <li key={d} className="flex gap-2">
                  <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-info" />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!!verdict.caveats?.length && (
          <div className="mt-4">
            <div className="mb-1 text-xs text-muted-foreground">Оговорки</div>
            <ul className="space-y-1 text-muted-foreground">
              {verdict.caveats.map((c) => (
                <li key={c} className="flex gap-2">
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Предварительная оценка — результат требует верификации при обследовании объекта.
        </p>
      </Section>

      <Section title="Рекомендация">
        {recommended ? (
          <div className="space-y-3">
            <div className="rounded-md border border-info/30 bg-info-soft p-3">
              <div className="flex items-center gap-1.5 text-xs text-info">
                <Star className="size-3.5 fill-current" /> Рекомендуемый сценарий
              </div>
              <Link
                to={`../scenarios/${recommended.scenario_id}`}
                className="mt-1 block text-base font-semibold hover:underline"
              >
                {recommended.name}
              </Link>
              <div className="text-xs text-muted-foreground">{SCENARIO_KIND_LABEL[recommended.kind]}</div>
            </div>
            {!!recommendation?.rationale?.length && (
              <ul className="list-disc space-y-1 pl-4">
                {recommendation.rationale.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="flex gap-2 text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
            Ни один сценарий роботизации не окупается в горизонте расчёта — рекомендовать нечего.
          </div>
        )}
        {!!recommendation?.caveats?.length && (
          <ul className="mt-3 space-y-1 text-muted-foreground">
            {recommendation.caveats.map((c) => (
              <li key={c} className="flex gap-2">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

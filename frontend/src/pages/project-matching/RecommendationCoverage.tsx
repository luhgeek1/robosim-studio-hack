import { Link } from 'react-router'
import type { MatchingResult } from '@/shared/api/types'

export function RecommendationCoverage({ projectId, matching }: { projectId: string; matching: MatchingResult }) {
  const selected = matching.processes.filter((p) => p.recommended_product_id)
  return (
    <section className="mb-6 space-y-3" aria-label="Состав рекомендации">
      <h2 className="h2">
        Автоподбор: {selected.length} из {matching.processes.length} процессов
      </h2>
      <p className="max-w-3xl text-sm text-ink-3">
        На каждый процесс выбирается одно решение с положительным NPV покупки. NPV показывает, покрывает ли денежный
        эффект вложения с учётом срока и ставки. Если таких решений нет, алгоритм может показать вариант с положительным
        годовым эффектом и наименьшим убытком. Остальные решения доступны для своих сценариев ниже.
      </p>
      <details className="rounded-xl border border-line bg-card px-5 py-4">
        <summary className="cursor-pointer font-medium">Почему процессы вошли или не вошли в рекомендацию</summary>
        <ul className="mt-3 divide-y divide-line">
          {matching.processes.map((p) => (
            <li key={p.process_key} className="grid gap-2 py-3 md:grid-cols-[15rem_1fr]">
              <Link
                className="text-sm font-medium hover:underline"
                to={`/projects/${projectId}/matching?process=${p.process_key}#candidates`}
              >
                {p.name}
                <span className="mt-1 block text-xs text-ink-3">
                  {p.recommended_product_id ? 'Включён в автоподбор' : 'Не включён в автоподбор'}
                </span>
              </Link>
              <p className="text-sm text-ink-3">
                {p.selection_reason ?? p.no_fit_message ?? 'Посмотрите данные кандидатов.'}
              </p>
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}

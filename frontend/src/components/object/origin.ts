import type { Project, ProjectParam, Source } from '@/api/types'
import { formatDate, pluralRu } from '@/lib/format'

export const IMPORT_ACCEPT = '.xlsx,.csv,.json'

type Origin = { title: string; detail: string }

function mostCommon(sources: Source[]): Source | undefined {
  const counts = new Map<string, { source: Source; n: number }>()
  for (const s of sources) counts.set(s.id, { source: s, n: (counts.get(s.id)?.n ?? 0) + 1 })
  return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.source
}

// Where the object's numbers came from: the last uploaded file if any, otherwise the organizer dataset or defaults.
export function dataOrigin(project: Project, params: ProjectParam[]): Origin & { fromFile: boolean } {
  const imported = params.filter((p) => p.provenance.status === 'imported' && p.provenance.source)
  if (imported.length > 0) {
    const file = [...imported]
      .map((p) => p.provenance.source!)
      .sort((a, b) => (b.retrieved_at ?? '').localeCompare(a.retrieved_at ?? ''))[0]
    const n = imported.length
    return {
      fromFile: true,
      title: file.title,
      detail: `${n} ${pluralRu(n, ['параметр', 'параметра', 'параметров'])} из файла${file.retrieved_at ? ` · ${formatDate(file.retrieved_at)}` : ''}`,
    }
  }
  const dataset = mostCommon(
    params.filter((p) => p.provenance.status === 'default').flatMap((p) => p.provenance.source ?? []),
  )
  return {
    fromFile: false,
    title: project.is_demo ? 'Демо-данные организатора' : 'Значения по умолчанию',
    detail: dataset?.title ?? 'справочник нормативов',
  }
}

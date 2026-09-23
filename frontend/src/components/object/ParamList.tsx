import { useMemo, useState } from 'react'
import type { ParameterGroup, ProjectParam } from '@/api/types'
import { Segmented } from '@/components/ui'
import { ParamRow } from './ParamRow'
import { needsAttention } from './paramValue'

type Filter = 'all' | 'attention'

type GroupView = { key: string; name: string; params: ProjectParam[] }

export function ParamList({
  projectId,
  params,
  groups,
  processNames,
}: {
  projectId: string
  params: ProjectParam[]
  groups: ParameterGroup[]
  processNames: Map<string, string>
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const attention = params.filter(needsAttention).length

  const views = useMemo<GroupView[]>(() => {
    const ordered = [...groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    const known = new Set(ordered.map((g) => g.key))
    const extra = [...new Set(params.map((p) => p.group))].filter((key) => !known.has(key))
    return [...ordered.map((g) => ({ key: g.key, name: g.name })), ...extra.map((key) => ({ key, name: key }))]
      .map((group) => ({
        ...group,
        params: params
          .filter((p) => p.group === group.key && (filter === 'all' || needsAttention(p)))
          .sort((a, b) => (a.definition?.order ?? 0) - (b.definition?.order ?? 0)),
      }))
      .filter((group) => group.params.length > 0)
  }, [params, groups, filter])

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          size="sm"
          layoutId="object-param-filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `Все · ${params.length}` },
            {
              value: 'attention',
              label: `Допущения и пропуски · ${attention}`,
              hint: 'Показать только допущения команды, пропуски и значения с замечаниями',
            },
          ]}
        />
        <span className="meta">нажмите на значение, чтобы исправить</span>
      </div>

      {views.length === 0 ? (
        <p className="mt-5 rounded-[12px] border border-dashed border-line px-4 py-6 text-center text-[13.5px] text-ink-3">
          Допущений и пропусков не осталось — все значения введены или взяты из справочника с источником.
        </p>
      ) : (
        <div className="mt-5 gap-x-8 sm:columns-2">
          {views.map((group) => (
            <section key={group.key} className="mb-7 break-inside-avoid">
              <div className="h3 mb-1.5">{group.name}</div>
              <dl className="divide-y divide-line">
                {group.params.map((param) => (
                  <ParamRow key={param.key} projectId={projectId} param={param} processNames={processNames} />
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

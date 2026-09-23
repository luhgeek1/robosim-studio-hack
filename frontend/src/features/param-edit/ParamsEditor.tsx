import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ParameterGroup, ProjectParam } from '@/shared/api/types'
import { pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Input } from '@/shared/ui/input'
import { EmptyState } from '@/shared/ui/states'
import { ToneDot } from '@/shared/ui/tone'
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group'
import { PARAM_GRID, ParamRow } from './ParamRow'

type Filter = 'all' | 'attention' | 'edited'

const FILTER_LABEL: Record<Filter, string> = {
  all: 'Все',
  attention: 'Допущения и нет данных',
  edited: 'Введённые',
}

const needsAttention = (p: ProjectParam) =>
  p.provenance.status === 'assumption' || p.provenance.status === 'missing' || p.validation.status !== 'ok'

const isEdited = (p: ProjectParam) => p.provenance.status === 'user' || p.provenance.status === 'imported'

type GroupView = { key: string; name: string; params: ProjectParam[]; total: number; issues: number }

export function ParamsEditor({
  projectId,
  params,
  groups,
}: {
  projectId: string
  params: ProjectParam[]
  groups: ParameterGroup[]
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const views = useMemo<GroupView[]>(() => {
    const needle = query.trim().toLowerCase()
    const match = (p: ProjectParam) =>
      (filter === 'all' || (filter === 'attention' ? needsAttention(p) : isEdited(p))) &&
      (!needle || p.name.toLowerCase().includes(needle) || (p.definition?.hint ?? '').toLowerCase().includes(needle))

    const ordered = [...groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    const known = new Set(ordered.map((g) => g.key))
    const extra = [...new Set(params.map((p) => p.group))].filter((key) => !known.has(key))
    const all = [...ordered.map((g) => ({ key: g.key, name: g.name })), ...extra.map((key) => ({ key, name: key }))]

    return all
      .map((group) => {
        const inGroup = params
          .filter((p) => p.group === group.key)
          .sort((a, b) => (a.definition?.order ?? 0) - (b.definition?.order ?? 0))
        return {
          ...group,
          params: inGroup.filter(match),
          total: inGroup.length,
          issues: inGroup.filter((p) => p.validation.status !== 'ok').length,
        }
      })
      .filter((g) => g.total > 0)
  }, [params, groups, filter, query])

  const shown = views.reduce((sum, g) => sum + g.params.length, 0)

  return (
    <div className="grid grid-cols-[11.5rem_minmax(0,1fr)] items-start gap-6">
      <nav className="sticky top-16 space-y-2" aria-label="Группы параметров">
        <div className="px-2 text-xs text-muted-foreground">Группы</div>
        <ul className="space-y-0.5">
          {views.map((group) => (
            <li key={group.key}>
              <button
                type="button"
                disabled={group.params.length === 0}
                onClick={() =>
                  document.getElementById(`group-${group.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-raised disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <span className="min-w-0 flex-1 leading-snug">{group.name}</span>
                {group.issues > 0 && <ToneDot tone="warn" />}
                <span className="num text-xs text-muted-foreground">
                  {filter === 'all' && !query ? group.total : `${group.params.length}/${group.total}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={filter}
            onValueChange={(value) => value && setFilter(value as Filter)}
          >
            {(Object.keys(FILTER_LABEL) as Filter[]).map((key) => (
              <ToggleGroupItem
                key={key}
                value={key}
                className="data-[state=on]:border-primary/40 data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
              >
                {FILTER_LABEL[key]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="relative w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти параметр"
              className="pl-8"
            />
          </div>
          <span className="ml-auto text-xs text-muted-foreground">
            <span className="num">{shown}</span> из <span className="num">{params.length}</span> · сохраняется по Enter
            или при выходе из поля
          </span>
        </div>

        {shown === 0 && (
          <EmptyState
            title="Нет параметров под фильтр"
            description={filter === 'attention' ? 'Допущений и пропусков не осталось.' : 'Измените фильтр или поиск.'}
          />
        )}

        {views
          .filter((group) => group.params.length > 0)
          .map((group) => (
            <section key={group.key} id={`group-${group.key}`} className="scroll-mt-16 rounded-lg border bg-surface">
              <header className="flex items-baseline justify-between gap-3 border-b px-4 py-3">
                <h2 className="text-[15px] font-semibold">{group.name}</h2>
                <span className="text-xs text-muted-foreground">
                  <span className="num">{group.total}</span>{' '}
                  {pluralRu(group.total, ['параметр', 'параметра', 'параметров'])}{' '}
                  {group.issues > 0 && (
                    <>
                      · замечаний <span className="num text-warn">{group.issues}</span>
                    </>
                  )}
                </span>
              </header>
              <div className={cn(PARAM_GRID, 'border-b bg-raised/60 py-1.5 pr-2 pl-3.5 text-xs text-muted-foreground')}>
                <span>Параметр</span>
                <span>Значение</span>
                <span>Диапазон и пример</span>
                <span className="text-right">Источник</span>
              </div>
              <div className="divide-y">
                {group.params.map((param) => (
                  <ParamRow key={param.key} projectId={projectId} param={param} />
                ))}
              </div>
            </section>
          ))}
      </div>
    </div>
  )
}

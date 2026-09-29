import { AnimatePresence, motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ParameterGroup, ProjectParam } from '@/shared/api/types'
import { pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { EmptyState } from '@/shared/ui/states'
import { Segmented } from '@/shared/ui/v0'
import { ParamRow } from './ParamRow'
import { SlideHighlight, SlideMark } from '@/shared/ui/slide-highlight'

type Filter = 'all' | 'attention' | 'edited'

const needsAttention = (p: ProjectParam) =>
  p.provenance.status === 'assumption' || p.provenance.status === 'missing' || p.validation.status !== 'ok'

const isEdited = (p: ProjectParam) => p.provenance.status === 'user' || p.provenance.status === 'imported'

type GroupView = { key: string; name: string; params: ProjectParam[]; total: number; flagged: number }

// Сколько пикселей сверху занимают шапка и плашка шагов: раздел считается текущим, когда дошёл до этой линии.
const SPY_OFFSET = 170

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
          flagged: inGroup.filter(needsAttention).length,
        }
      })
      .filter((g) => g.total > 0)
  }, [params, groups, filter, query])

  const visible = views.filter((group) => group.params.length > 0)
  const shown = visible.reduce((sum, g) => sum + g.params.length, 0)
  const attention = params.filter(needsAttention).length
  const edited = params.filter(isEdited).length
  const active = useActiveGroup(visible.map((g) => g.key))

  return (
    <div className="grid grid-cols-[13rem_minmax(0,1fr)] items-start gap-8">
      <nav className="sticky top-40 space-y-0.5" aria-label="Разделы параметров">
        <SlideHighlight className="rounded-lg bg-white shadow-[0_1px_2px_rgba(20,20,24,0.06),0_0_0_1px_rgba(20,20,24,0.04)]" />
        {views.map((group) => {
          const empty = group.params.length === 0
          const current = group.key === active
          return (
            <button
              key={group.key}
              type="button"
              disabled={empty}
              onClick={() =>
                document.getElementById(`group-${group.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className={cn(
                'relative flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors disabled:opacity-35',
                current ? 'text-ink' : 'text-ink-3 hover:text-ink',
              )}
            >
              {current && <SlideMark />}
              <span className="relative min-w-0 flex-1 leading-snug">{group.name}</span>
              {group.flagged > 0 && <span className="relative size-1.5 shrink-0 rounded-full bg-warn" />}
              <span className="num relative text-[12px] text-ink-4">
                {filter === 'all' && !query ? group.total : `${group.params.length}/${group.total}`}
              </span>
            </button>
          )
        })}
      </nav>

      <div className="min-w-0">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Segmented
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Все' },
              { value: 'attention', label: `Требуют внимания · ${attention}` },
              { value: 'edited', label: `Введённые · ${edited}` },
            ]}
          />
          <label className="relative flex h-8 w-64 items-center rounded-lg bg-black/5 transition-colors focus-within:bg-white focus-within:shadow-[0_0_0_1px_rgba(20,20,24,0.12)]">
            <Search className="pointer-events-none absolute left-3 size-3.5 text-ink-3" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Найти параметр"
              className="h-full w-full bg-transparent pr-8 pl-8.5 text-[13px] outline-none placeholder:text-ink-3"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 text-ink-3 hover:text-ink"
                aria-label="Очистить поиск"
              >
                <X className="size-3.5" />
              </button>
            )}
          </label>
          {(filter !== 'all' || query) && (
            <span className="meta ml-auto">
              <span className="num">{shown}</span> из <span className="num">{params.length}</span>
            </span>
          )}
        </div>

        {shown === 0 && (
          <EmptyState
            title="Нет параметров под фильтр"
            description={filter === 'attention' ? 'Допущений и пропусков не осталось.' : 'Измените фильтр или поиск.'}
          />
        )}

        <div className="space-y-5">
          <AnimatePresence initial={false}>
            {visible.map((group) => (
              <motion.section
                key={group.key}
                id={`group-${group.key}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="card scroll-mt-40 overflow-hidden"
              >
                <header className="flex items-baseline justify-between gap-4 px-6 pt-5 pb-2">
                  <h3 className="h3 text-[18px]">{group.name}</h3>
                  <span className="meta">
                    <span className="num">{group.total}</span>{' '}
                    {pluralRu(group.total, ['параметр', 'параметра', 'параметров'])}
                    {group.flagged > 0 && (
                      <>
                        {' · '}
                        <span className="text-warn">
                          <span className="num">{group.flagged}</span> требуют внимания
                        </span>
                      </>
                    )}
                  </span>
                </header>
                <div className="divide-y divide-line">
                  {group.params.map((param) => (
                    <ParamRow key={param.key} projectId={projectId} param={param} />
                  ))}
                </div>
              </motion.section>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

/* Раздел, до которого дочитали: последний, чья шапка поднялась выше линии под плашкой шагов. */
function useActiveGroup(keys: string[]) {
  const [active, setActive] = useState<string | undefined>(keys[0])
  const signature = keys.join('|')
  useEffect(() => {
    const list = signature ? signature.split('|') : []
    let frame = 0
    const update = () => {
      frame = 0
      let current = list[0]
      for (const key of list) {
        const top = document.getElementById(`group-${key}`)?.getBoundingClientRect().top
        if (top !== undefined && top - SPY_OFFSET <= 0) current = key
      }
      // У самого низа страницы последний короткий раздел может так и не дойти до линии.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4)
        current = list.at(-1) ?? current
      setActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [signature])
  return active
}

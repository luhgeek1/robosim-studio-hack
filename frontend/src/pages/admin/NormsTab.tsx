import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ExternalLink, RotateCcw, Search, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { NORM_CATEGORY_LABEL, NORM_CATEGORY_ORDER, useNormSets, useNormsVersion } from '@/entities/admin'
import { SOURCE_KIND_LABEL } from '@/entities/provenance/labels'
import type { Norm, NormCategory } from '@/shared/api/types'
import { formatDate, formatNumber, formatValue, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { EmptyState, ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { SPRING, stagger } from './motion'
import { parseNumber } from './parse'
import { PublishDialog } from './PublishDialog'
import { SlideHighlight, SlideMark } from '@/shared/ui/slide-highlight'

export type Draft = Record<string, number>
const ALL = 'all'

export function NormsTab() {
  const sets = useNormSets()
  const current = sets.data?.find((s) => s.is_current)
  const [viewed, setViewed] = useState<string | undefined>()
  const version = viewed ?? current?.version
  const norms = useNormsVersion(version)
  const editable = Boolean(current && version === current.version)

  const [category, setCategory] = useState<string>(ALL)
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<Draft>({})
  const [open, setOpen] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)

  const items = norms.data?.items
  const counts = useMemo(() => {
    const result: Partial<Record<NormCategory, number>> = {}
    for (const norm of items ?? []) result[norm.category] = (result[norm.category] ?? 0) + 1
    return result
  }, [items])
  const needle = search.trim().toLowerCase()
  const visible = (items ?? []).filter(
    (n) =>
      (category === ALL || n.category === category) &&
      (!needle || n.name.toLowerCase().includes(needle) || n.key.includes(needle)),
  )
  const groups = NORM_CATEGORY_ORDER.map((cat) => ({ cat, norms: visible.filter((n) => n.category === cat) })).filter(
    (g) => g.norms.length > 0,
  )
  const changes = (items ?? []).filter((n) => draft[n.key] !== undefined && draft[n.key] !== n.value)

  const setValue = (key: string, value: number | null) =>
    setDraft((prev) => {
      const next = { ...prev }
      if (value === null) delete next[key]
      else next[key] = value
      return next
    })

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative w-72 max-w-full max-sm:w-full">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-4" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Название или ключ норматива"
              className="h-9 rounded-[10px] bg-card pl-9"
              aria-label="Поиск норматива"
            />
          </div>
          {!editable && version && (
            <span className="rounded-full bg-black/5 px-3 py-1 text-[12.5px] text-ink-2">
              Архивная версия {version} — только просмотр
            </span>
          )}
        </div>

        <div className="relative mb-5 flex flex-wrap gap-1" role="tablist">
          <SlideHighlight className="rounded-full bg-ink" transition={SPRING} />
          {[ALL, ...NORM_CATEGORY_ORDER.filter((c) => counts[c])].map((cat) => {
            const active = category === cat
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(cat)}
                className={cn(
                  'relative flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors',
                  active ? 'text-white' : 'text-ink-3 hover:bg-black/5 hover:text-ink',
                )}
              >
                {active && <SlideMark />}
                <span className="relative">{cat === ALL ? 'Все' : NORM_CATEGORY_LABEL[cat as NormCategory]}</span>
                <span className={cn('num relative text-[11.5px]', active ? 'text-white/60' : 'text-ink-4')}>
                  {cat === ALL ? (items?.length ?? 0) : counts[cat as NormCategory]}
                </span>
              </button>
            )
          })}
        </div>

        {(sets.isPending || norms.isPending) && <LoadingBlock label="Загружаем нормативы…" />}
        {norms.isError && <ErrorBlock error={norms.error} onRetry={() => norms.refetch()} />}
        {items && groups.length === 0 && <EmptyState title="Ничего не нашли" description="Измените запрос." />}
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.cat} className="card overflow-hidden">
              <div className="flex items-baseline justify-between border-b border-line bg-surface-2 px-4 py-2.5 sm:px-5">
                <h2 className="text-[13.5px] font-semibold">{NORM_CATEGORY_LABEL[group.cat]}</h2>
                <span className="num text-[12px] text-ink-3">{group.norms.length}</span>
              </div>
              <ul className="divide-y divide-line">
                {group.norms.map((norm, i) => (
                  <NormRow
                    key={norm.key}
                    norm={norm}
                    index={i}
                    editable={editable}
                    open={open === norm.key}
                    onToggle={() => setOpen(open === norm.key ? null : norm.key)}
                    draft={draft[norm.key]}
                    onDraft={(value) => setValue(norm.key, value)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>

      <Versions current={current?.version} viewed={version} onView={setViewed} sets={sets.data ?? []} />

      <AnimatePresence>
        {changes.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={SPRING}
            className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-[16px] bg-ink py-2.5 pr-2.5 pl-5 text-white shadow-float max-sm:bottom-3 max-sm:w-[calc(100%-1.5rem)] max-sm:flex-wrap max-sm:justify-between max-sm:gap-x-3 max-sm:gap-y-1.5 max-sm:pl-4"
          >
            <span className="text-[13.5px]">
              Изменено <span className="num font-semibold">{changes.length}</span>{' '}
              {pluralRu(changes.length, ['значение', 'значения', 'значений'])}
            </span>
            <button
              type="button"
              onClick={() => setDraft({})}
              className="flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-[13px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <RotateCcw size={14} /> Сбросить
            </button>
            <Button
              size="sm"
              className="h-8 bg-white px-3.5 text-ink hover:bg-white/90 max-sm:h-9 max-sm:w-full"
              onClick={() => setPublishing(true)}
            >
              <Upload /> Опубликовать версию
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <PublishDialog
        open={publishing}
        onOpenChange={setPublishing}
        changes={changes}
        draft={draft}
        onPublished={() => {
          setDraft({})
          setViewed(undefined)
        }}
      />
    </div>
  )
}

function NormRow({
  norm,
  index,
  editable,
  open,
  onToggle,
  draft,
  onDraft,
}: {
  norm: Norm
  index: number
  editable: boolean
  open: boolean
  onToggle: () => void
  draft: number | undefined
  onDraft: (value: number | null) => void
}) {
  const changed = draft !== undefined && draft !== norm.value
  const [text, setText] = useState(String(draft ?? norm.value).replace('.', ','))
  const parsed = parseNumber(text)
  const range = norm.range
  const outOfRange =
    parsed !== null &&
    range &&
    ((range.min !== undefined && parsed < range.min) || (range.max !== undefined && parsed > range.max))

  const commit = (value: string) => {
    setText(value)
    const next = parseNumber(value)
    onDraft(next === null || next === norm.value ? null : next)
  }

  return (
    <motion.li
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={stagger(index)}
      className={cn('transition-colors', open && 'bg-surface-2/70')}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 sm:gap-4 sm:px-5"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[13.5px] font-medium">
            {changed && <span className="size-1.5 shrink-0 rounded-full bg-warn" />}
            <span className="sm:truncate">{norm.name}</span>
          </span>
          <span className="block truncate font-mono text-[11px] text-ink-4">{norm.key}</span>
        </span>
        {range && range.min !== undefined && range.max !== undefined && range.max > range.min && (
          <RangeTrack min={range.min} max={range.max} value={changed ? draft : norm.value} />
        )}
        <span className="w-28 shrink-0 text-right sm:w-40">
          {changed ? (
            <span className="flex flex-col items-end leading-tight">
              <span className="num text-[14px] font-semibold text-warn">{formatValue(draft, norm.unit)}</span>
              <span className="num text-[11.5px] text-ink-4 line-through">{formatValue(norm.value, norm.unit)}</span>
            </span>
          ) : (
            <span className="num text-[14px] font-medium">{formatValue(norm.value, norm.unit)}</span>
          )}
        </span>
        <ChevronDown
          size={15}
          className={cn('shrink-0 text-ink-4 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="grid gap-5 px-4 pt-1 pb-4 sm:px-5 md:grid-cols-[minmax(0,1fr)_240px]">
              <div className="space-y-2 text-[13px] leading-relaxed">
                {norm.rationale && <p className="text-ink-2">{norm.rationale}</p>}
                <p className="text-ink-3">
                  <span className="text-ink-2">Источник:</span> {norm.source.title}
                  {!norm.source.title.startsWith(SOURCE_KIND_LABEL[norm.source.kind]) &&
                    ` (${SOURCE_KIND_LABEL[norm.source.kind].toLowerCase()})`}
                  {norm.source.retrieved_at && `, ${formatDate(norm.source.retrieved_at)}`}
                  {norm.source.url && (
                    <a
                      href={norm.source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-1.5 inline-flex items-center gap-0.5 text-info hover:underline"
                    >
                      открыть <ExternalLink size={11} />
                    </a>
                  )}
                </p>
                {range && (range.min !== undefined || range.max !== undefined) && (
                  <p className="num text-[12.5px] text-ink-3">
                    Допустимо: {range.min !== undefined ? formatNumber(range.min) : '—'} …{' '}
                    {range.max !== undefined ? formatNumber(range.max) : '—'} {norm.unit}
                  </p>
                )}
              </div>
              {editable ? (
                <label className="block">
                  <span className="text-[12px] text-ink-3">Новое значение, {norm.unit}</span>
                  <div className="mt-1 flex items-center gap-2">
                    <Input
                      value={text}
                      inputMode="decimal"
                      onChange={(e) => commit(e.target.value)}
                      aria-invalid={parsed === null || Boolean(outOfRange)}
                      className="num h-9 rounded-[10px] bg-card"
                    />
                    {changed && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => commit(String(norm.value).replace('.', ','))}
                        aria-label="Вернуть значение"
                      >
                        <RotateCcw />
                      </Button>
                    )}
                  </div>
                  {parsed === null && <span className="mt-1 block text-[12px] text-crit">Введите число</span>}
                  {outOfRange && (
                    <span className="mt-1 block text-[12px] text-crit">
                      Вне допустимого диапазона — не опубликуется
                    </span>
                  )}
                </label>
              ) : (
                <p className="text-[12.5px] text-ink-3">
                  Архивная версия: значения не меняются, расчёты на ней воспроизводимы.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  )
}

/* Где значение стоит внутри допустимого диапазона: шкала одной ширины у всех строк. */
function RangeTrack({ min, max, value }: { min: number; max: number; value: number }) {
  const share = Math.max(0, Math.min(1, (value - min) / (max - min)))
  return (
    <span
      className="relative hidden h-1 w-20 shrink-0 rounded-full bg-black/6 sm:block"
      title={`Место в допустимом диапазоне ${formatNumber(min)} … ${formatNumber(max)}`}
    >
      <motion.span
        className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-2 ring-2 ring-card"
        initial={false}
        animate={{ left: `${share * 100}%` }}
        transition={SPRING}
      />
    </span>
  )
}

function Versions({
  sets,
  current,
  viewed,
  onView,
}: {
  sets: { version: string; published_at: string; published_by?: string | null; notes?: string; norms_count: number }[]
  current?: string
  viewed?: string
  onView: (version: string | undefined) => void
}) {
  return (
    <aside className="card sticky top-20 px-4 pt-4 pb-3 max-lg:static max-lg:order-first">
      <h2 className="px-1 text-[14px] font-semibold">Версии нормативов</h2>
      <p className="meta mt-0.5 px-1">Расчёт хранит свою версию и воспроизводится на ней</p>
      <ol className="relative mt-3">
        {sets.map((set, i) => {
          const active = set.version === viewed
          const isCurrent = set.version === current
          return (
            <motion.li
              key={set.version}
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={stagger(i)}
              className="relative"
            >
              {i < sets.length - 1 && <span className="absolute top-6 bottom-0 left-[13px] w-px bg-line" />}
              <button
                type="button"
                onClick={() => onView(isCurrent ? undefined : set.version)}
                className={cn(
                  'relative flex w-full gap-3 rounded-[10px] px-1.5 py-2 text-left transition-colors',
                  active ? 'bg-black/4' : 'hover:bg-black/3',
                )}
              >
                <span
                  className={cn(
                    'relative mt-1 size-2.5 shrink-0 rounded-full ring-4 ring-card',
                    isCurrent ? 'bg-ok' : 'bg-ink-4',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="num text-[13.5px] font-semibold">{set.version}</span>
                    {isCurrent && <span className="text-[11.5px] font-medium text-ok">действует</span>}
                  </span>
                  <span className="block text-[11.5px] text-ink-3">
                    {formatDate(set.published_at)} · {set.published_by === 'system' ? 'исходная' : set.published_by}
                  </span>
                  {set.notes && <span className="mt-1 line-clamp-3 text-[12px] text-ink-2">{set.notes}</span>}
                </span>
              </button>
            </motion.li>
          )
        })}
      </ol>
    </aside>
  )
}

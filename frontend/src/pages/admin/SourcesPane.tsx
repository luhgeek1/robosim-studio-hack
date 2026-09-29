import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, ExternalLink, Pencil, Search, SearchX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAdminSources } from '@/entities/admin'
import { SOURCE_KIND_LABEL } from '@/entities/provenance/labels'
import type { RegistrySource, SourceFreshness, SourceKind } from '@/shared/api/types'
import { formatDate, formatNumber, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { EmptyState, ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { Switch } from '@/shared/ui/switch'
import { KpiNumber, Segmented } from '@/shared/ui/v0'
import { stagger } from './motion'
import { SourceDialog } from './SourceDialog'

const PAGE_SIZE = 50
const ALL = 'all'
const SEARCH_DEBOUNCE_MS = 300
const COLUMNS = 'grid-cols-[minmax(0,1fr)_132px_minmax(0,230px)_64px_36px]'
const USAGE_LABEL = [
  ['specs', 'ТТХ'],
  ['offers', 'цены'],
  ['cases', 'кейсы'],
  ['norms', 'нормативы'],
  ['parameters', 'параметры'],
] as const
const KINDS = Object.keys(SOURCE_KIND_LABEL) as SourceKind[]

const host = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function SourcesPane() {
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<string>(ALL)
  const [freshness, setFreshness] = useState<string>(ALL)
  const [includeUnused, setIncludeUnused] = useState(false)
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<RegistrySource | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(search.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [search])

  const sources = useAdminSources({
    q: q || undefined,
    kind: kind === ALL ? undefined : (kind as SourceKind),
    freshness: freshness === ALL ? undefined : (freshness as SourceFreshness),
    include_unused: includeUnused || undefined,
    page,
    page_size: PAGE_SIZE,
  })
  const data = sources.data
  const counts = data?.freshness_counts ?? {}
  const all = (counts.fresh ?? 0) + (counts.stale ?? 0) + (counts.undated ?? 0)
  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const reset =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value)
      setPage(1)
    }

  return (
    <div>
      {data && (
        <div className="card mb-5 flex flex-wrap items-end gap-x-10 gap-y-3 px-6 py-5">
          <div>
            <KpiNumber
              value={counts.stale ?? 0}
              className={cn('display text-[44px] leading-none', counts.stale ? 'text-signal' : 'text-ink')}
              format={(v) => formatNumber(Math.round(v))}
            />
            <p className="meta mt-1.5">
              {pluralRu(counts.stale ?? 0, ['источник устарел', 'источника устарели', 'источников устарели'])} —
              получены раньше {formatDate(data.stale_before)}
            </p>
          </div>
          <p className="meta max-w-md pb-0.5">
            Порог — {data.stale_after_months} мес., норматив «source_stale_after_months»: цены в модели индексируются
            раз в год, прайсы и ТТХ старше периода индексации стоит перепроверить. Без даты получения —{' '}
            <span className="num text-ink-2">{formatNumber(counts.undated ?? 0)}</span>.
          </p>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          size="sm"
          value={freshness}
          onChange={reset(setFreshness)}
          options={[
            { value: ALL, label: <Count label="Все" n={all} /> },
            { value: 'stale', label: <Count label="Устарели" n={counts.stale} /> },
            { value: 'undated', label: <Count label="Без даты" n={counts.undated} /> },
            { value: 'fresh', label: <Count label="Актуальны" n={counts.fresh} /> },
          ]}
        />
        <div className="relative w-64 max-w-full">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-4" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Название, ссылка, примечание"
            className="h-9 rounded-[10px] bg-card pl-9"
            aria-label="Поиск источника"
          />
        </div>
        <Select value={kind} onValueChange={reset(setKind)}>
          <SelectTrigger className="h-9 w-52 rounded-[10px] bg-card" aria-label="Вид источника">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Все виды</SelectItem>
            {KINDS.map((key) => (
              <SelectItem key={key} value={key}>
                {SOURCE_KIND_LABEL[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
          <Switch checked={includeUnused} onCheckedChange={reset(setIncludeUnused)} size="sm" /> без ссылок на них
        </label>
      </div>

      {sources.isPending && <LoadingBlock label="Загружаем источники…" />}
      {sources.isError && <ErrorBlock error={sources.error} onRetry={() => sources.refetch()} />}
      {data && data.items.length === 0 && (
        <EmptyState icon={<SearchX size={22} />} title="Ничего не нашли" description="Измените запрос или фильтр." />
      )}
      {data && data.items.length > 0 && (
        <>
          <div className="card overflow-hidden">
            <div
              className={`grid ${COLUMNS} items-center gap-4 border-b border-line bg-surface-2 px-5 py-2.5 text-[12px] text-ink-3`}
            >
              <span>Источник</span>
              <span>Получен</span>
              <span>Где используется</span>
              <span className="text-right">Ссылок</span>
              <span />
            </div>
            <ul className="divide-y divide-line">
              <AnimatePresence initial={false} mode="popLayout">
                {data.items.map((source, i) => (
                  <SourceRow key={source.id} source={source} index={i} onEdit={() => setEditing(source)} />
                ))}
              </AnimatePresence>
            </ul>
          </div>
          <div className="mt-3 flex items-center justify-between text-[12.5px] text-ink-3">
            <span className="num">
              {formatNumber((page - 1) * PAGE_SIZE + 1)}–{formatNumber(Math.min(page * PAGE_SIZE, total))} из{' '}
              {formatNumber(total)} · сначала самые используемые
            </span>
            {pages > 1 && (
              <span className="flex items-center gap-1">
                <span className="num mr-1">
                  {page} / {pages}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  aria-label="Назад"
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={page >= pages}
                  onClick={() => setPage(page + 1)}
                  aria-label="Дальше"
                >
                  <ChevronRight />
                </Button>
              </span>
            )}
          </div>
        </>
      )}

      <SourceDialog target={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function Count({ label, n }: { label: string; n?: number }) {
  return (
    <span className="flex items-baseline gap-1.5">
      {label}
      <span className="num text-[11.5px] text-ink-4">{formatNumber(n ?? 0)}</span>
    </span>
  )
}

function SourceRow({ source, index, onEdit }: { source: RegistrySource; index: number; onEdit: () => void }) {
  const usage = USAGE_LABEL.filter(([key]) => source.usage[key] > 0)
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={stagger(index)}
      className={`group grid ${COLUMNS} items-center gap-4 px-5 py-3 transition-colors hover:bg-surface-2`}
    >
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] font-medium" title={source.title}>
          {source.title}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-3">
          <span className="shrink-0">{SOURCE_KIND_LABEL[source.kind]}</span>
          {source.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-w-0 items-center gap-0.5 text-info hover:underline"
            >
              <span className="truncate">{host(source.url)}</span> <ExternalLink size={11} className="shrink-0" />
            </a>
          )}
        </span>
      </span>
      <span className="text-[12.5px]">
        {source.freshness === 'undated' ? (
          <span className="text-ink-4">нет даты</span>
        ) : (
          <span className="flex flex-col leading-tight">
            <span className="num text-ink-2">{formatDate(source.retrieved_at)}</span>
            {source.freshness === 'stale' && (
              <span className="flex items-center gap-1 text-[11.5px] font-medium text-warn">
                <span className="size-1.5 rounded-full bg-warn" /> устарел
              </span>
            )}
          </span>
        )}
      </span>
      <span className="truncate text-[12.5px] text-ink-3">
        {usage.length
          ? usage.map(([key, label]) => (
              <span key={key} className="mr-2 whitespace-nowrap">
                {label} <span className="num text-ink-2">{formatNumber(source.usage[key])}</span>
              </span>
            ))
          : 'не используется'}
      </span>
      <span className={cn('num text-right text-[13.5px]', source.usage.total === 0 && 'text-ink-4')}>
        {formatNumber(source.usage.total)}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-ink-4 group-hover:text-ink"
        onClick={onEdit}
        aria-label={`Исправить источник «${source.title}»`}
      >
        <Pencil />
      </Button>
    </motion.li>
  )
}

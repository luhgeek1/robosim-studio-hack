import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ExternalLink, Pencil, Search, SearchX } from 'lucide-react'
import { useState } from 'react'
import { useDefaultHistory, useParameterDefaults } from '@/entities/admin'
import { OBJECT_TYPE_LABEL } from '@/entities/project'
import { ProvenanceBadge } from '@/entities/provenance'
import { SOURCE_KIND_LABEL } from '@/entities/provenance/labels'
import type { AdminParameterDefault, ObjectTypeKey } from '@/shared/api/types'
import { formatDate, formatDateTime, formatNumber, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { EmptyState, ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { Switch } from '@/shared/ui/switch'
import { Segmented } from '@/shared/ui/v0'
import { DefaultDialog } from './DefaultDialog'
import { defaultText } from './defaultText'
import { stagger } from './motion'

const OBJECT_TYPES: ObjectTypeKey[] = ['warehouse', 'airport', 'hospital']
const projectsWord = (n: number) => pluralRu(n, ['проекте', 'проектах', 'проектах'])

export function DefaultsPane() {
  const [objectType, setObjectType] = useState<ObjectTypeKey>('warehouse')
  const [search, setSearch] = useState('')
  const [onlySet, setOnlySet] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminParameterDefault | null>(null)
  const defaults = useParameterDefaults(objectType)

  const items = defaults.data?.items ?? []
  const needle = search.trim().toLowerCase()
  const visible = items.filter(
    (item) =>
      (!onlySet || item.default) && (!needle || item.name.toLowerCase().includes(needle) || item.key.includes(needle)),
  )
  const groups = [...new Set(visible.map((item) => item.group_name))].map((name) => ({
    name,
    items: visible.filter((item) => item.group_name === name),
  }))
  const withDefault = items.filter((item) => item.default).length
  const projectsTotal = items[0]?.projects_total ?? 0

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          size="sm"
          value={objectType}
          onChange={(value) => {
            setObjectType(value)
            setOpen(null)
          }}
          options={OBJECT_TYPES.map((key) => ({ value: key, label: OBJECT_TYPE_LABEL[key] }))}
        />
        <div className="relative w-72 max-w-full">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-4" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Название или ключ параметра"
            className="h-9 rounded-[10px] bg-card pl-9"
            aria-label="Поиск параметра"
          />
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
          <Switch checked={onlySet} onCheckedChange={setOnlySet} size="sm" /> только со значением
        </label>
        {defaults.data && (
          <span className="meta ml-auto">
            <span className="num font-medium text-ink">{formatNumber(withDefault)}</span> из{' '}
            <span className="num">{formatNumber(items.length)}</span> со значением ·{' '}
            <span className="num">{formatNumber(projectsTotal)}</span>{' '}
            {pluralRu(projectsTotal, ['проект', 'проекта', 'проектов'])} этого типа
          </span>
        )}
      </div>

      {defaults.isPending && <LoadingBlock label="Загружаем параметры…" />}
      {defaults.isError && <ErrorBlock error={defaults.error} onRetry={() => defaults.refetch()} />}
      {defaults.data && groups.length === 0 && (
        <EmptyState icon={<SearchX size={22} />} title="Ничего не нашли" description="Измените запрос." />
      )}
      <div className="space-y-5">
        {groups.map((group) => (
          <section key={group.name} className="card overflow-hidden">
            <div className="flex items-baseline justify-between border-b border-line bg-surface-2 px-5 py-2.5">
              <h2 className="text-[13.5px] font-semibold">{group.name}</h2>
              <span className="num text-[12px] text-ink-3">{group.items.length}</span>
            </div>
            <ul className="divide-y divide-line">
              {group.items.map((item, i) => (
                <DefaultRow
                  key={item.key}
                  item={item}
                  index={i}
                  open={open === item.key}
                  onToggle={() => setOpen(open === item.key ? null : item.key)}
                  onEdit={() => setEditing(item)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <DefaultDialog target={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function DefaultRow({
  item,
  index,
  open,
  onToggle,
  onEdit,
}: {
  item: AdminParameterDefault
  index: number
  open: boolean
  onToggle: () => void
  onEdit: () => void
}) {
  const provenance = item.default?.provenance
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
        className="grid w-full grid-cols-[minmax(0,1fr)_130px_110px_170px_16px] items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-surface-2"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-[13.5px] font-medium">
            <span className="truncate">{item.name}</span>
            {item.required && <span className="shrink-0 text-[11px] font-normal text-ink-4">обязательный</span>}
          </span>
          <span className="block truncate font-mono text-[11px] text-ink-4">{item.key}</span>
        </span>
        <span>
          {provenance ? (
            <ProvenanceBadge provenance={provenance} />
          ) : (
            <span className="text-[12px] text-ink-4">не задано</span>
          )}
        </span>
        <span className="num text-right text-[12.5px] text-ink-3">
          {item.projects_using_default > 0
            ? `в ${formatNumber(item.projects_using_default)} ${projectsWord(item.projects_using_default)}`
            : '—'}
        </span>
        <span className="num truncate text-right text-[14px] font-medium" title={defaultText(item)}>
          {defaultText(item)}
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
            <DefaultDetails item={item} onEdit={onEdit} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  )
}

function DefaultDetails({ item, onEdit }: { item: AdminParameterDefault; onEdit: () => void }) {
  const history = useDefaultHistory(item.object_type, item.key, true)
  const provenance = item.default?.provenance
  const source = provenance?.source
  const hasRange = item.min != null || item.max != null
  return (
    <div className="grid gap-5 px-5 pt-1 pb-4 md:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-2 text-[13px] leading-relaxed">
        {provenance?.note && <p className="text-ink-2">{provenance.note}</p>}
        {source && (
          <p className="text-ink-3">
            <span className="text-ink-2">Источник:</span> {source.title} ({SOURCE_KIND_LABEL[source.kind].toLowerCase()}
            ){source.retrieved_at && `, ${formatDate(source.retrieved_at)}`}
            {source.url && (
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="ml-1.5 inline-flex items-center gap-0.5 text-info hover:underline"
              >
                открыть <ExternalLink size={11} />
              </a>
            )}
          </p>
        )}
        {hasRange && (
          <p className="num text-[12.5px] text-ink-3">
            Допустимо: {item.min != null ? formatNumber(item.min) : '—'} …{' '}
            {item.max != null ? formatNumber(item.max) : '—'} {item.unit}
          </p>
        )}
        {!item.applies_to_blank && (
          <p className="text-[12.5px] text-ink-3">
            Значение демо-объекта организатора: в пустом проекте обязательное поле не заполняется — пользователь вводит
            своё. Действует в демо-проектах и их копиях.
          </p>
        )}
        {item.hint && <p className="text-[12.5px] text-ink-3">{item.hint}</p>}
      </div>
      <div>
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil /> Изменить значение
        </Button>
        <p className="meta mt-2">
          Проекты без своего значения получат новую версию, их расчёты станут устаревшими. Сохранённые расчёты хранят
          свои входы и воспроизводятся как были.
        </p>
        {history.data && history.data.items.length > 0 && (
          <ol className="mt-3 space-y-1.5 border-t border-line pt-3">
            {history.data.items.slice(0, 4).map((event) => (
              <li key={event.id} className="text-[12px] leading-snug">
                <span className="num text-ink-2">
                  {defaultText(item, event.before?.value)} → {defaultText(item, event.after?.value)}
                </span>
                <span className="block text-ink-4">
                  {formatDateTime(event.at)} · {event.actor}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

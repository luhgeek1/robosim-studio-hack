import { motion } from 'framer-motion'
import { ArrowRight, ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import { useSolutionTypes, useSpecKeys } from '@/entities/admin'
import { PRODUCT_STATUS_LABEL, useProduct } from '@/entities/catalog'
import { OBJECT_TYPE_LABEL } from '@/entities/project'
import { PROVENANCE_LABEL } from '@/entities/provenance/labels'
import { useObjectTypes } from '@/entities/reference'
import { toProductWrite } from '@/pages/admin/productForm'
import type { ObjectTypeKey, ProductWrite, Proposal } from '@/shared/api/types'
import { formatRub, formatValue } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { LoadingBlock } from '@/shared/ui/states'

type Row = { key: string; label: string; before: ReactNode; after: ReactNode }

const SPRING = { type: 'spring', stiffness: 320, damping: 24 } as const
const EMPTY = <span className="text-ink-4">—</span>
const text = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? EMPTY : String(value)

/* Что вендор предлагает поменять: только изменившиеся поля карточки, цены по отраслям и ТТХ с источником.
   Для нового продукта «было» пусто — показываем всё, что он заполнил. */
export function ProposalDiff({ proposal }: { proposal: Proposal }) {
  const current = useProduct(proposal.product_id && proposal.kind === 'update' ? proposal.product_id : undefined)
  const solutionTypes = useSolutionTypes()
  const objectTypes = useObjectTypes()
  const specKeys = useSpecKeys()

  if (proposal.kind === 'update' && current.isPending) return <LoadingBlock label="Сверяем с карточкой…" />

  const before = current.data ? toProductWrite(current.data) : null
  const typeName = (key: string) => solutionTypes.data?.find((t) => t.key === key)?.name ?? key
  const processNames = new Map(
    (objectTypes.data ?? []).flatMap((t) => t.processes.map((p) => [p.key, p.name] as const)),
  )
  const list = (keys: string[] | undefined, name: (k: string) => string) =>
    keys?.length ? keys.map(name).join(', ') : EMPTY

  const cardRows: Row[] = proposal.card ? diffCard(before, proposal.card, typeName, processNames, list) : []
  const specRows: Row[] = proposal.specs.map((spec) => {
    const was = current.data?.specs.find((s) => s.key === spec.key)
    const meta = specKeys.data?.find((k) => k.key === spec.key)
    return {
      key: `spec-${spec.key}`,
      label: meta?.name ?? spec.key,
      before: was ? (
        <span>
          {formatValue(was.value, was.unit)}
          <span className="block text-[11.5px] text-ink-4">
            {PROVENANCE_LABEL[was.provenance.status].toLowerCase()}
          </span>
        </span>
      ) : (
        EMPTY
      ),
      after: (
        <span>
          {formatValue(spec.value, spec.unit ?? meta?.unit)}
          <span className="flex items-center gap-1 text-[11.5px] font-normal text-ink-3">
            {spec.source.url ? (
              <a
                href={spec.source.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 truncate underline-offset-2 hover:text-ink hover:underline"
              >
                {spec.source.title} <ExternalLink size={11} />
              </a>
            ) : (
              <span className="truncate">{spec.source.title}</span>
            )}
          </span>
        </span>
      ),
    }
  })

  return (
    <div className="space-y-5">
      {cardRows.length > 0 && <DiffTable title="Карточка и цены" rows={cardRows} fresh={!before} />}
      {specRows.length > 0 && <DiffTable title="Характеристики" rows={specRows} fresh={false} />}
      {cardRows.length === 0 && specRows.length === 0 && (
        <p className="text-[13px] text-ink-3">Карточка в заявке совпадает с текущей — менять нечего.</p>
      )}
    </div>
  )
}

function diffCard(
  before: ProductWrite | null,
  after: ProductWrite,
  typeName: (key: string) => string,
  processNames: Map<string, string>,
  list: (keys: string[] | undefined, name: (k: string) => string) => ReactNode,
): Row[] {
  const fields: { key: keyof ProductWrite; label: string; show: (card: ProductWrite) => ReactNode }[] = [
    { key: 'name', label: 'Название', show: (c) => text(c.name) },
    { key: 'solution_type', label: 'Тип решения', show: (c) => text(typeName(c.solution_type)) },
    { key: 'subtype', label: 'Подтип', show: (c) => text(c.subtype) },
    { key: 'status', label: 'Стадия', show: (c) => text(PRODUCT_STATUS_LABEL[c.status]) },
    { key: 'trl', label: 'УГТ', show: (c) => text(c.trl) },
    {
      key: 'object_types',
      label: 'Объекты',
      show: (c) => list(c.object_types, (k) => OBJECT_TYPE_LABEL[k as ObjectTypeKey] ?? k),
    },
    { key: 'processes', label: 'Процессы', show: (c) => list(c.processes, (k) => processNames.get(k) ?? k) },
    {
      key: 'description',
      label: 'Описание',
      show: (c) => <span className="line-clamp-3 font-normal">{text(c.description)}</span>,
    },
  ]
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
  const rows: Row[] = fields
    .filter((f) => (before ? !same(before[f.key], after[f.key]) : !same(after[f.key], null)))
    .map((f) => ({ key: f.key, label: f.label, before: before ? f.show(before) : EMPTY, after: f.show(after) }))

  const offerKey = (o: { industry: string; scenario: string }) => `${o.industry} · ${o.scenario}`
  const was = new Map((before?.offers ?? []).map((o) => [offerKey(o), o.price.amount_rub]))
  const now = new Map((after.offers ?? []).map((o) => [offerKey(o), o.price.amount_rub]))
  for (const key of new Set([...was.keys(), ...now.keys()])) {
    if (was.get(key) === now.get(key)) continue
    const price = (value: number | undefined) => (value === undefined ? EMPTY : formatRub(value))
    rows.push({ key: `offer-${key}`, label: `Цена: ${key}`, before: price(was.get(key)), after: price(now.get(key)) })
  }
  return rows
}

function DiffTable({ title, rows, fresh }: { title: string; rows: Row[]; fresh: boolean }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[12px] font-medium tracking-wide text-ink-3 uppercase">{title}</h3>
      <ul className="divide-y divide-line rounded-[12px] border border-line bg-card">
        {rows.map((row, i) => (
          <motion.li
            key={row.key}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: Math.min(i, 12) * 0.022 }}
            className={cn(
              'grid items-start gap-3 px-3.5 py-2.5 text-[13px]',
              fresh ? 'grid-cols-[150px_minmax(0,1fr)]' : 'grid-cols-[150px_minmax(0,1fr)_16px_minmax(0,1fr)]',
            )}
          >
            <span className="text-ink-3">{row.label}</span>
            {!fresh && <span className="min-w-0 text-ink-3 line-through decoration-ink-4/60">{row.before}</span>}
            {!fresh && <ArrowRight size={14} className="mt-0.5 text-ink-4" />}
            <span className="min-w-0 font-medium">{row.after}</span>
          </motion.li>
        ))}
      </ul>
    </section>
  )
}

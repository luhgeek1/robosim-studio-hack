import type { ReactNode } from 'react'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import { useSpecKeys } from '@/api/catalog'
import type { ProductDetail, Provenance, Spec, SpecGroup } from '@/api/types'
import { SourceDot } from '@/components/Provenance'
import { Disclosure, Pill } from '@/components/ui'
import { formatDate, formatNumber, formatPct, formatRub, formatValue, pluralRu } from '@/lib/format'
import {
  OBJECT_TYPE_LABEL,
  PRODUCT_STATUS_LABEL,
  SOURCE_KIND_LABEL,
  SPEC_GROUP_LABEL,
  SPEC_GROUP_ORDER,
} from '@/lib/labels'
import { BadgePills, CompletenessBar, KeyMark, PriceFrom, StatusPill, TrlPill } from './parts'

const hasValue = (spec: Spec) => spec.value !== null && spec.value !== ''

export function Manufacturer({ product }: { product: ProductDetail }) {
  const m = product.manufacturer
  const region = [m.region, m.country].filter(Boolean).join(', ')
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 text-[13.5px] text-ink-3">
      {m.website ? (
        <a
          href={m.website}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-ink-2 hover:text-accent hover:underline"
        >
          {m.name}
          <ExternalLink size={12} />
        </a>
      ) : (
        <span className="text-ink-2">{m.name}</span>
      )}
      {region && <span>· {region}</span>}
    </span>
  )
}

export function ProductFacts({ product }: { product: ProductDetail }) {
  return (
    <div className="rounded-[12px] bg-surface-2 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="meta mb-1">Цена изделия</div>
          <PriceFrom price={product.price_from} size="lg" />
        </div>
        <div className="flex items-center gap-1.5">
          <StatusPill status={product.status} />
          <TrlPill trl={product.trl} />
        </div>
      </div>
      <div className="mt-4">
        <CompletenessBar value={product.completeness} />
      </div>
      {product.badges.length > 0 && (
        <div className="mt-3">
          <BadgePills badges={product.badges} />
        </div>
      )}
    </div>
  )
}

export function MissingKeySpecs({ keys }: { keys: string[] }) {
  const dictionary = useSpecKeys()
  if (!keys.length) return null
  const nameOf = (key: string) => dictionary.data?.find((item) => item.key === key)?.name ?? key
  return (
    <div className="flex items-start gap-3 rounded-[12px] bg-warn-soft px-4 py-3 text-[13px] leading-relaxed">
      <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
      <div>
        <span className="font-medium text-ink">Нет данных по ключевым характеристикам: </span>
        <span className="text-ink-2">{keys.map(nameOf).join(', ')}.</span>
        <span className="block text-ink-3">
          Они нужны для проверок подбора и расчёта количества — стоит уточнить у производителя.
        </span>
      </div>
    </div>
  )
}

function Row({
  label,
  children,
  provenance,
  isKey,
}: {
  label: ReactNode
  children: ReactNode
  provenance?: Provenance | null
  isKey?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-[13.5px]">
      <dt className="flex min-w-0 items-center gap-1.5 text-ink-2">
        {label}
        {isKey && <KeyMark />}
      </dt>
      <dd className="flex shrink-0 items-center gap-2 text-right">
        <span className="num max-w-[260px] font-medium break-words">{children}</span>
        {provenance && <SourceDot provenance={provenance} />}
      </dd>
    </div>
  )
}

function SpecValue({ spec }: { spec: Spec }) {
  if (!hasValue(spec)) return <span className="font-normal text-ink-4">нет данных</span>
  return <>{formatValue(spec.value, spec.unit)}</>
}

// v0 look: the constraints the matching checks come first, two per row, each with its source dot.
export function KeySpecs({ specs, columns = 2 }: { specs: Spec[]; columns?: 1 | 2 }) {
  const key = specs.filter((s) => s.is_key_constraint)
  if (!key.length)
    return <p className="text-[13px] text-ink-3">Ключевые ограничения для этого типа решения не заданы.</p>
  return (
    <dl className={`grid gap-x-6 gap-y-3 text-[13.5px] ${columns === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {key.map((spec) => (
        <div key={spec.key} className="hairline pt-2">
          <dt className="meta">{spec.name}</dt>
          <dd className="mt-0.5 flex items-center gap-2 text-ink">
            <span className="num font-medium">
              <SpecValue spec={spec} />
            </span>
            <SourceDot provenance={spec.provenance} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

// Identification, economics, applicability and data quality partly live on the product itself, not in specs:
// the card shows them inside their group so all six groups of ТЗ 3.3 are complete.
function productRows(product: ProductDetail, group: SpecGroup): { label: string; value: ReactNode }[] {
  switch (group) {
    case 'identification':
      return [
        { label: 'Производитель', value: product.manufacturer.name },
        {
          label: 'Страна и регион',
          value: [product.manufacturer.country, product.manufacturer.region].filter(Boolean).join(', ') || '—',
        },
        { label: 'Тип решения', value: product.solution_type_name ?? product.solution_type },
        { label: 'Стадия', value: PRODUCT_STATUS_LABEL[product.status] },
        { label: 'Уровень готовности (УГТ)', value: product.trl ?? '—' },
      ]
    case 'economics':
      return [
        { label: 'Цена изделия от', value: formatRub(product.price_from.amount_rub) },
        { label: 'Предложений в каталоге', value: formatNumber(product.offers_count ?? product.offers.length) },
      ]
    case 'applicability':
      return (product.object_types?.length ?? 0) > 0
        ? [{ label: 'Типы объектов', value: product.object_types!.map((k) => OBJECT_TYPE_LABEL[k]).join(', ') }]
        : []
    case 'data_quality':
      return [{ label: 'Полнота карточки', value: formatPct(product.completeness, { share: true, digits: 0 }) }]
    default:
      return []
  }
}

export function SpecGroups({ product, defaultOpen = false }: { product: ProductDetail; defaultOpen?: boolean }) {
  return (
    <div className="space-y-3">
      {SPEC_GROUP_ORDER.map((group) => {
        const specs = product.specs.filter((s) => s.group === group)
        const extra = productRows(product, group)
        const count = specs.length + extra.length
        return (
          <Disclosure
            key={group}
            defaultOpen={defaultOpen}
            label={
              <span>
                {SPEC_GROUP_LABEL[group]}
                <span className="num ml-1.5 font-normal text-ink-4">{count}</span>
              </span>
            }
          >
            {count === 0 ? (
              <p className="pb-1 text-[13px] text-ink-3">В карточке нет данных этой группы.</p>
            ) : (
              <dl className="divide-y divide-line">
                {extra.map((row) => (
                  <Row key={row.label} label={row.label}>
                    {row.value}
                  </Row>
                ))}
                {specs.map((spec) => (
                  <Row key={spec.key} label={spec.name} provenance={spec.provenance} isKey={spec.is_key_constraint}>
                    <SpecValue spec={spec} />
                  </Row>
                ))}
              </dl>
            )}
          </Disclosure>
        )
      })}
    </div>
  )
}

export function Offers({ offers }: { offers: ProductDetail['offers'] }) {
  if (!offers.length) return <p className="text-[13px] text-ink-3">Предложений нет.</p>
  return (
    <ul className="divide-y divide-line">
      {offers.map((offer) => (
        <li key={offer.id} className="py-3 first:pt-0">
          <div className="flex items-baseline justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium">{offer.industry}</div>
              <div className="text-[12.5px] text-ink-3">{offer.scenario}</div>
            </div>
            <span className="num shrink-0 text-[14px] font-semibold">{formatRub(offer.price.amount_rub)}</span>
          </div>
          {offer.price_note && <div className="mt-1 text-[12px] text-ink-3">{offer.price_note}</div>}
          {offer.source && (
            <div className="text-[12px] text-ink-4">
              {SOURCE_KIND_LABEL[offer.source.kind]}: {offer.source.title}
              {offer.source.retrieved_at && ` · ${formatDate(offer.source.retrieved_at)}`}
            </div>
          )}
          {offer.cases_text && (
            <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-relaxed text-ink-2" title={offer.cases_text}>
              {offer.cases_text}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

export function Cases({ cases }: { cases: ProductDetail['cases'] }) {
  if (!cases.length) return null
  return (
    <ul className="space-y-3">
      {cases.map((item, i) => (
        <li key={i} className="text-[13px] leading-relaxed">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{item.customer ?? 'Заказчик не указан'}</span>
            {item.year && <span className="num text-ink-3">{item.year}</span>}
            {item.count != null && (
              <span className="num text-ink-3">
                · {item.count} {pluralRu(item.count, ['единица', 'единицы', 'единиц'])}
              </span>
            )}
          </div>
          {item.description && <p className="text-ink-2">{item.description}</p>}
          {item.source && <SourceLine source={item.source} />}
        </li>
      ))}
    </ul>
  )
}

function SourceLine({ source }: { source: NonNullable<ProductDetail['cases'][number]['source']> }) {
  return (
    <div className="text-[12px] text-ink-3">
      {source.url ? (
        <a href={source.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          {source.title}
        </a>
      ) : (
        source.title
      )}
    </div>
  )
}

export function Sources({ sources }: { sources: ProductDetail['sources'] }) {
  if (!sources.length) return <p className="text-[13px] text-ink-3">Источники не указаны.</p>
  return (
    <ul className="space-y-2.5">
      {sources.map((source) => (
        <li key={source.id} className="text-[13px] leading-snug">
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-ink hover:text-accent hover:underline"
            >
              {source.title}
              <ExternalLink size={11} />
            </a>
          ) : (
            <span className="font-medium">{source.title}</span>
          )}
          <div className="text-[12px] text-ink-3">
            {SOURCE_KIND_LABEL[source.kind]}
            {source.retrieved_at && ` · получено ${formatDate(source.retrieved_at)}`}
          </div>
          {source.note && <div className="text-[12px] text-ink-3">{source.note}</div>}
        </li>
      ))}
    </ul>
  )
}

export function Section({ title, children, aside }: { title: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="h3">{title}</div>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function ObjectTypes({ product }: { product: ProductDetail }) {
  if (!product.object_types?.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-3">
      Подходит для:
      {product.object_types.map((key) => (
        <Pill key={key}>{OBJECT_TYPE_LABEL[key]}</Pill>
      ))}
    </div>
  )
}

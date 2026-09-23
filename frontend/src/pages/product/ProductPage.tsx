import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, ExternalLink, KeyRound } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { SPEC_GROUP_LABEL, SPEC_GROUP_ORDER, useProduct } from '@/entities/catalog'
import { OBJECT_TYPE_LABEL } from '@/entities/project'
import { ProvenanceBadge, SOURCE_KIND_LABEL, SourceLink } from '@/entities/provenance'
import { CompareSelectionBar, CompareToggle } from '@/features/catalog-compare-selection'
import { PriceFrom, ProductBadges, ProductStatusBadge } from '@/pages/catalog/parts'
import type { CatalogLinkState } from '@/pages/catalog/parts'
import { api } from '@/shared/api/client'
import type { ProductDetail, Res, Spec } from '@/shared/api/types'
import { formatDate, formatRub, formatValue } from '@/shared/lib/format'
import { PageHeader, Section, Stat, StatStrip } from '@/shared/ui/page'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { ToneBadge } from '@/shared/ui/tone'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'

type SpecKeys = Res<'/api/v1/catalog/spec-keys', 'get'>

// The missing key specs come as keys only; the spec dictionary gives their human names.
const useSpecKeys = () =>
  useQuery({
    queryKey: ['catalog', 'spec-keys'],
    queryFn: () => api.get<SpecKeys>('/catalog/spec-keys').then((r) => r.data),
    staleTime: 30 * 60_000,
  })

export function ProductPage() {
  const { productId } = useParams()
  const product = useProduct(productId)

  return (
    <div className="mx-auto w-full max-w-6xl p-6 pb-28">
      <BackLink />
      {product.isPending && <LoadingBlock rows={5} />}
      {product.isError && <ErrorBlock error={product.error} onRetry={() => product.refetch()} />}
      {product.data && <ProductView product={product.data} />}
      <CompareSelectionBar />
    </div>
  )
}

function BackLink() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as CatalogLinkState | null
  const cameFromCatalog = state?.catalogSearch !== undefined && !state.nested
  return (
    <Link
      to={`/catalog${state?.catalogSearch ?? ''}`}
      onClick={(e) => {
        // Going back restores the catalog's scroll position and filters exactly as the user left them.
        if (cameFromCatalog && window.history.length > 1) {
          e.preventDefault()
          navigate(-1)
        }
      }}
      className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> К каталогу
    </Link>
  )
}

function ProductView({ product }: { product: ProductDetail }) {
  const manufacturer = product.manufacturer
  const region = [manufacturer.region, manufacturer.country].filter(Boolean).join(', ')

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            <span>
              {[product.solution_type_name ?? product.solution_type, product.subtype].filter(Boolean).join(', ')}
            </span>
            <span aria-hidden>·</span>
            {manufacturer.website ? (
              <a
                href={manufacturer.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                {manufacturer.name}
                <ExternalLink className="size-3" />
              </a>
            ) : (
              <span className="text-foreground">{manufacturer.name}</span>
            )}
            {region && <span>· {region}</span>}
          </span>
        }
        actions={<CompareToggle product={product} size="default" />}
      />

      <StatStrip columns={4}>
        <Stat label="Цена изделия" value={<PriceFrom price={product.price_from} />} />
        <Stat label="Стадия" value={<ProductStatusBadge status={product.status} />} />
        <Stat label="Уровень готовности" value={product.trl ?? '—'} hint="УГТ по шкале 1–9" />
        <Stat label="Предложений" value={product.offers.length} hint="по отраслям и сценариям" />
      </StatStrip>

      {(product.badges.length > 0 || (product.object_types?.length ?? 0) > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <ProductBadges badges={product.badges} />
          {(product.object_types?.length ?? 0) > 0 && (
            <span className="text-xs text-muted-foreground">
              Объекты: {product.object_types!.map((key) => OBJECT_TYPE_LABEL[key]).join(', ')}
            </span>
          )}
        </div>
      )}

      {(product.missing_key_specs?.length ?? 0) > 0 && <MissingKeySpecs keys={product.missing_key_specs!} />}

      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start gap-6">
        <div className="space-y-6">
          {(product.description || product.short_description) && (
            <Section title="Описание">
              <p className="leading-relaxed whitespace-pre-line">{product.description ?? product.short_description}</p>
            </Section>
          )}
          <SpecsSection specs={product.specs} />
          <OffersSection offers={product.offers} />
          {product.cases.length > 0 && <CasesSection cases={product.cases} />}
        </div>
        <aside className="space-y-6">
          {product.integration_notes && (
            <Section title="Интеграция">
              <p className="leading-relaxed">{product.integration_notes}</p>
            </Section>
          )}
          <SourcesSection sources={product.sources} />
        </aside>
      </div>
    </div>
  )
}

function MissingKeySpecs({ keys }: { keys: string[] }) {
  const dictionary = useSpecKeys()
  const nameOf = (key: string) => dictionary.data?.items.find((item) => item.key === key)?.name ?? key
  return (
    <div className="flex items-start gap-3 rounded-lg border border-l-2 border-l-warn bg-surface px-4 py-3">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
      <div className="space-y-1">
        <div className="font-medium">
          Нет данных по ключевым ТТХ: в подборе решение получит статус «требует проверки»
        </div>
        <div className="flex flex-wrap gap-1">
          {keys.map((key) => (
            <ToneBadge key={key} tone="warn">
              {nameOf(key)}
            </ToneBadge>
          ))}
        </div>
      </div>
    </div>
  )
}

function KeyConstraintMark() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <KeyRound className="inline size-3.5 shrink-0 text-primary" aria-label="Ключевое ограничение для подбора" />
      </TooltipTrigger>
      <TooltipContent>Ключевое ограничение для подбора: участвует в жёстких проверках совместимости</TooltipContent>
    </Tooltip>
  )
}

function SpecsSection({ specs }: { specs: Spec[] }) {
  const groups = SPEC_GROUP_ORDER.map((group) => ({ group, items: specs.filter((s) => s.group === group) })).filter(
    (g) => g.items.length > 0,
  )
  return (
    <Section
      title="Характеристики"
      description={
        <span className="inline-flex items-center gap-1.5">
          <KeyRound className="size-3.5 text-primary" /> ключевое ограничение для подбора; у каждого значения указан
          источник
        </span>
      }
    >
      {groups.length === 0 ? (
        <p className="text-muted-foreground">Характеристики в карточке не заполнены.</p>
      ) : (
        <div className="space-y-5">
          {groups.map(({ group, items }) => (
            <div key={group}>
              <div className="mb-1 text-xs font-medium text-muted-foreground">{SPEC_GROUP_LABEL[group]}</div>
              <Table className="table-fixed">
                <TableBody>
                  {items.map((spec) => (
                    <TableRow key={spec.key}>
                      <TableCell className="w-[42%] whitespace-normal">
                        <span className="inline-flex items-center gap-1.5">
                          {spec.name}
                          {spec.is_key_constraint && <KeyConstraintMark />}
                        </span>
                      </TableCell>
                      <TableCell className="num font-medium whitespace-normal">
                        {formatValue(spec.value, spec.unit)}
                        {spec.provenance.note && (
                          <div className="text-xs font-normal text-muted-foreground">{spec.provenance.note}</div>
                        )}
                      </TableCell>
                      <TableCell className="w-40 text-right">
                        <ProvenanceBadge provenance={spec.provenance} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function OffersSection({ offers }: { offers: ProductDetail['offers'] }) {
  return (
    <Section title="Предложения" description="Цена зависит от отрасли и сценария применения">
      {offers.length === 0 ? (
        <div className="text-muted-foreground">Предложений нет</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Отрасль и сценарий</TableHead>
              <TableHead className="text-right">Цена</TableHead>
              <TableHead>Источник</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {offers.map((offer) => (
              <TableRow key={offer.id} className="align-top">
                <TableCell className="whitespace-normal">
                  <div className="font-medium">{offer.industry}</div>
                  <div className="text-xs text-muted-foreground">{offer.scenario}</div>
                  {offer.price_note && <div className="mt-1 text-xs text-muted-foreground">{offer.price_note}</div>}
                  {offer.cases_text && (
                    <p className="mt-1.5 line-clamp-4 text-xs leading-relaxed" title={offer.cases_text}>
                      {offer.cases_text}
                    </p>
                  )}
                </TableCell>
                <TableCell className="text-right whitespace-normal">
                  <div className="num font-semibold whitespace-nowrap">{formatRub(offer.price.amount_rub)}</div>
                  <div className="num text-xs whitespace-nowrap text-muted-foreground">
                    {formatRub(offer.price.amount_rub, { exact: true })}
                  </div>
                </TableCell>
                <TableCell className="text-xs whitespace-normal">
                  {offer.source && (
                    <>
                      <SourceLink title={offer.source.title} url={offer.source.url} />
                      <div className="text-muted-foreground">
                        {SOURCE_KIND_LABEL[offer.source.kind]}
                        {offer.source.retrieved_at && ` · ${formatDate(offer.source.retrieved_at)}`}
                      </div>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Section>
  )
}

function CasesSection({ cases }: { cases: ProductDetail['cases'] }) {
  return (
    <Section title="Внедрения">
      <div className="space-y-3">
        {cases.map((item, i) => (
          <div key={i} className="rounded-md border bg-raised/40 p-3">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{item.customer ?? 'Заказчик не указан'}</span>
              {item.year && <span className="num text-xs text-muted-foreground">{item.year}</span>}
              {item.count !== null && item.count !== undefined && (
                <span className="num text-xs text-muted-foreground">· {item.count} шт.</span>
              )}
            </div>
            {item.description && <p className="mt-1 text-sm">{item.description}</p>}
            {item.source && (
              <div className="mt-1.5 text-xs">
                <SourceLink title={item.source.title} url={item.source.url} />
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  )
}

function SourcesSection({ sources }: { sources: ProductDetail['sources'] }) {
  return (
    <Section title="Источники">
      {sources.length === 0 ? (
        <div className="text-muted-foreground">Источники не указаны</div>
      ) : (
        <ul className="space-y-3">
          {sources.map((source) => (
            <li key={source.id} className="space-y-0.5 text-sm">
              <SourceLink title={source.title} url={source.url} />
              <div className="text-xs text-muted-foreground">
                {SOURCE_KIND_LABEL[source.kind]}
                {source.retrieved_at && ` · получено ${formatDate(source.retrieved_at)}`}
              </div>
              {source.url && <div className="truncate text-xs text-muted-foreground">{source.url}</div>}
              {source.note && <div className="text-xs text-muted-foreground">{source.note}</div>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

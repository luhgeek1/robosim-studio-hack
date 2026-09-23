import { ArrowLeft } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useProduct } from '@/api/catalog'
import type { Product, ProductDetail } from '@/api/types'
import { CompareBar } from '@/components/catalog/CompareBar'
import { CompareToggle, PriceFrom, StatusPill } from '@/components/catalog/parts'
import type { CatalogLinkState } from '@/components/catalog/names'
import {
  Cases,
  KeySpecs,
  Manufacturer,
  MissingKeySpecs,
  ObjectTypes,
  Offers,
  ProductFacts,
  Section,
  Sources,
  SpecGroups,
} from '@/components/catalog/ProductDetails'
import { productEyebrow } from '@/components/catalog/names'
import { ErrorState, Loading } from '@/components/States'

export function ProductScreen() {
  const { productId } = useParams()
  const product = useProduct(productId)
  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 pt-8 pb-28">
      <BackLink />
      {product.isPending && <Loading label="Открываем карточку…" />}
      {product.isError && (
        <ErrorState error={product.error} onRetry={() => product.refetch()} title="Карточка не открылась" />
      )}
      {product.data && <ProductPage product={product.data} />}
      <CompareBar />
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
        // Going back restores the catalog's filters and scroll exactly as the user left them.
        if (cameFromCatalog && window.history.length > 1) {
          e.preventDefault()
          navigate(-1)
        }
      }}
      className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink"
    >
      <ArrowLeft size={14} /> К каталогу
    </Link>
  )
}

function ProductPage({ product }: { product: ProductDetail }) {
  const location = useLocation()
  const state = location.state as CatalogLinkState | null
  return (
    <>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[780px]">
          <div className="meta mb-2">{productEyebrow(product)}</div>
          <h1 className="h1">{product.name}</h1>
          <div className="mt-2">
            <Manufacturer product={product} />
          </div>
        </div>
        <CompareToggle product={product} size="md" />
      </div>

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-6">
          {(product.description || product.short_description) && (
            <p className="text-[15px] leading-relaxed whitespace-pre-line text-ink-2">
              {product.description ?? product.short_description}
            </p>
          )}
          <MissingKeySpecs keys={product.missing_key_specs ?? []} />
          <div className="card p-5">
            <Section title="Ключевые характеристики">
              <KeySpecs specs={product.specs} />
            </Section>
          </div>
          <div className="card p-5">
            <Section
              title="Все характеристики"
              aside={<span className="meta">6 групп по ТЗ, у значения — источник</span>}
            >
              <SpecGroups product={product} defaultOpen />
            </Section>
          </div>
        </div>

        <aside className="space-y-6">
          <ProductFacts product={product} />
          <ObjectTypes product={product} />
          <div className="card p-5">
            <Section title="Предложения">
              <Offers offers={product.offers} />
            </Section>
          </div>
          {product.cases.length > 0 && (
            <div className="card p-5">
              <Section title="Внедрения">
                <Cases cases={product.cases} />
              </Section>
            </div>
          )}
          {product.integration_notes && (
            <div className="card p-5">
              <Section title="Интеграция">
                <p className="text-[13.5px] leading-relaxed text-ink-2">{product.integration_notes}</p>
              </Section>
            </div>
          )}
          <div className="card p-5">
            <Section title="Источники">
              <Sources sources={product.sources} />
            </Section>
          </div>
        </aside>
      </div>

      {(product.similar_products?.length ?? 0) > 0 && (
        <section className="mt-10">
          <div className="h3 mb-3">Похожие решения</div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {product.similar_products!.map((similar) => (
              <SimilarCard
                key={similar.id}
                product={similar}
                state={{ catalogSearch: state?.catalogSearch, nested: true }}
              />
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function SimilarCard({ product, state }: { product: Product; state: CatalogLinkState }) {
  return (
    <Link
      to={`/catalog/${product.id}`}
      state={state}
      className="card block space-y-2 p-4 transition-shadow hover:shadow-card"
    >
      <div className="line-clamp-2 text-[14px] font-semibold">{product.name}</div>
      <div className="truncate text-[12.5px] text-ink-3">{product.manufacturer.name}</div>
      <div className="flex items-center justify-between gap-2">
        <StatusPill status={product.status} />
        <PriceFrom price={product.price_from} />
      </div>
    </Link>
  )
}

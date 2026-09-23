import { ArrowUpRight } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useProduct } from '@/api/catalog'
import type { ProductDetail } from '@/api/types'
import { CompareToggle } from '@/components/catalog/parts'
import {
  Cases,
  KeySpecs,
  Manufacturer,
  MissingKeySpecs,
  Offers,
  ProductFacts,
  Section,
  Sources,
  SpecGroups,
} from '@/components/catalog/ProductDetails'
import { productEyebrow } from '@/components/catalog/names'
import { ErrorState, Loading } from '@/components/States'
import { Button, Drawer, DrawerHeader } from '@/components/ui'
import { useStore } from '@/store'

// Opened from any screen with useStore().openProduct(id): the product card without leaving the story.
export function ProductDrawer() {
  const productId = useStore((s) => s.productId)
  const openProduct = useStore((s) => s.openProduct)
  const close = () => openProduct(null)
  return (
    <Drawer open={Boolean(productId)} onClose={close} width={520}>
      {productId && <DrawerBody productId={productId} onClose={close} />}
    </Drawer>
  )
}

function DrawerBody({ productId, onClose }: { productId: string; onClose: () => void }) {
  const product = useProduct(productId)
  const navigate = useNavigate()
  if (product.isPending)
    return (
      <div className="p-6">
        <Loading label="Открываем карточку…" />
      </div>
    )
  if (product.isError)
    return (
      <div className="p-6">
        <ErrorState error={product.error} onRetry={() => product.refetch()} title="Карточка не открылась" />
      </div>
    )
  const p = product.data
  return (
    <>
      <DrawerHeader eyebrow={productEyebrow(p)} title={p.name} onClose={onClose}>
        <div className="mt-1">
          <Manufacturer product={p} />
        </div>
      </DrawerHeader>
      <div className="scroll-thin flex-1 space-y-6 overflow-y-auto px-6 pb-6">
        <ProductFacts product={p} />
        <MissingKeySpecs keys={p.missing_key_specs ?? []} />
        <Section title="Ключевые характеристики">
          <KeySpecs specs={p.specs} />
        </Section>
        <Section title="Все характеристики">
          <SpecGroups product={p} />
        </Section>
        <DrawerExtras product={p} />
      </div>
      <div className="hairline flex items-center justify-between gap-3 px-6 py-4">
        <CompareToggle product={p} />
        <Button
          variant="primary"
          size="sm"
          icon={<ArrowUpRight size={14} />}
          onClick={() => {
            onClose()
            navigate(`/catalog/${p.id}`)
          }}
        >
          Открыть карточку
        </Button>
      </div>
    </>
  )
}

function DrawerExtras({ product }: { product: ProductDetail }) {
  return (
    <>
      <Section title="Предложения">
        <Offers offers={product.offers} />
      </Section>
      {product.cases.length > 0 && (
        <Section title="Внедрения">
          <Cases cases={product.cases} />
        </Section>
      )}
      {product.integration_notes && (
        <Section title="Интеграция">
          <p className="text-[13.5px] leading-relaxed text-ink-2">{product.integration_notes}</p>
        </Section>
      )}
      <Section title="Источники">
        <Sources sources={product.sources} />
      </Section>
    </>
  )
}

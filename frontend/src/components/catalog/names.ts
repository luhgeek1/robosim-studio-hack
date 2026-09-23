import type { ProductDetail } from '@/api/types'

// Catalog names often carry the payload in brackets («AMR 800 (грузоподъемность до 800 кг)») — headlines drop it.
export const shortProductName = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '') || name

export const productEyebrow = (product: ProductDetail) =>
  [product.solution_type_name ?? product.solution_type, product.subtype]
    .filter((v, i, all) => v && all.indexOf(v) === i)
    .join(' · ')

// catalogSearch keeps the catalog filters for the way back; nested marks a card opened from another card.
export type CatalogLinkState = { catalogSearch?: string; nested?: boolean }

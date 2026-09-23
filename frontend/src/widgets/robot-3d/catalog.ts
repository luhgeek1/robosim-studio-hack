import { useQuery } from '@tanstack/react-query'
import { catalogApi } from '@/entities/catalog'
import type { Product, ProductDetail } from '@/shared/api/types'
import { KINDS } from './kinds'
import type { Kind, Spec, Variant } from './types'

// The whole catalog fits one page (187 products, page limit 200): classes are grouped on the client.
export const useCatalogProducts = () =>
  useQuery({
    queryKey: ['robots-3d', 'products'],
    queryFn: () => catalogApi.products({ page_size: 200 }),
    staleTime: 5 * 60_000,
  })

export const kindOf = (p: Product): Kind | undefined =>
  KINDS.find((k) => k.classes.includes(p.solution_type) && (k.claims?.(p) ?? true))

export const cleanName = (name: string) => name.replace(/\s*\(грузоподъ[её]мност[^)]*\)/i, '').trim()

const num = (x: unknown): number | undefined => {
  if (typeof x === 'number' && Number.isFinite(x)) return x
  if (typeof x === 'string') {
    const n = Number(x.replace(',', '.').trim())
    return x.trim() !== '' && Number.isFinite(n) ? n : undefined
  }
  return undefined
}

/** Catalog spec values → model spec. Only what the catalog actually has; gaps stay undefined. */
export function specFromCatalog(p: Product, detail?: ProductDetail): Spec {
  const m = new Map((detail?.specs ?? []).map((s) => [s.key, s.value]))
  const spec: Spec = {}
  const dims = m.get('dimensions_mm')
  const parts = typeof dims === 'string' ? dims.split(/[x×х*]/i).map((d) => num(d)) : []
  if (parts.length === 3 && parts.every((d) => d && d > 0)) spec.dims_mm = parts as [number, number, number]
  else {
    const l = num(m.get('length_mm'))
    const w = num(m.get('width_mm'))
    const h = num(m.get('height_mm'))
    if (l && w && h) spec.dims_mm = [l, w, h]
  }
  spec.payload_kg = num(m.get('payload_kg'))
  spec.tow_kg = num(m.get('towing_capacity_kg'))
  spec.speed_mps = num(m.get('max_speed_mps'))
  spec.lift_mm = num(m.get('lift_height_mm'))
  spec.height_m = num(m.get('max_storage_height_m')) ?? num(m.get('max_scan_height_m'))
  spec.runtime_h = num(m.get('runtime_h'))
  // Arm model names encode payload and reach: «Модель А25-1720» = 25 kg, 1720 mm.
  const arm = /[АA](\d+)-(\d{3,4})\b/.exec(p.name)
  if (arm) {
    spec.payload_kg ??= Number(arm[1])
    spec.reach_mm = Number(arm[2])
  }
  const upTo = /до\s*([\d\s]+)\s*кг/i.exec(p.name)
  if (upTo) spec.payload_kg ??= Number(upTo[1].replace(/\s/g, ''))
  return Object.fromEntries(Object.entries(spec).filter(([, v]) => v !== undefined)) as Spec
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()

/** Built-in variant a catalog product corresponds to (same product, drawn and sourced before the catalog link). */
export function builtinFor(kind: Kind, p: Product): Variant | undefined {
  const name = norm(cleanName(p.name))
  return kind.variants.find((v) =>
    v.match ? v.match.test(p.name) : name.includes(norm(v.name)) || norm(v.name).includes(name),
  )
}

/** Products of a class in the order the gallery showed them first; products new to the gallery go after. */
export function orderForKind(kind: Kind, list: Product[]): Product[] {
  const rank = (p: Product) => {
    const v = builtinFor(kind, p)
    return v ? kind.variants.indexOf(v) : kind.variants.length
  }
  return [...list].sort((a, b) => rank(a) - rank(b) || b.completeness - a.completeness)
}

/** A catalog product drawn with its class model: catalog specs win, class defaults fill the gaps. */
export function variantFromProduct(kind: Kind, p: Product, detail?: ProductDetail): Variant {
  const known = builtinFor(kind, p)
  const base = known ?? kind.variants[0]
  const own = specFromCatalog(p, detail)
  // A lift below the class range is a range floor in the catalog (Ronavi SR: «200–1000» stored as 200).
  if (kind.id === 'sorter-conveyor' && own.lift_mm !== undefined && own.lift_mm < 400) delete own.lift_mm
  const spec: Spec = { ...base.spec, ...own }
  // A known product keeps its researched values; a new one borrows the class defaults and marks them.
  const assumed = known
    ? (known.assumed ?? []).filter((k) => own[k] === undefined)
    : (Object.keys(base.spec) as (keyof Spec)[]).filter((k) => own[k] === undefined && k !== 'lift_min_mm')
  return { id: p.id, name: cleanName(p.name), spec, assumed }
}

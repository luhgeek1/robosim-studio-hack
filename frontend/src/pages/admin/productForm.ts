import type { Badge, ProductDetail, ProductWrite, Source, SourceWrite } from '@/shared/api/types'

// Эти отметки ставит администратор; «отечественный», «есть внедрения», «ТТХ подтверждены» сервер выводит сам.
export const ASSIGNABLE_BADGES: Badge[] = ['in_registry_719', 'tested_fcbas']

export type Offer = NonNullable<ProductWrite['offers']>[number]

export const toSourceWrite = (source: Source): SourceWrite => ({
  kind: source.kind,
  title: source.title,
  url: source.url ?? null,
  retrieved_at: source.retrieved_at ?? null,
  note: source.note ?? null,
})

export const emptyProduct = (): ProductWrite => ({
  name: '',
  manufacturer_name: '',
  manufacturer_country: 'RU',
  solution_type: '',
  status: 'operation',
  trl: null,
  description: '',
  object_types: [],
  processes: [],
  badges: [],
  offers: [],
})

export const toProductWrite = (detail: ProductDetail): ProductWrite => ({
  name: detail.name,
  manufacturer_name: detail.manufacturer.name,
  manufacturer_country: detail.manufacturer.country ?? 'RU',
  manufacturer_region: detail.manufacturer.region ?? null,
  solution_type: detail.solution_type,
  subtype: detail.subtype ?? null,
  status: detail.status,
  trl: detail.trl ?? null,
  market_potential: detail.market_potential ?? null,
  description: detail.description ?? '',
  image_url: detail.image_url ?? null,
  object_types: detail.object_types ?? [],
  processes: detail.processes ?? [],
  badges: (detail.badges ?? []).filter((b) => ASSIGNABLE_BADGES.includes(b)),
  offers: detail.offers.map((offer) => ({
    industry: offer.industry,
    scenario: offer.scenario,
    price: offer.price,
    cases_text: offer.cases_text ?? null,
    source: offer.source ? toSourceWrite(offer.source) : undefined,
  })),
})

export type ProductErrors = Partial<Record<'name' | 'manufacturer_name' | 'solution_type' | 'trl' | 'offers', string>>

export function validateProduct(form: ProductWrite): ProductErrors {
  const errors: ProductErrors = {}
  if (!form.name.trim()) errors.name = 'Укажите название'
  if (!form.manufacturer_name.trim()) errors.manufacturer_name = 'Укажите производителя'
  if (!form.solution_type) errors.solution_type = 'Выберите тип решения'
  if (form.trl !== null && form.trl !== undefined && (form.trl < 1 || form.trl > 9)) errors.trl = 'УГТ — от 1 до 9'
  const offers = form.offers ?? []
  if (offers.some((o) => !o.industry || !o.scenario.trim() || !(o.price.amount_rub > 0)))
    errors.offers = 'У каждого предложения нужны отрасль, сценарий и цена больше нуля'
  return errors
}

export const clean = (form: ProductWrite): ProductWrite => ({
  ...form,
  name: form.name.trim(),
  manufacturer_name: form.manufacturer_name.trim(),
  subtype: form.subtype?.trim() || null,
  description: form.description?.trim() || null,
  offers: (form.offers ?? []).map((o) => ({
    ...o,
    scenario: o.scenario.trim(),
    cases_text: o.cases_text?.trim() || null,
  })),
})

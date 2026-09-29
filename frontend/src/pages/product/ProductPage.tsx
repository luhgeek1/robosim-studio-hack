import { useQuery } from '@tanstack/react-query'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowLeft, ArrowUpRight, Check, KeyRound, Pause, PersonStanding, Play, Rotate3d } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { BADGE_LABEL, SPEC_GROUP_LABEL, SPEC_GROUP_ORDER, useProduct } from '@/entities/catalog'
import { OBJECT_TYPE_LABEL } from '@/entities/project'
import { PROVENANCE_LABEL, PROVENANCE_TONE, SOURCE_DOT, SOURCE_KIND_LABEL, SourceMark } from '@/entities/provenance'
import { CompareSelectionBar, CompareToggle } from '@/features/catalog-compare-selection'
import { ProductStatusMark, type CatalogLinkState } from '@/pages/catalog/parts'
import { api } from '@/shared/api/client'
import type { Product, ProductDetail, ProvenanceStatus, Res, Spec } from '@/shared/api/types'
import { formatDate, formatNumber, formatPct, formatRub, formatValue, isNum, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'
import { ErrorBlock } from '@/shared/ui/states'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { RobotPreview3D, useGallery } from '@/widgets/robot-3d'
import { CardChip, CardFigures, RobotCard } from '@/widgets/robot-card'

type SpecKeys = Res<'/api/v1/catalog/spec-keys', 'get'>

// The missing key specs come as keys only; the spec dictionary gives their human names.
const useSpecKeys = () =>
  useQuery({
    queryKey: ['catalog', 'spec-keys'],
    queryFn: () => api.get<SpecKeys>('/catalog/spec-keys').then((r) => r.data),
    staleTime: 30 * 60_000,
  })

// Паспорт под сценой: то, что покупатель спрашивает первым, — груз, скорость, автономность, габариты, затем
// показатели своего класса (площадь уборки, высота подъёма). Берём первые пять заполненных.
const PASSPORT_KEYS = [
  'payload_kg',
  'towing_capacity_kg',
  'max_speed_mps',
  'runtime_h',
  'range_km',
  'dimensions_mm',
  'throughput_units_h',
  'station_throughput_lines_h',
  'vendor_throughput_per_hour',
  'coverage_m2_h',
  'cleaning_width_mm',
  'lift_height_mm',
  'max_storage_height_m',
  'max_scan_height_m',
  'min_aisle_width_mm',
  'charging_time_min',
  'weight_kg',
]
const PASSPORT_SIZE = 5

const TRL_MAX = 9

// Разбивка достоверности: сначала подтверждённое, в конце — то, чего нет.
const TRUST_ORDER: ProvenanceStatus[] = ['confirmed', 'vendor_claim', 'default', 'derived', 'assumption', 'missing']

export function ProductPage() {
  const { productId } = useParams()
  const product = useProduct(productId)

  // Переход на похожее решение меняет только параметр — страница не монтируется заново, поэтому листаем наверх сами.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [productId])

  return (
    <div className="mx-auto w-full max-w-360 px-4 pt-6 pb-28 sm:px-6">
      <BackLink />
      {product.isPending && <HeroSkeleton />}
      {product.isError && <ErrorBlock error={product.error} onRetry={() => product.refetch()} />}
      {product.data && <ProductView key={product.data.id} product={product.data} />}
      <CompareSelectionBar />
    </div>
  )
}

function BackLink() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as CatalogLinkState | null
  const back = state?.back ?? { to: `/catalog${state?.catalogSearch ?? ''}`, label: 'К каталогу' }
  const cameFromList = (state?.back !== undefined || state?.catalogSearch !== undefined) && !state?.nested
  return (
    <Link
      to={back.to}
      onClick={(e) => {
        // Going back restores the list's scroll position and filters exactly as the user left them.
        if (cameFromList && window.history.length > 1) {
          e.preventDefault()
          navigate(-1)
        }
      }}
      className="mb-5 inline-flex h-8 items-center gap-1.5 rounded-lg pr-2.5 pl-1.5 text-[13px] font-medium text-ink-3 transition-colors hover:bg-black/4 hover:text-ink"
    >
      <ArrowLeft className="size-4" /> {back.label}
    </Link>
  )
}

// «Ronavi H1500 (грузоподъемность до 1 500 кг)» — модель крупно, пояснение из скобок отдельной строкой.
function splitName(name: string) {
  const match = name.match(/^(.*?)\s*\((.+)\)\s*$/)
  if (!match) return { title: name, caption: null }
  const caption = match[2]
  return { title: match[1], caption: caption.charAt(0).toUpperCase() + caption.slice(1) }
}

function ProductView({ product }: { product: ProductDetail }) {
  const location = useLocation()
  const state = location.state as CatalogLinkState | null
  const passport = pickPassport(product.specs)
  const similar = product.similar_products ?? []

  return (
    <>
      <section className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12">
        <Stage product={product} />
        <Intro product={product} />
      </section>

      {passport.length > 0 && <Passport specs={passport} />}

      <div className="mt-14 grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
        <div className="min-w-0 space-y-14">
          {product.description && product.description !== product.short_description && (
            <Block title="Описание">
              <p className="max-w-[68ch] text-[15px] leading-[1.65] whitespace-pre-line text-ink-2">
                {product.description}
              </p>
            </Block>
          )}
          <SpecsBlock product={product} />
          <OffersBlock offers={product.offers} />
          {product.cases.length > 0 && <CasesBlock cases={product.cases} />}
        </div>
        <aside className="space-y-4">
          <TrustPanel product={product} />
          {product.integration_notes && (
            <Panel title="Интеграция">
              <p className="text-[13.5px] leading-relaxed text-ink-2">{product.integration_notes}</p>
            </Panel>
          )}
          <SourcesPanel sources={product.sources} />
        </aside>
      </div>

      {similar.length > 0 && (
        <section className="mt-20">
          <h2 className="h2 mb-5">Похожие решения</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {similar.slice(0, 4).map((item) => (
              <SimilarCard key={item.id} product={item} state={{ catalogSearch: state?.catalogSearch, nested: true }} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}

/* ---------- hero ---------- */

/* Главное на странице — сама модель: большая сцена, её можно вращать, рядом можно поставить человека для масштаба. */
function Stage({ product }: { product: ProductDetail }) {
  const human = useGallery((s) => s.human)
  const paused = useGallery((s) => s.paused)

  // Человек и пауза — общее состояние всех 3D-сцен; уходя со страницы, возвращаем каталогу обычный вид.
  useEffect(
    () => () => {
      useGallery.setState({ human: false, paused: false })
    },
    [],
  )

  return (
    <div className="card relative h-[clamp(420px,calc(100vh-220px),640px)] overflow-hidden bg-surface-2">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: 'radial-gradient(90% 75% at 50% 42%, #ffffff 0%, #f1f4f6 58%, #e6eaee 100%)' }}
      />
      <RobotPreview3D productId={product.id} framing={{ scale: 1.08, lower: 0.05 }} />

      <div className="pointer-events-none absolute inset-x-5 bottom-5 flex items-end justify-between gap-4">
        <div className="glass pointer-events-auto flex items-center gap-0.5 rounded-full p-1">
          <StageToggle
            active={human}
            onClick={() => useGallery.getState().toggleHuman()}
            label="Человек рядом"
            hint="Силуэт человека ростом 1,75 м — для масштаба"
          >
            <PersonStanding />
          </StageToggle>
          <StageToggle
            active={paused}
            onClick={() => useGallery.getState().togglePaused()}
            label={paused ? 'Вращать' : 'Остановить'}
            hint={paused ? 'Снова медленно поворачивать модель' : 'Остановить медленный поворот модели'}
          >
            {paused ? <Play /> : <Pause />}
          </StageToggle>
        </div>
        <span className="flex items-center gap-1.5 pb-2 text-[12.5px] text-ink-3">
          <Rotate3d className="size-4" /> Потяните, чтобы повернуть
        </span>
      </div>
    </div>
  )
}

function StageToggle({
  active,
  onClick,
  label,
  hint,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  hint: string
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-pressed={active}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-colors [&>svg]:size-4',
            active ? 'bg-ink text-white' : 'text-ink-2 hover:bg-black/5 hover:text-ink',
          )}
        >
          {children}
          {label}
        </button>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}

function Intro({ product }: { product: ProductDetail }) {
  const { title, caption } = splitName(product.name)
  const manufacturer = product.manufacturer
  const type = product.solution_type_name ?? product.solution_type
  const lead = product.short_description ?? product.description

  return (
    <div className="flex min-w-0 flex-col py-1">
      <p className="text-[13.5px] text-ink-3">{type}</p>
      <h1 className="display mt-3 text-[clamp(40px,4.2vw,58px)] leading-[0.98] wrap-break-word">{title}</h1>
      {caption && <p className="mt-3 text-[18px] leading-snug tracking-[-0.01em] text-ink-2">{caption}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px]">
        {manufacturer.website ? (
          <a
            href={manufacturer.website}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-1 font-medium text-ink transition-colors hover:text-info"
          >
            {manufacturer.name}
            <ArrowUpRight className="size-3.5 text-ink-4 transition-colors group-hover:text-info" />
          </a>
        ) : (
          <span className="font-medium">{manufacturer.name}</span>
        )}
        {manufacturer.region && <span className="text-ink-3">{manufacturer.region}</span>}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <ProductStatusMark status={product.status} className="text-[13.5px] font-medium" />
        <Readiness trl={product.trl} />
      </div>

      {lead && <p className="mt-6 line-clamp-5 max-w-[60ch] text-[14.5px] leading-[1.6] text-ink-2">{lead}</p>}

      <div className="mt-auto pt-8">
        <Price product={product} />
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <CompareToggle product={product} size="default" className="h-11 rounded-xl px-5 text-[14px]" />
          {manufacturer.website && (
            <Button asChild variant="outline" className="h-11 rounded-xl bg-card px-5 text-[14px]">
              <a href={manufacturer.website} target="_blank" rel="noreferrer">
                Сайт производителя <ArrowUpRight />
              </a>
            </Button>
          )}
        </div>
        {product.badges.length > 0 && (
          <ul className="mt-6 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-ink-2">
            {product.badges.map((badge) => (
              <li key={badge} className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 text-ok" strokeWidth={2.5} />
                {BADGE_LABEL[badge]}
              </li>
            ))}
          </ul>
        )}
        {(product.object_types?.length ?? 0) > 0 && (
          <p className="mt-2 text-[13px] text-ink-3">
            Объекты: {product.object_types!.map((key) => OBJECT_TYPE_LABEL[key].toLowerCase()).join(', ')}
          </p>
        )}
      </div>
    </div>
  )
}

/* УГТ — шкала из девяти делений: видно не только число, но и сколько осталось до серийного продукта. */
function Readiness({ trl }: { trl: number | null | undefined }) {
  if (!isNum(trl)) return <span className="text-[13px] text-ink-3">УГТ не указан</span>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help items-center gap-2.5 text-[13.5px]">
          <span className="flex gap-0.75" aria-hidden>
            {Array.from({ length: TRL_MAX }, (_, i) => (
              <span key={i} className={cn('h-3 w-1.5 rounded-full', i < trl ? 'bg-ink' : 'bg-black/10')} />
            ))}
          </span>
          <span>
            <span className="num font-medium">УГТ {trl}</span> <span className="text-ink-3">из {TRL_MAX}</span>
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        Уровень готовности технологии по каталогу организатора: 1 — идея, 9 — серийный продукт в эксплуатации
      </TooltipContent>
    </Tooltip>
  )
}

function Price({ product }: { product: ProductDetail }) {
  const amounts = product.offers.map((offer) => offer.price.amount_rub)
  const max = amounts.length ? Math.max(...amounts) : product.price_from.amount_rub
  const note = product.offers.find((offer) => offer.price_note)?.price_note
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="display num text-[40px]">{formatRub(product.price_from.amount_rub)}</span>
        <span className="text-[13px] text-ink-3">
          {max > product.price_from.amount_rub ? `от, до ${formatRub(max)} по отраслям` : 'за единицу'},{' '}
          {product.price_from.vat_included === false ? 'без НДС' : 'с НДС'}
        </span>
      </div>
      {note && <p className="mt-1.5 max-w-[56ch] text-[12.5px] text-ink-3">{note}</p>}
    </div>
  )
}

/* ---------- passport ---------- */

function pickPassport(specs: Spec[]) {
  const byKey = new Map(specs.map((spec) => [spec.key, spec]))
  const hasDimensions = byKey.get('dimensions_mm')?.value
  return PASSPORT_KEYS.map((key) => byKey.get(key))
    .filter((spec): spec is Spec => {
      if (!spec) return false
      // Длина, ширина и высота уже есть в габаритах одной строкой.
      if (hasDimensions && ['length_mm', 'width_mm', 'height_mm'].includes(spec.key)) return false
      return spec.key === 'dimensions_mm' ? typeof spec.value === 'string' && spec.value !== '' : isNum(spec.value)
    })
    .slice(0, PASSPORT_SIZE)
}

function Passport({ specs }: { specs: Spec[] }) {
  return (
    <dl
      className="mt-6 grid grid-cols-2 divide-line rounded-2xl bg-card ring-1 ring-line md:grid-cols-[repeat(var(--n),minmax(max-content,1fr))] md:divide-x"
      style={{ '--n': specs.length } as CSSProperties}
    >
      {specs.map((spec) => (
        <div key={spec.key} className="flex min-w-0 flex-col-reverse px-6 py-5">
          {/* Ширину колонки задаёт число, а не подпись: длинная подпись обрезается, число — никогда. */}
          <dt className="mt-1.5 flex items-center gap-1 text-[13px] text-ink-3 [contain:inline-size]" title={spec.name}>
            <span className="truncate">{spec.name}</span>
            <SourceMark provenance={spec.provenance} compact />
          </dt>
          <dd className="flex min-w-0 items-baseline gap-1.5">
            <span className="display num text-[30px] whitespace-nowrap">{passportValue(spec)}</span>
            {spec.unit && <span className="shrink-0 text-[14px] text-ink-3">{spec.unit}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

// Габариты приходят строкой «1044x654x380» — в паспорте показываем их с настоящим знаком умножения.
const passportValue = (spec: Spec) =>
  typeof spec.value === 'string' ? spec.value.replace(/\s*[xх×*]\s*/gi, ' × ') : formatNumber(spec.value as number)

/* ---------- body ---------- */

function Block({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section>
      <h2 className="h2 mb-5">
        {title} {count !== undefined && <span className="num font-normal text-ink-4">{count}</span>}
      </h2>
      {children}
    </section>
  )
}

function SpecsBlock({ product }: { product: ProductDetail }) {
  const groups = SPEC_GROUP_ORDER.map((group) => ({
    group,
    items: product.specs.filter((spec) => spec.group === group),
  })).filter((g) => g.items.length > 0)

  if (groups.length === 0) {
    return (
      <Block title="Характеристики">
        <div className="card px-6 py-6">
          <p className="text-[14.5px] font-medium">Производитель не раскрыл технические характеристики</p>
          <p className="mt-1 max-w-[62ch] text-[13.5px] leading-relaxed text-ink-3">
            В каталоге организатора есть только цена и сценарий применения. Подбор учтёт решение, но количество роботов
            и совместимость с объектом придётся уточнить у производителя.
          </p>
        </div>
      </Block>
    )
  }

  return (
    <Block title="Характеристики" count={product.specs.length}>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px] text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <KeyRound className="size-3.5 text-warn" /> проверяется при подборе
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-ok" /> подтверждено
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-warn" /> заявка производителя
        </span>
        <span>источник — в подсказке у точки</span>
      </div>
      <div className="card divide-y divide-line px-6">
        {groups.map(({ group, items }) => (
          <div key={group} className="grid grid-cols-1 gap-x-8 py-5 md:grid-cols-[160px_minmax(0,1fr)]">
            <h3 className="pb-2 text-[13px] font-medium text-ink-3 md:pt-2.5">{SPEC_GROUP_LABEL[group]}</h3>
            <dl className="divide-y divide-line/70">
              {items.map((spec) => (
                <SpecRow key={spec.key} spec={spec} />
              ))}
            </dl>
          </div>
        ))}
      </div>
    </Block>
  )
}

function SpecRow({ spec }: { spec: Spec }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] items-start gap-6 py-2.5">
      <dt className="flex items-center gap-1.5 text-[14px] leading-snug text-ink-2">
        <span>{spec.name}</span>
        {spec.is_key_constraint && (
          <Tooltip>
            <TooltipTrigger asChild>
              <KeyRound className="size-3.5 shrink-0 text-warn" aria-label="Проверяется при подборе" />
            </TooltipTrigger>
            <TooltipContent>Ключевое ограничение: подбор сверяет его с параметрами объекта</TooltipContent>
          </Tooltip>
        )}
      </dt>
      <dd className="flex min-w-0 items-start gap-1.5 text-[14px] leading-snug font-medium">
        <span className="num min-w-0 wrap-break-word">{formatValue(spec.value, spec.unit)}</span>
        <SourceMark provenance={spec.provenance} compact />
      </dd>
    </div>
  )
}

function OffersBlock({ offers }: { offers: ProductDetail['offers'] }) {
  if (offers.length === 0) return null
  return (
    <Block title="Где применяют и сколько стоит" count={offers.length}>
      <ul className="card divide-y divide-line">
        {offers.map((offer) => (
          <Offer key={offer.id} offer={offer} />
        ))}
      </ul>
    </Block>
  )
}

function Offer({ offer }: { offer: ProductDetail['offers'][number] }) {
  const [open, setOpen] = useState(false)
  const long = (offer.cases_text?.length ?? 0) > 260
  return (
    <li className="px-6 py-5">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-[-0.01em]">{offer.industry}</div>
          <div className="mt-0.5 text-[13.5px] text-ink-3">{offer.scenario}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="display num text-[22px]">{formatRub(offer.price.amount_rub)}</div>
          <div className="mt-0.5 text-[12px] text-ink-3">
            {offer.price.vat_included === false ? 'без НДС' : 'с НДС'}
          </div>
        </div>
      </div>
      {offer.cases_text && (
        <div className="mt-3">
          <p className={cn('max-w-[72ch] text-[13.5px] leading-relaxed text-ink-2', !open && long && 'line-clamp-3')}>
            {offer.cases_text}
          </p>
          {long && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="mt-1 text-[12.5px] font-medium text-ink-3 transition-colors hover:text-ink"
            >
              {open ? 'Свернуть' : 'Читать полностью'}
            </button>
          )}
        </div>
      )}
      {offer.source && (
        <p className="mt-3 text-[12px] text-ink-4">
          {SOURCE_KIND_LABEL[offer.source.kind]}
          {offer.source.retrieved_at && `, ${formatDate(offer.source.retrieved_at)}`}
        </p>
      )}
    </li>
  )
}

function CasesBlock({ cases }: { cases: ProductDetail['cases'] }) {
  return (
    <Block title="Внедрения" count={cases.length}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {cases.map((item, i) => (
          <article key={i} className="card flex gap-5 px-6 py-5">
            {isNum(item.count) && (
              <div className="shrink-0">
                <div className="display num text-[34px]">{formatNumber(item.count)}</div>
                <div className="mt-1 text-[12px] text-ink-3">
                  {pluralRu(item.count, ['робот', 'робота', 'роботов'])}
                </div>
              </div>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[15px] font-semibold tracking-[-0.01em]">
                  {item.customer ?? 'Заказчик не раскрыт'}
                </span>
                {item.year && <span className="num text-[12.5px] text-ink-3">{item.year}</span>}
              </div>
              {item.description && <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{item.description}</p>}
              {item.source && (
                <ExternalSource title={item.source.title} url={item.source.url} className="mt-2 text-[12.5px]" />
              )}
            </div>
          </article>
        ))}
      </div>
    </Block>
  )
}

/* ---------- aside ---------- */

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card px-5 py-5">
      <h2 className="h3 mb-3">{title}</h2>
      {children}
    </section>
  )
}

/* Насколько можно верить карточке: полнота обязательных ТТХ, доля подтверждённых значений и чего не хватает. */
function TrustPanel({ product }: { product: ProductDetail }) {
  const specKeys = useSpecKeys()
  const nameOf = (key: string) => specKeys.data?.items.find((item) => item.key === key)?.name ?? key
  const counts = new Map<ProvenanceStatus, number>()
  for (const spec of product.specs) counts.set(spec.provenance.status, (counts.get(spec.provenance.status) ?? 0) + 1)
  const parts = [...counts.entries()].sort(
    ([a], [b]) =>
      (TRUST_ORDER.indexOf(a) + 1 || TRUST_ORDER.length + 1) - (TRUST_ORDER.indexOf(b) + 1 || TRUST_ORDER.length + 1),
  )
  const total = product.specs.length
  const missing = product.missing_key_specs ?? []

  return (
    <Panel title="Достоверность данных">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-ink-3">Полнота карточки</span>
        <span className="display num text-[22px]">{formatPct(product.completeness, { share: true, digits: 0 })}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/6">
        <div
          className="h-full rounded-full bg-ink"
          style={{ width: `${Math.round(Math.min(1, product.completeness) * 100)}%` }}
        />
      </div>
      <p className="mt-1.5 text-[12px] text-ink-3">доля заполненных обязательных характеристик для этого класса</p>

      {total > 0 && (
        <div className="mt-5">
          <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
            {parts.map(([status, n]) => (
              <span
                key={status}
                className={cn('h-full', SOURCE_DOT[PROVENANCE_TONE[status]])}
                style={{ flexGrow: n }}
              />
            ))}
          </div>
          <ul className="mt-3 space-y-1.5 text-[13px]">
            {parts.map(([status, n]) => (
              <li key={status} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-ink-2">
                  <span className={cn('size-1.5 rounded-full', SOURCE_DOT[PROVENANCE_TONE[status]])} />
                  {PROVENANCE_LABEL[status]}
                </span>
                <span className="num text-ink-3">
                  {n} из {total}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {missing.length > 0 && (
        <div className="mt-5 rounded-xl bg-warn-soft px-4 py-3.5">
          <p className="text-[13px] leading-snug font-medium">Уточнить у производителя</p>
          <p className="mt-1 text-[12.5px] leading-snug text-ink-2">
            Без этих данных подбор отметит решение как «требует проверки»:
          </p>
          <ul className="mt-2 space-y-0.5 text-[12.5px] text-ink">
            {missing.map((key) => (
              <li key={key} className="flex items-center gap-2">
                <KeyRound className="size-3 shrink-0 text-warn" />
                {nameOf(key)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}

function SourcesPanel({ sources }: { sources: ProductDetail['sources'] }) {
  if (sources.length === 0) return null
  return (
    <Panel title="Источники">
      <ul className="space-y-3">
        {sources.map((source) => (
          <li key={source.id} className="min-w-0">
            <ExternalSource title={source.title} url={source.url} className="text-[13px] font-medium" />
            <div className="mt-0.5 text-[12px] text-ink-3">
              {SOURCE_KIND_LABEL[source.kind]}
              {source.retrieved_at && `, получено ${formatDate(source.retrieved_at)}`}
            </div>
            {source.note && <div className="mt-0.5 text-[12px] text-ink-3">{source.note}</div>}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function ExternalSource({ title, url, className }: { title: string; url?: string | null; className?: string }) {
  if (!url) return <div className={cn('wrap-break-word text-ink-2', className)}>{title}</div>
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'group inline-flex max-w-full items-start gap-1 text-ink transition-colors hover:text-info',
        className,
      )}
    >
      <span className="min-w-0 wrap-break-word">{title}</span>
      <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-ink-4 transition-colors group-hover:text-info" />
    </a>
  )
}

/* ---------- similar ---------- */

function SimilarCard({ product, state }: { product: Product; state: CatalogLinkState }) {
  const offers = product.offers_count ?? 0
  const type = product.solution_type_name ?? product.solution_type
  return (
    <RobotCard
      productId={product.id}
      solutionType={product.solution_type}
      name={product.name}
      to={`/catalog/${product.id}`}
      linkState={state}
      subtitle={product.manufacturer.name}
      price={product.price_from}
      chips={
        <CardChip>
          <ProductStatusMark status={product.status} />
        </CardChip>
      }
      corner={<CompareToggle product={product} className="h-7 rounded-full" />}
      details={
        <>
          <p className="-mt-1.5 mb-2.5 truncate text-[12.5px] text-ink-3" title={type}>
            {type}
          </p>
          <CardFigures
            items={[
              { value: product.trl ?? '—', label: 'УГТ из 9' },
              { value: formatPct(product.completeness, { share: true, digits: 0 }), label: 'полнота данных' },
              { value: formatNumber(offers), label: pluralRu(offers, ['предложение', 'предложения', 'предложений']) },
            ]}
          />
        </>
      }
    />
  )
}

function HeroSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12">
      <Skeleton className="h-[clamp(420px,calc(100vh-220px),640px)] rounded-xl" />
      <div className="space-y-4 py-1">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-14 w-4/5" />
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="mt-8 h-24 w-full" />
        <Skeleton className="mt-8 h-10 w-40" />
      </div>
    </div>
  )
}

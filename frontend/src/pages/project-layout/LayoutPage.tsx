import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Box, Map as MapIcon, Maximize2, RefreshCw } from 'lucide-react'
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useLayout } from '@/entities/layout'
import { OBJECT_TYPE_LABEL, useProject, useProjectId } from '@/entities/project'
import { useObjectType } from '@/entities/reference'
import { parseApiProblem } from '@/shared/api/problem'
import type { Layout } from '@/shared/api/types'
import { formatNumber, isNum, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog'
import { Screen } from '@/shared/ui/page'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { LayoutMap, type FitPadding } from '@/widgets/layout-map'
import { Derivation } from './DerivationList'
import { FocusLayer, type Spotlight } from './FocusLayer'
import { ROUTE_ENDPOINT, ROUTE_USE, TEMPLATE_LABEL, type LayoutRoute } from './labels'
import { RegenerateDialog } from './RegenerateDialog'
import { exampleRoute, type ExampleRoute, type RouteKey } from './routes'

type Focus = { kind: 'route'; key: RouteKey } | { kind: 'figure'; key: string } | null

type Figure = { key: string; value: string; label: string; spotlight: Spotlight }

const SPRING = { type: 'spring', stiffness: 500, damping: 40 } as const
// At «Целиком» the building stays clear of the caption above and the toolbar below.
const PLAN_PAD: FitPadding = { x: 36, top: 76, bottom: 92 }
const MODAL_PLAN_PAD: FitPadding = { x: 56, top: 84, bottom: 96 }

export function LayoutPage() {
  const projectId = useProjectId()
  const project = useProject(projectId)
  const objectType = useObjectType(project.data?.object_type)
  const layout = useLayout(projectId)
  const [dialogOpen, setDialogOpen] = useState(false)

  const templates = objectType.data?.layout_templates ?? []
  const unsupported = objectType.data !== undefined && templates.length === 0
  const notGenerated = layout.isError && parseApiProblem(layout.error).status === 404
  const openDialog = () => setDialogOpen(true)

  const data = layout.data
  const route = data?.stats.routes?.find((r) => r.key === 'dock_in_to_storage')

  return (
    <Screen
      wide
      dense
      title={
        data
          ? `Склад ${formatNumber(data.width_m)} × ${formatNumber(data.height_m)} м${route ? `: от ворот до места хранения в среднем ${formatNumber(route.value_m)} м` : ''}`
          : 'Планировка'
      }
      actions={
        data &&
        !unsupported && (
          <Button variant="outline" onClick={openDialog}>
            <RefreshCw /> Перегенерировать
          </Button>
        )
      }
    >
      {layout.isPending && <LoadingBlock label="Строим планировку…" />}

      {layout.isError &&
        (unsupported ? (
          <Placeholder
            title={`Для типа «${project.data ? OBJECT_TYPE_LABEL[project.data.object_type] : 'объект'}» схема пока не строится`}
            action={
              <Button asChild variant="outline">
                <Link to={`/projects/${projectId}/object`}>Уточнить параметры объекта</Link>
              </Button>
            }
          >
            Генератор планировки есть только для складов. Длины маршрутов расчёт берёт из параметров объекта (ваш замер)
            или из нормативов — источник каждого значения виден в трассе расчёта сценария.
          </Placeholder>
        ) : notGenerated ? (
          <Placeholder
            title="Планировка ещё не построена"
            action={
              <Button onClick={openDialog} disabled={objectType.isPending}>
                <Box /> Построить планировку
              </Button>
            }
          >
            Схема соберётся из площади, высоты потолков, ширины проходов, потоков паллет и строк отбора. Маршруты по ней
            уточнят число роботов.
          </Placeholder>
        ) : (
          <ErrorBlock error={layout.error} onRetry={() => layout.refetch()} />
        ))}

      {data && (
        <>
          <PlanOverview layout={data} onRegenerate={unsupported ? undefined : openDialog} />
          {data.derivation.length > 0 && <Derivation steps={data.derivation} />}
        </>
      )}

      {dialogOpen && (
        <RegenerateDialog
          projectId={projectId}
          layout={data}
          templates={templates.length ? templates : data?.template ? [data.template] : []}
          open
          onOpenChange={setDialogOpen}
        />
      )}
    </Screen>
  )
}

/* One card like the object overview: the plan with the focus drawn over it, the routes that go into the robot
   cycle on the right, and the figures the geometry gives under it. Picking a route or a figure lights it up. */
function PlanOverview({ layout, onRegenerate }: { layout: Layout; onRegenerate?: () => void }) {
  const routes = useMemo(() => layout.stats.routes ?? [], [layout.stats.routes])
  const figures = useMemo(() => buildFigures(layout), [layout])
  const [focus, setFocus] = useState<Focus>(routes[0] ? { kind: 'route', key: routes[0].key } : null)
  const [expanded, setExpanded] = useState(false)

  const activeRoute = focus?.kind === 'route' ? routes.find((r) => r.key === focus.key) : undefined
  const activeFigure = focus?.kind === 'figure' ? figures.find((f) => f.key === focus.key) : undefined
  const example = useMemo(
    () => (activeRoute ? exampleRoute(layout, activeRoute.key, activeRoute.value_m) : null),
    [layout, activeRoute],
  )
  const toggle = (next: NonNullable<Focus>) =>
    setFocus((prev) => (prev?.kind === next.kind && prev.key === next.key ? null : next))

  const stage = (fitPadding: FitPadding, modal: boolean) => (
    <PlanStage
      layout={layout}
      route={activeRoute}
      example={example}
      figure={activeFigure}
      fitPadding={fitPadding}
      onExpand={modal ? undefined : () => setExpanded(true)}
    />
  )

  return (
    <section className="card overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="relative min-h-150">{!expanded && stage(PLAN_PAD, false)}</div>
        <RoutesPanel
          layout={layout}
          routes={routes}
          active={activeRoute?.key}
          onPick={(key) => toggle({ kind: 'route', key })}
          onFigure={(key) => setFocus({ kind: 'figure', key })}
          onRegenerate={onRegenerate}
        />
      </div>

      <div
        className="grid grid-cols-3 border-t border-line md:grid-cols-(--cols) md:divide-x md:divide-line"
        style={{ '--cols': `repeat(${figures.length}, minmax(0, 1fr))` } as CSSProperties}
      >
        {figures.map((figure) => (
          <FigureButton
            key={figure.key}
            figure={figure}
            active={activeFigure?.key === figure.key}
            onClick={() => toggle({ kind: 'figure', key: figure.key })}
          />
        ))}
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent
          className="block h-[90vh] w-[90vw] max-w-none overflow-hidden p-0 sm:max-w-none"
          overlayClassName="bg-black/25 supports-backdrop-filter:backdrop-blur-md"
          // Focusing the first control would pop the route-graph tooltip over the map on open.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogTitle className="sr-only">Планировка объекта</DialogTitle>
          {stage(MODAL_PLAN_PAD, true)}
        </DialogContent>
      </Dialog>
    </section>
  )
}

function PlanStage({
  layout,
  route,
  example,
  figure,
  fitPadding,
  onExpand,
}: {
  layout: Layout
  route?: LayoutRoute
  example: ExampleRoute | null
  figure?: Figure
  fitPadding: FitPadding
  onExpand?: () => void
}) {
  const caption = route ? (
    <>
      <span className="text-white/60">Пример пути</span>
      <span className="font-medium">
        {example?.from.label ?? capitalize(ROUTE_ENDPOINT[route.key][0])}
        <ArrowRight size={13} className="mx-1.5 inline -translate-y-px text-white/60" />
        {example?.to.label ?? ROUTE_ENDPOINT[route.key][1]}
      </span>
      {example && <span className="num text-[#f3c77a]">{formatNumber(example.length, 1)} м</span>}
    </>
  ) : figure ? (
    <>
      <span className="num font-medium">{figure.value}</span>
      <span className="text-white/70">{figure.label}</span>
    </>
  ) : null

  return (
    <div className="absolute inset-0">
      <LayoutMap
        layout={layout}
        fill
        legend={false}
        infoCorner="top-left"
        fitPadding={fitPadding}
        className="h-full rounded-none border-0"
        toolbarClassName="top-auto right-4 bottom-4 bg-white/95 shadow-card"
      >
        {(view) => <FocusLayer layout={layout} k={view.k} route={example} spotlight={figure?.spotlight} />}
      </LayoutMap>

      <div className="pointer-events-none absolute top-4 left-1/2 z-10 -translate-x-1/2">
        <AnimatePresence mode="wait" initial={false}>
          {caption && (
            <motion.div
              key={route?.key ?? figure?.key}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-2.5 rounded-full bg-ink px-4 py-2 text-[12.5px] whitespace-nowrap text-white shadow-float"
            >
              {caption}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {onExpand && (
        <button
          type="button"
          onClick={onExpand}
          title="Открыть крупно"
          aria-label="Открыть крупно"
          className="absolute top-4 right-4 z-10 flex size-11 items-center justify-center rounded-[12px] bg-white/90 text-ink-2 shadow-card backdrop-blur transition-colors hover:bg-white hover:text-ink"
        >
          <Maximize2 size={17} />
        </button>
      )}
    </div>
  )
}

function RoutesPanel({
  layout,
  routes,
  active,
  onPick,
  onFigure,
  onRegenerate,
}: {
  layout: Layout
  routes: LayoutRoute[]
  active?: RouteKey
  onPick: (key: RouteKey) => void
  onFigure: (key: string) => void
  onRegenerate?: () => void
}) {
  const longest = Math.max(...routes.map((r) => r.value_m), 1)
  const checks = buildChecks(layout)

  return (
    <div className="flex min-w-0 flex-col border-t border-line px-5 py-6 lg:border-t-0 lg:border-l">
      <div className="flex items-baseline justify-between gap-3 px-2">
        <h2 className="h3">Маршруты роботов</h2>
        <span className="meta">средние по графу</span>
      </div>
      <p className="mt-1 px-2 text-[12.5px] leading-relaxed text-ink-3">
        Идут в цикл робота вместо норматива; ваш замер из параметров объекта важнее.
      </p>

      {routes.length ? (
        <ul className="mt-4 space-y-0.5">
          {routes.map((route) => {
            const on = route.key === active
            const [from, to] = ROUTE_ENDPOINT[route.key]
            return (
              <li key={route.key}>
                <button
                  type="button"
                  onClick={() => onPick(route.key)}
                  aria-pressed={on}
                  className={cn(
                    'relative w-full rounded-xl px-3 py-2.5 text-left transition-colors',
                    on ? 'text-ink' : 'text-ink-2 hover:bg-surface-2',
                  )}
                  title={route.name}
                >
                  {on && (
                    <motion.span
                      layoutId="layout-route"
                      className="absolute inset-0 rounded-xl bg-surface-2 ring-1 ring-line"
                      transition={SPRING}
                    />
                  )}
                  <span className="relative flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-[13.5px] leading-snug">
                      {capitalize(from)}
                      <ArrowRight size={12} className="mx-1 inline -translate-y-px text-ink-4" />
                      {to}
                    </span>
                    <span className="num shrink-0 text-[17px] font-semibold tracking-[-0.01em] text-ink">
                      {formatNumber(route.value_m)}
                      <span className="ml-0.5 text-[12px] font-normal text-ink-3">м</span>
                    </span>
                  </span>
                  <span className="relative mt-2 block h-1 overflow-hidden rounded-full bg-black/5">
                    <motion.span
                      className={cn('block h-full rounded-full', on ? 'bg-warn' : 'bg-black/15')}
                      initial={false}
                      animate={{ width: `${(route.value_m / longest) * 100}%` }}
                      transition={{ type: 'spring', stiffness: 160, damping: 26 }}
                    />
                  </span>
                  <span className="relative mt-1.5 flex justify-between gap-3 text-[12px] text-ink-3">
                    <span className="truncate">{ROUTE_USE[route.key]}</span>
                    <span className="num shrink-0">
                      {formatNumber(route.pairs)} {pluralRu(route.pairs, ['пара', 'пары', 'пар'])}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-4 px-2 text-[13px] text-ink-3">Маршруты не рассчитаны.</p>
      )}

      {checks.length > 0 && (
        <div className="hairline mx-2 mt-auto pt-5">
          <div className="mb-2 text-[13px] text-ink-2">Проверки схемы</div>
          <ul className="space-y-1">
            {checks.map((check) => (
              <li key={check.text}>
                <CheckRow
                  check={check}
                  onClick={check.figure ? () => onFigure(check.figure!) : undefined}
                  action={
                    check.rebuild && onRegenerate ? (
                      <button
                        type="button"
                        onClick={onRegenerate}
                        className="mt-1 flex items-center gap-1 text-[12.5px] font-medium text-ink transition-opacity hover:opacity-70"
                      >
                        <RefreshCw size={12} /> Перегенерировать
                      </button>
                    ) : undefined
                  }
                />
              </li>
            ))}
          </ul>
          <p className="meta mt-4 px-2">
            {TEMPLATE_LABEL[layout.template ?? ''] ?? 'Планировка'}
            {!layout.generated && ', изменена вручную'}
            {layout.updated_at && ` · ${SHORT_DATE.format(new Date(layout.updated_at))}`}
          </p>
        </div>
      )}
    </div>
  )
}

type Check = { tone: 'ok' | 'warn' | 'info'; text: string; figure?: string; rebuild?: boolean }

function CheckRow({ check, onClick, action }: { check: Check; onClick?: () => void; action?: ReactNode }) {
  const dot = { ok: 'bg-ok', warn: 'bg-warn', info: 'bg-info' }[check.tone]
  const body = (
    <>
      <span className={cn('mt-1.75 size-1.5 shrink-0 rounded-full', dot)} />
      <span className="min-w-0">
        <span className="block">{check.text}</span>
        {action}
      </span>
    </>
  )
  const cls = 'flex w-full gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] leading-snug text-ink-2'
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, 'transition-colors hover:bg-surface-2 hover:text-ink')}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

function FigureButton({ figure, active, onClick }: { figure: Figure; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={active ? 'Снять подсветку' : 'Показать на схеме'}
      className={cn(
        'relative min-w-0 px-6 py-4 text-left transition-colors',
        active ? 'bg-surface-2' : 'hover:bg-surface-2',
      )}
    >
      {active && (
        <motion.span layoutId="layout-figure" className="absolute inset-x-0 top-0 h-0.5 bg-warn" transition={SPRING} />
      )}
      <span className="num block text-[20px] leading-tight font-semibold tracking-[-0.01em]">{figure.value}</span>
      <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">{figure.label}</span>
    </button>
  )
}

function buildFigures(layout: Layout): Figure[] {
  const { stats } = layout
  const levels = layout.derivation.find((s) => s.key === 'rack_levels')?.value
  const figures: Figure[] = []
  if (isNum(stats.rack_slots_total) && stats.rack_slots_total > 0) {
    figures.push({
      key: 'storage',
      value: formatNumber(stats.rack_slots_total),
      label: isNum(levels)
        ? `паллетомест · ${formatNumber(levels)} ${pluralRu(levels, ['ярус', 'яруса', 'ярусов'])}`
        : 'паллетомест',
      spotlight: { zones: ['storage'], racks: true },
    })
  }
  if (isNum(stats.docks_in) || isNum(stats.docks_out)) {
    figures.push({
      key: 'docks',
      value: `${formatNumber(stats.docks_in ?? 0)} / ${formatNumber(stats.docks_out ?? 0)}`,
      label: 'ворот приёмки / отгрузки',
      spotlight: { zones: ['receiving', 'shipping'], nodes: ['dock_in', 'dock_out'] },
    })
  }
  if (isNum(stats.pick_stations) && stats.pick_stations > 0) {
    figures.push({
      key: 'stations',
      value: formatNumber(stats.pick_stations),
      label: pluralRu(stats.pick_stations, ['станция отбора', 'станции отбора', 'станций отбора']),
      spotlight: { zones: ['station'], nodes: ['pick_station'] },
    })
  }
  if (isNum(stats.pods) && stats.pods > 0) {
    figures.push({
      key: 'pods',
      value: formatNumber(stats.pods),
      label: 'мобильных стеллажей G2P',
      spotlight: { zones: ['picking'] },
    })
  }
  if (isNum(stats.chargers) && stats.chargers > 0) {
    figures.push({
      key: 'chargers',
      value: formatNumber(stats.chargers),
      label: pluralRu(stats.chargers, ['зарядное место', 'зарядных места', 'зарядных мест']),
      spotlight: { zones: ['charging'], nodes: ['charger'] },
    })
  }
  const narrow = stats.min_aisle_width_m
  if (isNum(narrow)) {
    figures.push({
      key: 'aisles',
      value: `${formatNumber(narrow)} м`,
      label: 'самый узкий проезд',
      spotlight: {
        zones: [],
        // The backend takes the minimum over main and rack aisles (`engine/layout/graph.py`, `_AISLE_KINDS`).
        edges: (plan) =>
          plan.edges
            .filter((e) => AISLE_KINDS.has(e.kind ?? 'rack_aisle') && e.width_m <= narrow + 1e-6)
            .map((e) => e.id),
      },
    })
  }
  return figures
}

function buildChecks(layout: Layout): Check[] {
  const checks: Check[] = []
  if (layout.params_changed) {
    checks.push({
      tone: 'warn',
      text: 'Параметры объекта менялись после генерации — маршруты могут не совпадать с объектом',
      rebuild: true,
    })
  }
  for (const warning of layout.warnings) checks.push({ tone: 'warn', text: warning })

  const need = layout.generator?.params?.pallet_positions
  const slots = layout.stats.rack_slots_total
  if (isNum(need) && isNum(slots) && slots >= need) {
    checks.push({
      tone: 'ok',
      text: `Вмещает ${formatNumber(slots)} паллетомест — нужно ${formatNumber(need)}`,
      figure: 'storage',
    })
  }

  const narrow = layout.stats.min_aisle_width_m
  const twoWay = layout.derivation.find((s) => s.key === 'two_way_min_width_m')?.value
  if (isNum(narrow) && isNum(twoWay)) {
    checks.push(
      narrow < twoWay
        ? {
            tone: 'info',
            text: `В проходах ${formatNumber(narrow)} м двум роботам не разъехаться (нужно ${formatNumber(twoWay)} м): едут по одному`,
            figure: 'aisles',
          }
        : {
            tone: 'ok',
            text: `Проезды от ${formatNumber(narrow)} м — роботы разъезжаются (нужно ${formatNumber(twoWay)} м)`,
            figure: 'aisles',
          },
    )
  }
  return checks
}

const SHORT_DATE = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const AISLE_KINDS = new Set(['main_aisle', 'rack_aisle'])

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function Placeholder({ title, children, action }: { title: string; children: ReactNode; action: ReactNode }) {
  return (
    <section className="card relative flex min-h-110 flex-col items-center justify-center overflow-hidden px-8 py-16 text-center">
      {/* A faint blueprint grid: the empty card reads as the place where the plan will be drawn. */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-60 mask-[radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
        style={{
          backgroundImage:
            'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
      <span className="relative grid size-12 place-items-center rounded-2xl bg-surface-2 text-ink-2 ring-1 ring-line">
        <MapIcon size={20} />
      </span>
      <h2 className="h2 relative mt-5">{title}</h2>
      <p className="relative mt-2 max-w-120 text-[14px] leading-relaxed text-ink-3">{children}</p>
      <div className="relative mt-6">{action}</div>
    </section>
  )
}

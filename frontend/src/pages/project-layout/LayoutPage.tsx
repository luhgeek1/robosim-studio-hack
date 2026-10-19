import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  CircleCheck,
  Info,
  LocateFixed,
  Map as MapIcon,
  Maximize2,
  RefreshCw,
  Pencil,
  TriangleAlert,
} from 'lucide-react'
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
import { InfoHint } from '@/shared/ui/info-hint'
import { Screen } from '@/shared/ui/page'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { LayoutMap, type FitPadding } from '@/widgets/layout-map'
import { Derivation } from './DerivationList'
import { FocusLayer, type Spotlight } from './FocusLayer'
import { ROUTE_ENDPOINT, ROUTE_USE, TEMPLATE_LABEL, type LayoutRoute } from './labels'
import { RegenerateDialog } from './RegenerateDialog'
import { EditLayoutDialog } from './EditLayoutDialog'
import { exampleRoute, type ExampleRoute, type RouteKey } from './routes'
import { SlideHighlight, SlideMark } from '@/shared/ui/slide-highlight'

type Focus = { kind: 'route'; key: RouteKey } | { kind: 'figure'; key: string } | null

type Figure = { key: string; value: string; label: string; spotlight: Spotlight }

const SPRING = { type: 'spring', stiffness: 500, damping: 40 } as const
// At «Целиком» the building stays clear of the caption above and the toolbar below.
const PLAN_PAD = (width: number): FitPadding => ({ x: 36, top: 104, bottom: width < 608 ? 132 : 64 })
const MODAL_PLAN_PAD = (width: number): FitPadding => ({ x: 56, top: 84, bottom: width < 608 ? 132 : 96 })

export function LayoutPage() {
  const projectId = useProjectId()
  const project = useProject(projectId)
  const objectType = useObjectType(project.data?.object_type)
  const layout = useLayout(projectId)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)

  const templates = objectType.data?.layout_templates ?? []
  const unsupported = objectType.data !== undefined && templates.length === 0
  const notGenerated = layout.isError && parseApiProblem(layout.error).status === 404
  const openDialog = () => setDialogOpen(true)

  const data = layout.data
  const routes = data?.stats.routes ?? []
  const route = routes.find((r) => r.key === 'dock_in_to_storage') ?? routes[0]
  const routePhrase = route
    ? route.key === 'dock_in_to_storage'
      ? 'от ворот до места хранения'
      : route.name.toLowerCase()
    : ''
  const noun = project.data
    ? (TITLE_NOUN[project.data.object_type] ?? OBJECT_TYPE_LABEL[project.data.object_type])
    : 'Объект'

  return (
    <Screen
      dense
      title={
        data
          ? `${noun} ${formatNumber(data.width_m)} × ${formatNumber(data.height_m)} м${route ? `: ${routePhrase} в среднем ${formatNumber(route.value_m)} м` : ''}`
          : 'Планировка'
      }
      actions={
        data &&
        !unsupported && (
          <>
            <Button variant="outline" onClick={() => setEditorOpen(true)}>
              <Pencil /> Редактировать
            </Button>
            <Button variant="outline" onClick={openDialog}>
              <RefreshCw /> Перегенерировать
            </Button>
          </>
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
            Генератор планировки есть для складов, больниц и аэропортов. Длины маршрутов расчёт берёт из параметров
            объекта (ваш замер) или из нормативов — источник каждого значения виден в трассе расчёта сценария.
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
            Схема соберётся из параметров объекта: площади, проходов и потоков грузов. Маршруты по ней уточнят число
            роботов.
          </Placeholder>
        ) : (
          <ErrorBlock error={layout.error} onRetry={() => layout.refetch()} />
        ))}

      {data && (
        <>
          <PlanOverview layout={data} onRegenerate={unsupported ? undefined : openDialog} />
          {data.derivation.length > 0 && <Derivation layout={data} projectName={project.data?.name ?? 'Проект'} />}
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
      {editorOpen && data && <EditLayoutDialog projectId={projectId} layout={data} onOpenChange={setEditorOpen} />}
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

  const stage = (fitPadding: (width: number) => FitPadding, modal: boolean) => (
    <PlanStage
      layout={layout}
      route={activeRoute}
      example={example}
      figure={activeFigure}
      fitPadding={fitPadding}
      onFigure={(key) => toggle({ kind: 'figure', key })}
      onExpand={modal ? undefined : () => setExpanded(true)}
    />
  )

  return (
    <section className="card overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="relative min-h-96 sm:min-h-120 lg:min-h-136">{!expanded && stage(PLAN_PAD, false)}</div>
        <RoutesPanel routes={routes} active={activeRoute?.key} onPick={(key) => toggle({ kind: 'route', key })} />
      </div>

      <PlanNotices layout={layout} onRegenerate={onRegenerate} />

      <div
        role="group"
        aria-label="Объекты на схеме"
        className={cn(
          'relative isolate grid grid-cols-2 gap-1.5 p-2 sm:grid-cols-3 sm:gap-2 xl:grid-cols-(--cols)',
          figures.length > 0 && 'border-t border-line/60',
        )}
        style={{ '--cols': `repeat(${Math.max(figures.length, 1)}, minmax(0, 1fr))` } as CSSProperties}
      >
        <SlideHighlight className="rounded-xl bg-warn/10 ring-1 ring-warn/25 ring-inset" transition={SPRING} />
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
  onFigure,
  onExpand,
}: {
  layout: Layout
  route?: LayoutRoute
  example: ExampleRoute | null
  figure?: Figure
  fitPadding: (width: number) => FitPadding
  onFigure: (key: string) => void
  onExpand?: () => void
}) {
  const caption = route ? (
    <>
      <span className="text-white/60">Пример пути</span>
      <span className="font-medium">
        {example?.from.label ?? capitalize(ROUTE_ENDPOINT[route.key]?.[0] ?? 'начало')}
        <ArrowRight size={13} className="mx-1.5 inline -translate-y-px text-white/60" />
        {example?.to.label ?? ROUTE_ENDPOINT[route.key]?.[1] ?? 'конец'}
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
        toolbarClassName="top-auto right-4 bottom-4 left-4 z-10 flex-col-reverse items-start gap-2 border-0 bg-transparent p-0 shadow-none @min-[38rem]:flex-row @min-[38rem]:items-end @min-[38rem]:justify-between"
        toolbarControlsClassName="self-end rounded-lg border border-line/60 bg-white/95 p-1 shadow-card"
        toolbarExtra={<MapChecks layout={layout} activeFigure={figure?.key} onFigure={onFigure} />}
      >
        {(view) => <FocusLayer layout={layout} k={view.k} route={example} spotlight={figure?.spotlight} />}
      </LayoutMap>

      {/* Under the scale and size labels of the top-left corner: a centred caption runs into them on a narrow map. */}
      <div className="pointer-events-none absolute top-15 left-4 z-10">
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
  routes,
  active,
  onPick,
}: {
  routes: LayoutRoute[]
  active?: RouteKey
  onPick: (key: RouteKey) => void
}) {
  return (
    <aside
      aria-label="Маршруты роботов"
      className="flex min-w-0 flex-col border-t border-line/60 px-4 py-5 sm:px-5 lg:border-t-0 lg:border-l lg:py-4"
    >
      <div className="flex items-start gap-1 px-1">
        <h2 className="h3 pt-1">Маршруты роботов</h2>
        <InfoHint title="Как рассчитаны маршруты" showCloseButton={false} className="max-sm:-my-1.5">
          <p>
            Средняя длина кратчайших путей между точками на схеме, с учётом их вместимости. Количество пар показывает,
            сколько сочетаний «откуда → куда» вошло в расчёт.
          </p>
          <p className="mt-2">
            Рабочие маршруты используются в цикле робота вместо норматива. Если вы указали свой замер в параметрах
            объекта, расчёт использует его. Путь к зарядке — справочный. Поездка на лифте в длину не входит.
          </p>
        </InfoHint>
      </div>
      <p className="mt-1 px-1 text-[12px] leading-relaxed text-ink-3">
        {routes.length ? 'Средняя длина · нажмите на маршрут' : 'Расстояния между точками объекта'}
      </p>

      {routes.length ? (
        <ol
          className="relative mt-4 space-y-1 lg:mt-3 lg:flex lg:flex-1 lg:flex-col lg:justify-between lg:space-y-0"
          aria-label="Выбор маршрута"
        >
          <SlideHighlight className="rounded-xl bg-warn/7" transition={SPRING} />
          {routes.map((route, index) => {
            const on = route.key === active
            const [from, to] = ROUTE_ENDPOINT[route.key] ?? [route.name, '']
            const pairs = `${formatNumber(route.pairs)} ${pluralRu(route.pairs, ['пара', 'пары', 'пар'])}`
            return (
              <li key={route.key}>
                <button
                  type="button"
                  onClick={() => onPick(route.key)}
                  aria-pressed={on}
                  aria-label={`${route.name}, ${formatNumber(route.value_m)} м, ${pairs}`}
                  className={cn(
                    'group/route relative grid w-full grid-cols-[1rem_minmax(0,1fr)_auto] items-start gap-x-2.5 rounded-xl px-3 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 lg:py-2',
                    on ? 'text-ink' : 'text-ink-2 hover:bg-surface-2/80',
                  )}
                  title={`${route.name}: ${ROUTE_USE[route.key] ?? 'справочно'}, ${pairs}`}
                >
                  {on && <SlideMark />}
                  {on && <span aria-hidden className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-warn" />}
                  <span aria-hidden className="relative pt-0.5 font-mono text-[10px] text-ink-4">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="relative min-w-0">
                    <span className="grid grid-cols-[0.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-[13px] leading-snug">
                      <span
                        aria-hidden
                        className="relative row-span-2 flex flex-col items-center justify-between py-1.5"
                      >
                        {to && <span className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-line-2" />}
                        <span
                          className={cn(
                            'relative size-1.5 rounded-full border bg-surface',
                            on ? 'border-warn' : 'border-ink-4',
                          )}
                        />
                        {to && <span className={cn('relative size-1.5 rounded-full', on ? 'bg-warn' : 'bg-ink-4')} />}
                      </span>
                      <span className="min-w-0 wrap-anywhere">{capitalize(from)}</span>
                      {to && <span className="min-w-0 font-medium wrap-anywhere">{capitalize(to)}</span>}
                    </span>
                    <span className="mt-1.5 block pl-4 text-[10.5px] leading-relaxed text-ink-3">{pairs}</span>
                  </span>
                  <span className="relative text-right">
                    <span className="num block text-[21px] leading-tight font-semibold tracking-[-0.03em] text-ink">
                      {formatNumber(route.value_m)}
                      <span className="ml-1 text-[11px] font-normal tracking-normal text-ink-3">м</span>
                    </span>
                    <span
                      className={cn(
                        'mt-2 flex items-center justify-end gap-0.5 text-[10px] leading-relaxed transition-opacity',
                        on
                          ? 'text-warn'
                          : 'text-ink-3 opacity-0 group-hover/route:opacity-100 group-focus-visible/route:opacity-100',
                      )}
                    >
                      {on ? 'На схеме' : 'Показать'}
                      <ArrowUpRight size={11} aria-hidden />
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="mt-4 px-2 text-[13px] text-ink-3">Маршруты не рассчитаны.</p>
      )}
    </aside>
  )
}

type Check = {
  tone: 'ok' | 'warn' | 'info'
  title: string
  text: string
  label?: string
  figure?: string
  rebuild?: boolean
}

function MapChecks({
  layout,
  activeFigure,
  onFigure,
}: {
  layout: Layout
  activeFigure?: string
  onFigure: (key: string) => void
}) {
  const figureChecks = buildChecks(layout).filter((check) => check.figure)
  return (
    <section
      aria-label="Проверки схемы"
      className="flex max-w-full items-center gap-1 rounded-lg bg-white/95 p-1 shadow-card"
    >
      {figureChecks.map((check) => {
        const active = check.figure === activeFigure
        const Icon = check.figure === 'storage' ? CircleCheck : MapIcon
        return (
          <Button
            key={check.figure}
            variant="ghost"
            size="sm"
            aria-pressed={active}
            aria-label={`${check.label ?? check.title}. ${check.title}. Показать на схеме`}
            onClick={() => onFigure(check.figure!)}
            className={cn(
              'h-8 gap-1.5 rounded-md border-0 px-2.5 text-[12px] shadow-none',
              active ? 'bg-warn/12 text-ink hover:bg-warn/18' : 'text-ink-2 hover:bg-canvas',
            )}
          >
            <Icon className={cn('size-3.5', check.tone === 'ok' ? 'text-ok' : 'text-info')} strokeWidth={1.7} />
            {check.label ?? check.title}
          </Button>
        )
      })}
      <InfoHint title="Проверки схемы" size="sm" showCloseButton={false}>
        <div className="space-y-2.5">
          {figureChecks.map((check) => (
            <p key={check.figure}>
              <span className="mb-0.5 block font-medium text-ink">{check.title}</span>
              {check.text}
            </p>
          ))}
        </div>
        <div className={cn('space-y-1 text-[10.5px]', figureChecks.length > 0 && 'mt-3 border-t border-line pt-2')}>
          <p>
            {TEMPLATE_LABEL[layout.template ?? ''] ?? 'Планировка'}
            {!layout.generated && ' · изменена вручную'}
          </p>
          {layout.updated_at && (
            <p>
              Обновлена <time dateTime={layout.updated_at}>{SHORT_DATE.format(new Date(layout.updated_at))}</time>
            </p>
          )}
        </div>
      </InfoHint>
    </section>
  )
}

function PlanNotices({ layout, onRegenerate }: { layout: Layout; onRegenerate?: () => void }) {
  const notices = buildChecks(layout).filter((check) => !check.figure)
  if (!notices.length) return null

  return (
    <section aria-label="Замечания к схеме" className="border-t border-line/60 p-3">
      <ul className="space-y-3 rounded-lg bg-surface-2 p-3">
        {notices.map((check) => (
          <li key={check.text}>
            <CheckNotice check={check} onRegenerate={onRegenerate} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function CheckNotice({ check, onRegenerate }: { check: Check; onRegenerate?: () => void }) {
  const Icon = check.tone === 'warn' ? TriangleAlert : Info
  return (
    <div className="flex gap-2 text-left leading-snug">
      <Icon
        size={16}
        strokeWidth={1.7}
        className={cn('mt-0.5 shrink-0', check.tone === 'warn' ? 'text-warn' : 'text-info')}
        aria-hidden
      />
      <div className="min-w-0 wrap-anywhere">
        <p className="text-[12px] font-medium text-ink-2">{check.title}</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">{check.text}</p>
        {check.rebuild && onRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            className="mt-1 flex min-h-8 items-center gap-1 text-[12px] font-medium text-ink hover:opacity-70 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <RefreshCw size={12} /> Перегенерировать
          </button>
        )}
      </div>
    </div>
  )
}

function FigureButton({ figure, active, onClick }: { figure: Figure; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${figure.value} ${figure.label}. ${active ? 'Снять подсветку' : 'Показать на схеме'}`}
      title={active ? 'Снять подсветку' : 'Показать на схеме'}
      className={cn(
        'group/figure relative grid min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)_auto] content-start items-center gap-x-2 gap-y-1 rounded-xl px-3 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-warn/15',
        active ? 'text-ink' : 'bg-canvas/65 hover:bg-canvas',
      )}
    >
      {active && <SlideMark />}
      <span className="num col-start-1 row-start-1 text-[20px] leading-tight font-semibold tracking-[-0.01em]">
        {figure.value}
      </span>
      <span className="col-span-2 row-start-2 min-w-0 text-[12px] leading-snug wrap-anywhere text-ink-2">
        {figure.label}
      </span>
      <span
        aria-hidden
        className={cn(
          'col-start-2 row-start-1 grid size-7 shrink-0 place-items-center rounded-full transition-colors',
          active
            ? 'bg-warn text-white'
            : 'bg-surface text-ink-3 shadow-xs group-hover/figure:bg-ink group-hover/figure:text-white group-focus-visible/figure:bg-ink group-focus-visible/figure:text-white',
        )}
      >
        {active ? <Check size={14} /> : <LocateFixed size={14} />}
      </span>
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
  if ((stats.docks_in ?? 0) > 0 || (stats.docks_out ?? 0) > 0) {
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
  figures.push(...serviceFigures(layout))
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

/* Plans without racks (hospital, airport): figures counted from the geometry itself. */
function serviceFigures(layout: Layout): Figure[] {
  const count = (kind: string) => layout.zones.filter((z) => z.kind === kind).length
  const nodesOf = (kind: string) => layout.nodes.filter((n) => n.kind === kind)
  const figures: Figure[] = []
  const add = (key: string, n: number, forms: [string, string, string], spotlight: Spotlight) => {
    if (n > 0) figures.push({ key, value: formatNumber(n), label: pluralRu(n, forms), spotlight })
  }

  add('wards', count('ward'), ['отделение', 'отделения', 'отделений'], { zones: ['ward'], nodes: ['dropoff'] })
  const services = nodesOf('pickup').filter((n) => SERVICE_ZONES.has(zoneKind(layout, n.zone_id)))
  add('services', services.length, ['служебная точка', 'служебные точки', 'служебных точек'], {
    zones: ['kitchen', 'laundry', 'pharmacy', 'lab', 'waste'],
    nodes: ['pickup'],
  })
  const lifts = nodesOf('elevator').reduce((max, n) => Math.max(max, isNum(n.capacity) ? n.capacity : 0), 0)
  add('lifts', lifts, ['лифт', 'лифта', 'лифтов'], { zones: ['elevator'], nodes: ['elevator'] })

  const stands = layout.zones.filter(
    (z) => z.kind === 'apron' && layout.nodes.some((n) => n.zone_id === z.id && n.kind === 'dropoff'),
  ).length
  add('stands', stands, ['стоянка ВС', 'стоянки ВС', 'стоянок ВС'], { zones: ['apron'], nodes: ['dropoff'] })
  add('gates', count('gate'), ['выход терминала', 'выхода терминала', 'выходов терминала'], {
    zones: ['gate'],
    nodes: ['pickup'],
  })
  return figures
}

const SERVICE_ZONES = new Set(['kitchen', 'laundry', 'pharmacy', 'lab', 'waste'])
const zoneKind = (layout: Layout, zoneId: string | null | undefined) =>
  layout.zones.find((z) => z.id === zoneId)?.kind ?? ''

function buildChecks(layout: Layout): Check[] {
  const checks: Check[] = []
  if (layout.params_changed) {
    checks.push({
      tone: 'warn',
      title: 'Схема требует обновления',
      text: 'Параметры объекта изменились. Перестройте схему, чтобы уточнить маршруты.',
      rebuild: true,
    })
  }
  for (const warning of layout.warnings) checks.push({ tone: 'warn', title: 'Проверьте схему', text: warning })

  const need = layout.generator?.params?.pallet_positions
  const slots = layout.stats.rack_slots_total
  if (isNum(need) && isNum(slots) && slots >= need) {
    checks.push({
      tone: 'ok',
      title: 'Мест хранения достаточно',
      label: 'Хранение',
      text: `${formatNumber(slots)} паллетомест при потребности ${formatNumber(need)}`,
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
            title: 'Одностороннее движение',
            label: 'Проезды',
            text: `Проходы ${formatNumber(narrow)} м · для разъезда нужно ${formatNumber(twoWay)} м`,
            figure: 'aisles',
          }
        : {
            tone: 'ok',
            title: 'Встречное движение доступно',
            label: 'Проезды',
            text: `Проезды от ${formatNumber(narrow)} м · для разъезда нужно ${formatNumber(twoWay)} м`,
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

const AISLE_KINDS = new Set(['main_aisle', 'rack_aisle', 'corridor'])

const TITLE_NOUN: Partial<Record<string, string>> = { warehouse: 'Склад', hospital: 'Больница', airport: 'Аэропорт' }

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

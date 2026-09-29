import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDown,
  ArrowRight,
  Box,
  FileText,
  Info,
  Map as MapIcon,
  MapPin,
  MousePointerClick,
  RefreshCw,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useLayout } from '@/entities/layout'
import { OBJECT_TYPE_LABEL, useProject, useProjectId } from '@/entities/project'
import { useObjectType } from '@/entities/reference'
import { parseApiProblem } from '@/shared/api/problem'
import type { Layout } from '@/shared/api/types'
import { formatNumber, isNum, pluralRu } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Screen } from '@/shared/ui/page'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { ErrorBlock, LoadingBlock, Spinner } from '@/shared/ui/states'
import { LayoutMap, type FitPadding } from '@/widgets/layout-map'
import { PaneSection, PaneTitle, StatusBar, WorkbenchFrame, WorkbenchGrid, type Panels } from '@/widgets/workbench'
import { DerivationSection } from './DerivationList'
import { useDerivationDownload } from './useDerivationDownload'
import { FocusLayer, type Spotlight } from './FocusLayer'
import { ROUTE_ENDPOINT, ROUTE_USE, TEMPLATE_LABEL, type LayoutRoute } from './labels'
import { RegenerateDialog } from './RegenerateDialog'
import { exampleRoute, type ExampleRoute, type RouteKey } from './routes'

type Focus = { kind: 'route'; key: RouteKey } | { kind: 'figure'; key: string } | null

type Figure = { key: string; value: string; label: string; spotlight: Spotlight }

const SPRING = { type: 'spring', stiffness: 500, damping: 40 } as const
// At «Целиком» the building stays clear of the caption above and the toolbar below.
const PLAN_PAD: FitPadding = { x: 36, top: 76, bottom: 92 }
const DERIVATION_ANCHOR = 'layout-derivation'
const LEFT_W = 272
const RIGHT_W = 332

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
  const title = data
    ? `Склад ${formatNumber(data.width_m)} × ${formatNumber(data.height_m)} м${route ? `: от ворот до места хранения в среднем ${formatNumber(route.value_m)} м` : ''}`
    : 'Планировка'

  const dialog = dialogOpen && (
    <RegenerateDialog
      projectId={projectId}
      layout={data}
      templates={templates.length ? templates : data?.template ? [data.template] : []}
      open
      onOpenChange={setDialogOpen}
    />
  )

  if (data) {
    return (
      <>
        <WorkbenchFrame
          projectId={projectId}
          step="layout"
          inFlow
          title={title}
          titleHint={title}
          actions={
            !unsupported && (
              <Button variant="outline" size="sm" onClick={openDialog}>
                <RefreshCw /> Перегенерировать
              </Button>
            )
          }
        >
          <PlanWorkbench
            layout={data}
            projectName={project.data?.name ?? 'Проект'}
            onRegenerate={unsupported ? undefined : openDialog}
          />
        </WorkbenchFrame>
        {data.derivation.length > 0 && <DerivationSection layout={data} projectName={project.data?.name ?? 'Проект'} />}
        {dialog}
      </>
    )
  }

  return (
    <Screen dense title={title}>
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
      {dialog}
    </Screen>
  )
}

/* Рабочая область как у имитации: слева цифры и проверки схемы, по центру план с подсветкой, справа маршруты,
   которые идут в цикл робота, внизу — вывод геометрии (по умолчанию свёрнут). Выбор маршрута или цифры
   подсвечивает её на плане. */
function PlanWorkbench({
  layout,
  projectName,
  onRegenerate,
}: {
  layout: Layout
  projectName: string
  onRegenerate?: () => void
}) {
  const routes = useMemo(() => layout.stats.routes ?? [], [layout.stats.routes])
  const figures = useMemo(() => buildFigures(layout), [layout])
  const checks = useMemo(() => buildChecks(layout), [layout])
  const [focus, setFocus] = useState<Focus>(routes[0] ? { kind: 'route', key: routes[0].key } : null)
  const [panels, setPanels] = useState<Panels>({ left: true, right: true, bottom: false })
  const derivation = useDerivationDownload(layout, projectName)

  const activeRoute = focus?.kind === 'route' ? routes.find((r) => r.key === focus.key) : undefined
  const activeFigure = focus?.kind === 'figure' ? figures.find((f) => f.key === focus.key) : undefined
  const example = useMemo(
    () => (activeRoute ? exampleRoute(layout, activeRoute.key, activeRoute.value_m) : null),
    [layout, activeRoute],
  )
  const toggle = (next: NonNullable<Focus>) =>
    setFocus((prev) => (prev?.kind === next.kind && prev.key === next.key ? null : next))

  return (
    <WorkbenchGrid
      panels={panels}
      leftWidth={LEFT_W}
      rightWidth={RIGHT_W}
      left={
        <>
          <PaneTitle>Схема</PaneTitle>
          <PaneSection title="Цифры геометрии">
            <PickHint>Выберите цифру — это место подсветится на плане</PickHint>
            <ul className="-mx-1.5 space-y-1" role="radiogroup" aria-label="Цифры геометрии">
              {figures.map((figure) => {
                const on = activeFigure?.key === figure.key
                return (
                  <li key={figure.key}>
                    <PickRow
                      on={on}
                      onClick={() => toggle({ kind: 'figure', key: figure.key })}
                      head={capitalize(figure.label)}
                      value={figure.value}
                    >
                      {on && (
                        <span className="mt-0.5 flex justify-end">
                          <PlanMarker on />
                        </span>
                      )}
                    </PickRow>
                  </li>
                )
              })}
            </ul>
          </PaneSection>
          {checks.length > 0 && (
            <PaneSection title="Проверки схемы">
              <ul className="-mx-1.5 space-y-1">
                {checks.map((check) => (
                  <li key={check.text}>
                    <CheckRow
                      check={check}
                      on={Boolean(check.figure) && activeFigure?.key === check.figure}
                      onClick={check.figure ? () => toggle({ kind: 'figure', key: check.figure! }) : undefined}
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
            </PaneSection>
          )}
          {layout.derivation.length > 0 && (
            <PaneSection title="Как получена геометрия">
              <p className="text-[12.5px] leading-relaxed text-ink-3">
                {layout.derivation.length} {pluralRu(layout.derivation.length, ['шаг', 'шага', 'шагов'])}: каждый размер
                — формула из параметров объекта и нормативов.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    document.getElementById(DERIVATION_ANCHOR)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                >
                  <ArrowDown /> Смотреть ниже
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void derivation.download()}
                  disabled={derivation.saving}
                >
                  {derivation.saving ? <Spinner /> : <FileText />} Документ
                </Button>
              </div>
            </PaneSection>
          )}
        </>
      }
      center={
        <PlanStage layout={layout} route={activeRoute} example={example} figure={activeFigure} fitPadding={PLAN_PAD} />
      }
      right={
        <>
          <PaneTitle>Маршруты роботов</PaneTitle>
          <PaneSection
            title="Средние по графу"
            aside={
              <Hint>
                Средняя длина пути робота по графу проездов этой схемы. Она идёт в цикл робота вместо норматива; если в
                параметрах объекта есть ваш замер, расчёт берёт его.
              </Hint>
            }
          >
            <PickHint>Выберите маршрут — пример пути появится на плане</PickHint>
            <RoutesList routes={routes} active={activeRoute?.key} onPick={(key) => toggle({ kind: 'route', key })} />
          </PaneSection>
        </>
      }
      status={
        <StatusBar
          status={TEMPLATE_LABEL[layout.template ?? ''] ?? 'Планировка'}
          live={false}
          items={[
            layout.generated ? 'сгенерирована' : 'изменена вручную',
            ...(layout.updated_at ? [SHORT_DATE.format(new Date(layout.updated_at))] : []),
            `здание ${formatNumber(layout.width_m)} × ${formatNumber(layout.height_m)} м`,
          ]}
          metrics={[
            `${routes.length} ${pluralRu(routes.length, ['маршрут', 'маршрута', 'маршрутов'])}`,
            `${layout.derivation.length} ${pluralRu(layout.derivation.length, ['шаг', 'шага', 'шагов'])} вывода`,
          ]}
          panels={panels}
          onToggle={(key) => setPanels((p) => ({ ...p, [key]: !p[key] }))}
          labels={{ left: 'Схема', bottom: 'Вывод геометрии', right: 'Маршруты роботов' }}
          toggles={['left', 'right']}
        />
      }
    />
  )
}

function PlanStage({
  layout,
  route,
  example,
  figure,
  fitPadding,
}: {
  layout: Layout
  route?: LayoutRoute
  example: ExampleRoute | null
  figure?: Figure
  fitPadding: FitPadding
}) {
  const caption = route ? (
    <>
      <span className="text-white/60">Пример пути</span>
      <span className="font-medium">
        {example?.from.label ?? capitalize(ROUTE_ENDPOINT[route.key][0])}
        <ArrowRight size={13} className="mx-1.5 inline -translate-y-px text-white/60" />
        {example?.to.label ?? ROUTE_ENDPOINT[route.key][1]}
      </span>
      {example && <span className="num text-[#ff9a7e]">{formatNumber(example.length, 1)} м</span>}
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
    </div>
  )
}

/* Маршрут — выбираемая строка: радио-кружок слева, «откуда → куда» и длина, под ними мини-путь от точки до
   точки. Длина линии пропорциональна маршруту на общей шкале, у выбранного она сигнальная — как путь на плане. */
function RoutesList({
  routes,
  active,
  onPick,
}: {
  routes: LayoutRoute[]
  active?: RouteKey
  onPick: (key: RouteKey) => void
}) {
  const longest = Math.max(...routes.map((r) => r.value_m), 1)
  if (!routes.length) return <p className="text-[13px] text-ink-3">Маршруты не рассчитаны.</p>
  return (
    <ul className="-mx-1.5 space-y-1" role="radiogroup" aria-label="Маршруты роботов">
      {routes.map((route) => {
        const on = route.key === active
        const [from, to] = ROUTE_ENDPOINT[route.key]
        const share = Math.max(0.08, route.value_m / longest)
        return (
          <li key={route.key}>
            <PickRow
              on={on}
              onClick={() => onPick(route.key)}
              head={
                <>
                  {capitalize(from)}
                  <ArrowRight size={11} className="mx-1 inline -translate-y-px text-ink-4" />
                  {to}
                </>
              }
              value={
                <>
                  {formatNumber(route.value_m)}
                  <span className="ml-0.5 text-[11px] font-normal text-ink-3">м</span>
                </>
              }
            >
              <span className="mt-2 flex h-3.5 items-center gap-2">
                <span className="flex min-w-0 flex-1 items-center" aria-hidden>
                  <motion.span
                    className="flex items-center"
                    initial={false}
                    animate={{ width: `${share * 100}%` }}
                    transition={{ type: 'spring', stiffness: 160, damping: 26 }}
                  >
                    <span className={cn('size-2 shrink-0 rounded-full', on ? 'bg-signal' : 'bg-ink-4')} />
                    <span className={cn('h-0.5 flex-1', on ? 'bg-signal' : 'bg-ink-4/60')} />
                    <span
                      className={cn(
                        'size-2 shrink-0 rounded-full border-[1.5px] bg-card',
                        on ? 'border-signal' : 'border-ink-4',
                      )}
                    />
                  </motion.span>
                </span>
                <PlanMarker on={on} />
              </span>
              <span className="mt-1 flex items-center justify-between gap-2 text-[11.5px] text-ink-3">
                <span className="truncate">{ROUTE_USE[route.key]}</span>
                <span className="num shrink-0">
                  {formatNumber(route.pairs)} {pluralRu(route.pairs, ['пара', 'пары', 'пар'])}
                </span>
              </span>
            </PickRow>
          </li>
        )
      })}
    </ul>
  )
}

function PickHint({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2.5 flex items-center gap-1.5 text-[12.5px] text-ink-3">
      <MousePointerClick size={14} className="shrink-0 text-ink-4" />
      {children}
    </p>
  )
}

/* Выбираемая строка панели: радио-кружок, подпись и значение; у выбранной — сигнальная рамка. Повторный клик
   снимает подсветку с плана. */
function PickRow({
  on,
  onClick,
  head,
  value,
  children,
}: {
  on: boolean
  onClick: () => void
  head: ReactNode
  value: ReactNode
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      title={on ? 'Убрать подсветку с плана' : 'Показать на плане'}
      className={cn(
        'group relative w-full rounded-[10px] border px-2.5 pt-2 pb-2 text-left transition-[background-color,border-color,box-shadow] duration-150',
        on
          ? 'border-signal/40 bg-card shadow-[0_1px_2px_rgba(20,20,19,0.05)]'
          : 'border-transparent hover:border-line hover:bg-card',
      )}
    >
      <span className="flex items-start gap-2.5">
        <span
          className={cn(
            'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors',
            on ? 'border-signal' : 'border-ink-4 group-hover:border-ink-3',
          )}
          aria-hidden
        >
          <motion.span
            className="size-2 rounded-full bg-signal"
            initial={false}
            animate={{ scale: on ? 1 : 0 }}
            transition={SPRING}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn('min-w-0 text-[13px] leading-snug', on ? 'text-ink' : 'text-ink-2')}>{head}</span>
            <span className="num shrink-0 text-[15px] font-semibold text-ink">{value}</span>
          </span>
          {children}
        </span>
      </span>
    </button>
  )
}

function PlanMarker({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        'flex w-17 shrink-0 items-center justify-end gap-1 text-[11px] font-medium transition-opacity',
        on ? 'text-signal' : 'text-ink-3 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
      )}
    >
      <MapPin size={11} /> {on ? 'на плане' : 'показать'}
    </span>
  )
}

/* Пояснение по клику в заголовке раздела панели. */
function Hint({ children }: { children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        className="inline-flex shrink-0 text-ink-4 transition-colors hover:text-ink"
        aria-label="Пояснение"
      >
        <Info size={14} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 text-[13px] leading-relaxed text-ink-2">
        {children}
      </PopoverContent>
    </Popover>
  )
}

type Check = { tone: 'ok' | 'warn' | 'info'; text: string; figure?: string; rebuild?: boolean }

/* Проверка схемы: точка по тону; если у проверки есть место на плане, строка выбирается как цифры и маршруты. */
function CheckRow({
  check,
  on = false,
  onClick,
  action,
}: {
  check: Check
  on?: boolean
  onClick?: () => void
  action?: ReactNode
}) {
  const dot = { ok: 'bg-ok', warn: 'bg-warn', info: 'bg-info' }[check.tone]
  const body = (
    <span className="flex items-start gap-2.5">
      <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', dot)} />
      <span className="min-w-0 flex-1">
        <span className={cn('block', on ? 'text-ink' : 'text-ink-2')}>{check.text}</span>
        {on && (
          <span className="mt-0.5 flex justify-end">
            <PlanMarker on />
          </span>
        )}
        {action}
      </span>
    </span>
  )
  const cls = 'block w-full rounded-[10px] border px-2.5 py-2 text-left text-[12.5px] leading-snug'
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={on ? 'Убрать подсветку с плана' : 'Показать на плане'}
      className={cn(
        cls,
        'group transition-[background-color,border-color] duration-150',
        on ? 'border-signal/40 bg-card' : 'border-transparent hover:border-line hover:bg-card',
      )}
    >
      {body}
    </button>
  ) : (
    <div className={cn(cls, 'border-transparent')}>{body}</div>
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

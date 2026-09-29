import { AlertTriangle, Box, Map as MapIcon, Maximize2, RefreshCw, Rotate3d } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useGenerateLayout, useLayout } from '@/entities/layout'
import { parseApiProblem } from '@/shared/api/problem'
import type { Layout, ObjectType } from '@/shared/api/types'
import { formatNumber, isNum } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog'
import { ErrorBlock, Spinner } from '@/shared/ui/states'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { Segmented } from '@/shared/ui/v0'
import { LayoutMap, type FitPadding } from '@/widgets/layout-map'
import { Twin, type TwinView } from '@/widgets/twin'

// The twin on «Объект» is the project's own generated layout: the same geometry the route lengths and the simulation
// use. A type without a layout generator keeps the parameter-only explanation.
export function ObjectTwin({ projectId, objectType }: { projectId: string; objectType: ObjectType }) {
  const supported = (objectType.layout_templates?.length ?? 0) > 0
  const layout = useLayout(projectId, supported)
  const generate = useGenerateLayout(projectId)
  const paramNames = new Map(
    objectType.parameter_groups.flatMap((g) => g.parameters.map((p) => [p.key, p.name] as const)),
  )

  if (!supported) {
    return (
      <Placeholder title={objectType.name}>
        Для этого типа объекта планировка не строится: длины маршрутов, площади и число постов расчёт берёт из
        параметров объекта. Уточните их — подбор и экономика пересчитаются.
      </Placeholder>
    )
  }
  if (layout.isPending) return <Placeholder title="Загружаем планировку…" />

  const notBuilt = layout.isError && parseApiProblem(layout.error).status === 404
  if (notBuilt) {
    return (
      <Placeholder
        title="Планировка ещё не построена"
        action={
          <>
            <Button onClick={() => generate.mutate({})} disabled={generate.isPending}>
              {generate.isPending ? <Spinner /> : <Box />} {generate.isPending ? 'Строим…' : 'Построить планировку'}
            </Button>
            {generate.isError && <GenerateError error={generate.error} paramNames={paramNames} />}
          </>
        }
      >
        Типовая планировка склада соберётся из параметров объекта: площадь, высота потолков, паллетоместа и ворота. Из
        неё расчёт возьмёт длины маршрутов, а имитация — граф проездов.
      </Placeholder>
    )
  }
  if (layout.isError) {
    return (
      <div className="p-6">
        <ErrorBlock error={layout.error} onRetry={() => layout.refetch()} />
      </div>
    )
  }

  return (
    <LayoutTwin
      layout={layout.data}
      rebuilding={generate.isPending}
      onRebuild={() => generate.mutate({ template: layout.data.template ?? null })}
      error={generate.isError ? <GenerateError error={generate.error} paramNames={paramNames} /> : null}
    />
  )
}

// The plan fills the card like the 3D scene; at «Целиком» the building stays clear of the switch above
// and the numbers and toolbar below.
const PLAN_PAD: FitPadding = { x: 32, top: 76, bottom: 100 }
const MODAL_PLAN_PAD: FitPadding = { x: 48, top: 80, bottom: 80 }
// On a phone the switch sits in a strip above the stage, and the numbers stand above the toolbar at the bottom.
const NARROW_PLAN_PAD: FitPadding = { x: 16, top: 64, bottom: 150 }
const NARROW_MODAL_PLAN_PAD: FitPadding = { x: 16, top: 64, bottom: 80 }
const NARROW = '(max-width: 639.98px)'
// A bit longer than the dialog's open/close animation (duration-100).
const HANDOVER_MS = 150

// One stage for the card and the full-screen dialog: the 3D scene or the 2D plan under a centered switch
// (on a phone the switch moves to a strip above the stage).
function TwinStage({
  layout,
  view,
  onViewChange,
  fitPadding,
  narrowPadding,
}: {
  layout: Layout
  view: TwinView
  onViewChange: (view: TwinView) => void
  fitPadding: FitPadding
  narrowPadding: FitPadding
}) {
  const narrow = useMedia(NARROW)
  return (
    <>
      {/* The 2D plan is the same map as on «Планировка»; like the 3D scene it fills the stage under the overlays. */}
      {view === '3d' ? (
        <div className="absolute inset-0 max-sm:top-16">
          <Twin layout={layout} switcher={false} toolbarPlacement="bottom-right" />
        </div>
      ) : (
        <div className="absolute inset-0 max-sm:top-16">
          <LayoutMap
            layout={layout}
            fill
            legend={false}
            infoCorner="top-left"
            fitPadding={narrow ? narrowPadding : fitPadding}
            className="h-full rounded-none border-0"
            toolbarClassName="top-auto right-4 bottom-4 bg-white/95 shadow-card"
          />
        </div>
      )}
      <div className="absolute top-2.5 left-4 z-10 rounded-[12px] bg-white/90 p-1 shadow-card backdrop-blur sm:top-4 sm:left-1/2 sm:-translate-x-1/2">
        <Segmented
          size="sm"
          value={view}
          onChange={onViewChange}
          options={[
            { value: '3d', label: <ViewLabel icon={<Rotate3d size={14} />}>3D-двойник</ViewLabel> },
            { value: '2d', label: <ViewLabel icon={<MapIcon size={14} />}>2D-план</ViewLabel> },
          ]}
        />
      </div>
    </>
  )
}

function LayoutTwin({
  layout,
  rebuilding,
  onRebuild,
  error,
}: {
  layout: Layout
  rebuilding: boolean
  onRebuild: () => void
  error: ReactNode
}) {
  const [view, setView] = useState<TwinView>('3d')
  const stats = layout.stats
  const route = stats.avg_route_m?.dock_in_to_storage
  const numbers: [string, string][] = []
  if (isNum(stats.rack_slots_total)) numbers.push([formatNumber(stats.rack_slots_total), 'паллетомест на схеме'])
  if (isNum(route)) numbers.push([`${formatNumber(route)} м`, 'путь от ворот до места'])

  const [expanded, setExpanded] = useState(false)
  // Only one live scene at a time: two WebGL canvases with thousands of racks stutter. The card drops its scene
  // at once, the dialog builds its own after the open animation, and back again on close.
  const [host, setHost] = useState<'card' | 'dialog'>('card')
  useEffect(() => {
    const timer = setTimeout(() => setHost(expanded ? 'dialog' : 'card'), HANDOVER_MS)
    return () => clearTimeout(timer)
  }, [expanded])

  return (
    <>
      {!expanded && host === 'card' && (
        <TwinStage
          layout={layout}
          view={view}
          onViewChange={setView}
          fitPadding={PLAN_PAD}
          narrowPadding={NARROW_PLAN_PAD}
        />
      )}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent
          className="block h-[90vh] w-[90vw] max-w-none overflow-hidden p-0 sm:max-w-none"
          overlayClassName="bg-black/25 supports-backdrop-filter:backdrop-blur-md"
          // Focusing the first control would pop the route-graph tooltip over the map on open.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogTitle className="sr-only">Планировка объекта</DialogTitle>
          {host === 'dialog' ? (
            <TwinStage
              layout={layout}
              view={view}
              onViewChange={setView}
              fitPadding={MODAL_PLAN_PAD}
              narrowPadding={NARROW_MODAL_PLAN_PAD}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-surface-2">
              <Spinner />
            </div>
          )}
        </DialogContent>
      </Dialog>
      <div className="absolute top-2.5 right-4 z-10 flex flex-col items-end gap-2 sm:top-4">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          title="Открыть крупно"
          aria-label="Открыть крупно"
          className="flex size-11 items-center justify-center rounded-[12px] bg-white/90 text-ink-2 shadow-card backdrop-blur transition-colors hover:bg-white hover:text-ink"
        >
          <Maximize2 size={17} />
        </button>
        {layout.warnings.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex cursor-help items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-1 text-[12px] font-medium text-warn">
                <AlertTriangle size={12} /> Замечания к планировке: {layout.warnings.length}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-80">
              <ul className="space-y-1">
                {layout.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        )}
        {layout.params_changed && (
          <button
            type="button"
            onClick={onRebuild}
            disabled={rebuilding}
            className="flex items-center gap-1.5 rounded-full border border-warn/30 bg-warn-soft px-2.5 py-1 text-[12px] font-medium text-warn transition-opacity hover:opacity-85 disabled:opacity-60"
          >
            <RefreshCw size={12} className={rebuilding ? 'animate-spin' : ''} />
            {rebuilding ? 'Перестраиваем…' : 'Параметры менялись — перестроить'}
          </button>
        )}
        {error && <div className="max-w-90 rounded-[12px] bg-white p-4 shadow-card">{error}</div>}
      </div>
      {/* A narrow column, so the map toolbar in the opposite corner never runs into it. On a phone the toolbar spans
          the whole width, so the column stands above it. */}
      {numbers.length > 0 && (
        <div className="pointer-events-none absolute right-4 bottom-18 left-4 z-10 flex gap-4 rounded-[12px] border border-line bg-white/90 px-3.5 py-2.5 backdrop-blur sm:right-auto sm:bottom-4 sm:flex-col sm:gap-2.5 sm:px-4 sm:py-3">
          {numbers.map(([value, label]) => (
            <div key={label} className="min-w-0 max-sm:flex-1">
              <div className="display num text-[17px]">{value}</div>
              <div className="meta">{label}</div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// The generator's 409 names missing parameters as `params.<key>` in `field` (the contract describes `loc`): accept both.
function GenerateError({ error, paramNames }: { error: unknown; paramNames: Map<string, string> }) {
  const problem = parseApiProblem(error)
  const missing = problem.details
    .map((d) => {
      const item = d as { field?: string; loc?: string[] }
      return (item.field ?? item.loc?.at(-1))?.replace(/^params\./, '')
    })
    .filter((key): key is string => Boolean(key))
    .map((key) => paramNames.get(key) ?? key)
  return (
    <div className="mt-4 max-w-110 text-left text-[13px] leading-relaxed">
      <div className="font-medium text-crit">{problem.detail}</div>
      {missing.length > 0 && <div className="mt-1 text-ink-2">Заполните в параметрах: {missing.join(', ')}.</div>}
    </div>
  )
}

function ViewLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      {icon}
      {children}
    </span>
  )
}

function Placeholder({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="h2">{title}</div>
      {children && <p className="mt-2 max-w-105 text-[14px] leading-relaxed text-ink-3">{children}</p>}
      {action && <div className="mt-5 flex flex-col items-center">{action}</div>}
    </div>
  )
}

function useMedia(query: string) {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', notify)
      return () => list.removeEventListener('change', notify)
    },
    () => window.matchMedia(query).matches,
  )
}

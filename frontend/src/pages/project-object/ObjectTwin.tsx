import { AlertTriangle, Box, Map as MapIcon, RefreshCw, Rotate3d } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useGenerateLayout, useLayout } from '@/entities/layout'
import { parseApiProblem } from '@/shared/api/problem'
import type { Layout, ObjectType } from '@/shared/api/types'
import { formatNumber, isNum } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { ErrorBlock, Spinner } from '@/shared/ui/states'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { Segmented } from '@/shared/ui/v0'
import { LayoutMap } from '@/widgets/layout-map'
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
  if (isNum(route)) numbers.push([`${formatNumber(route)} м`, 'средний путь от ворот до места'])

  return (
    <>
      {/* The 2D plan is the same map as on «Планировка», framed so the overlays above and below never cover it. */}
      {view === '3d' ? (
        <Twin layout={layout} switcher={false} toolbarPlacement="bottom-right" />
      ) : (
        <div className="absolute inset-0 bg-surface-2 px-4 pt-16 pb-26">
          <LayoutMap layout={layout} fill legend={false} className="h-full bg-white" />
        </div>
      )}
      <div className="absolute top-4 left-1/2 z-10 -translate-x-1/2 rounded-[12px] bg-white/90 p-1 shadow-card backdrop-blur">
        <Segmented
          size="sm"
          layoutId="object-twin-view"
          value={view}
          onChange={setView}
          options={[
            { value: '3d', label: <ViewLabel icon={<Rotate3d size={14} />}>3D-двойник</ViewLabel> },
            { value: '2d', label: <ViewLabel icon={<MapIcon size={14} />}>2D-план</ViewLabel> },
          ]}
        />
      </div>
      <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2">
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
      <div className="pointer-events-none absolute right-4 bottom-4 left-4 z-10 flex flex-wrap items-end justify-between gap-3">
        {numbers.length > 0 && (
          <div className="flex gap-6 rounded-[12px] border border-line bg-white/90 px-4 py-3 backdrop-blur">
            {numbers.map(([value, label]) => (
              <div key={label}>
                <div className="display num text-[18px]">{value}</div>
                <div className="meta">{label}</div>
              </div>
            ))}
          </div>
        )}
        {view === '2d' && <span className="text-[12px] text-ink-4">Перетаскивайте и масштабируйте план</span>}
      </div>
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

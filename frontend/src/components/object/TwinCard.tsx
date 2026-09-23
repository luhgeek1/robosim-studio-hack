import { AlertTriangle, Box, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useGenerateLayout, useLayout } from '@/api/layout'
import { parseApiProblem } from '@/api/problem'
import type { Layout, ObjectType } from '@/api/types'
import { ErrorState } from '@/components/States'
import { Button, Hint } from '@/components/ui'
import { formatNumber, isNum } from '@/lib/format'
import { Twin } from '@/twin/Twin'

const cardCls = 'card relative h-[640px] overflow-hidden lg:sticky lg:top-20'

export function TwinCard({
  projectId,
  objectType,
  paramNames,
}: {
  projectId: string
  objectType: ObjectType | undefined
  paramNames: Map<string, string>
}) {
  const supported = (objectType?.layout_templates?.length ?? 0) > 0
  const layout = useLayout(supported ? projectId : '')
  const generate = useGenerateLayout(projectId)

  if (!objectType) return <div className={`${cardCls} animate-pulse bg-surface-2`} />

  if (!supported)
    return (
      <div className={cardCls}>
        <Placeholder title={objectType.name}>
          Для этого типа объекта планировка не строится: длины маршрутов, площади и число постов расчёт берёт из
          параметров объекта слева. Уточните их — подбор и экономика пересчитаются.
        </Placeholder>
      </div>
    )

  const notBuilt = layout.isError && parseApiProblem(layout.error).status === 404

  return (
    <div className={cardCls}>
      {layout.isPending && <Placeholder title="Строим двойник…" />}
      {notBuilt && (
        <Placeholder
          title="Планировка ещё не построена"
          action={
            <>
              <Button
                variant="primary"
                icon={<Box size={15} />}
                disabled={generate.isPending}
                onClick={() => generate.mutate({})}
              >
                {generate.isPending ? 'Строим…' : 'Построить планировку'}
              </Button>
              {generate.isError && <GenerateError error={generate.error} paramNames={paramNames} />}
            </>
          }
        >
          Типовая планировка склада соберётся из параметров объекта: площадь, высота потолков, паллетоместа и ворота. Из
          неё расчёт возьмёт длины маршрутов.
        </Placeholder>
      )}
      {layout.isError && !notBuilt && (
        <div className="p-6">
          <ErrorState error={layout.error} onRetry={() => layout.refetch()} title="Планировка не загрузилась" />
        </div>
      )}
      {layout.data && (
        <LayoutView
          layout={layout.data}
          rebuilding={generate.isPending}
          onRebuild={() => generate.mutate({ template: layout.data.template ?? null })}
        />
      )}
      {layout.data && generate.isError && (
        <div className="absolute inset-x-4 top-28 z-20 rounded-[12px] bg-surface p-4 shadow-float">
          <GenerateError error={generate.error} paramNames={paramNames} />
        </div>
      )}
    </div>
  )
}

function LayoutView({ layout, rebuilding, onRebuild }: { layout: Layout; rebuilding: boolean; onRebuild: () => void }) {
  const stats = layout.stats
  const docks = isNum(stats.docks_in) && isNum(stats.docks_out) ? stats.docks_in + stats.docks_out : null
  const route = stats.avg_route_m?.dock_in_to_storage
  const numbers: [string, string][] = []
  if (isNum(stats.rack_slots_total)) numbers.push([formatNumber(stats.rack_slots_total), 'паллетомест'])
  if (docks !== null) numbers.push([formatNumber(docks), 'ворот приёмки и отгрузки'])
  if (isNum(route)) numbers.push([`${formatNumber(route)} м`, 'средний путь от ворот до места'])

  return (
    <>
      <Twin layout={layout} />
      <div className="pointer-events-none absolute top-4 left-4 z-10 flex items-center gap-2">
        <span className="rounded-full border border-line bg-white/90 px-2.5 py-1 text-[12.5px] font-medium">
          Цифровой двойник
        </span>
        <span className="rounded-full bg-white/90 px-2.5 py-1 text-[12px] text-ink-3">
          планировка из параметров объекта
        </span>
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
      </div>
      <div className="absolute top-16 right-4 z-10 flex flex-col items-end gap-2">
        {layout.warnings.length > 0 && (
          <Hint
            content={
              <ul className="space-y-1">
                {layout.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            }
          >
            <span className="flex cursor-help items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-1 text-[12px] font-medium text-warn">
              <AlertTriangle size={12} /> Замечания к планировке: {layout.warnings.length}
            </span>
          </Hint>
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
    <div className="mt-4 max-w-[440px] text-left text-[13px] leading-relaxed">
      <div className="font-medium text-crit">{problem.detail}</div>
      {missing.length > 0 && <div className="mt-1 text-ink-2">Заполните слева: {missing.join(', ')}.</div>}
    </div>
  )
}

function Placeholder({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="h2">{title}</div>
      {children && <p className="mt-2 max-w-[440px] text-[14px] leading-relaxed text-ink-3">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

import { RotateCcw, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { useResetParam, useUpdateParam } from '@/entities/project'
import { ProvenanceBadge } from '@/entities/provenance'
import type { ProjectParam } from '@/shared/api/types'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Spinner } from '@/shared/ui/states'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { displayParamValue, displayRange } from './display'
import { ParamHistory } from './ParamHistory'
import { ParamValueInput } from './ParamValueInput'
import type { ParamValue } from './parse'

const RESETTABLE = new Set<ProjectParam['provenance']['status']>(['user', 'imported'])

export const PARAM_GRID = 'grid grid-cols-[minmax(0,1fr)_15.5rem_10rem_8.5rem] items-start gap-x-4'

export function ParamRow({ projectId, param }: { projectId: string; param: ProjectParam }) {
  const update = useUpdateParam(projectId)
  const reset = useResetParam(projectId)
  const pending = update.isPending || reset.isPending
  const def = param.definition
  const range = displayRange(param)
  const check = param.validation
  const flagged = check.status !== 'ok'

  const commit = (value: ParamValue) => update.mutateAsync({ key: param.key, value, unit: param.unit ?? null })

  const doReset = () =>
    reset.mutate(param.key, {
      onSuccess: (fresh) =>
        toast.success(`«${param.name}»: вернули значение по умолчанию ${displayParamValue(fresh, fresh.value)}`),
    })

  return (
    <div
      id={`param-${param.key}`}
      className={cn(
        'border-l-2 py-3 pr-2 pl-3',
        check.status === 'error' && 'border-l-crit bg-crit-soft/40',
        (check.status === 'warning' || check.status === 'missing') && 'border-l-warn bg-warn-soft/30',
        !flagged && 'border-l-transparent',
      )}
    >
      <div className={PARAM_GRID}>
        <div className="min-w-0 space-y-0.5">
          <div className="font-medium">
            {param.name}
            {def?.required && (
              <span className="ml-0.5 text-crit" title="Обязательный параметр">
                *
              </span>
            )}
          </div>
          {def?.hint && (
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="line-clamp-2 cursor-help text-xs text-muted-foreground">{def.hint}</p>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">{def.hint}</TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <ParamValueInput param={param} pending={pending} onCommit={commit} />
          </div>
          {param.unit && (
            <span className="mt-1.5 w-14 shrink-0 text-xs leading-tight text-muted-foreground">{param.unit}</span>
          )}
        </div>

        <div className="space-y-0.5 pt-1 text-xs text-muted-foreground">
          {range && (
            <div>
              типично <span className="num text-foreground">{range}</span>
            </div>
          )}
          {def?.example && (
            <div className="truncate" title={def.example}>
              пример: <span className="text-foreground">{def.example}</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1 pt-1">
          {pending && <Spinner className="text-muted-foreground" />}
          <ProvenanceBadge provenance={param.provenance} />
          {param.history_count > 0 && <ParamHistory projectId={projectId} param={param} />}
          {RESETTABLE.has(param.provenance.status) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  disabled={pending}
                  onClick={doReset}
                  aria-label="Сбросить к значению по умолчанию"
                >
                  <RotateCcw />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Сбросить к значению по умолчанию</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {flagged && (
        <div
          className={cn('mt-2 flex items-start gap-1.5 text-xs', check.status === 'error' ? 'text-crit' : 'text-warn')}
        >
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          <span>
            {check.message ?? (check.status === 'missing' ? 'Значение не задано' : 'Проверьте значение')}
            {check.how_to_fix && <span className="text-muted-foreground"> — {check.how_to_fix}</span>}
          </span>
        </div>
      )}
    </div>
  )
}

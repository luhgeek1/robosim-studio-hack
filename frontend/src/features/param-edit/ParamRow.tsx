import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useResetParam, useUpdateParam } from '@/entities/project'
import type { ProjectParam } from '@/shared/api/types'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { Spinner } from '@/shared/ui/states'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { displayParamValue, shortHint } from './display'
import { ParamHistory } from './ParamHistory'
import { ParamValueInput } from './ParamValueInput'
import type { ParamValue } from './parse'

const RESETTABLE = new Set<ProjectParam['provenance']['status']>(['user', 'imported'])

export function ParamRow({ projectId, param }: { projectId: string; param: ProjectParam }) {
  const update = useUpdateParam(projectId)
  const reset = useResetParam(projectId)
  const pending = update.isPending || reset.isPending
  const def = param.definition
  const check = param.validation
  const flagged = check.status !== 'ok'
  const error = check.status === 'error'

  const commit = (value: ParamValue) => update.mutateAsync({ key: param.key, value, unit: param.unit ?? null })

  const doReset = () =>
    reset.mutate(param.key, {
      onSuccess: (fresh) =>
        toast.success(`«${param.name}»: вернули значение по умолчанию ${displayParamValue(fresh, fresh.value)}`),
    })

  return (
    <div
      id={`param-${param.key}`}
      className="group/row grid scroll-mt-48 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-6 px-6 py-3.5 transition-colors hover:bg-surface-2/70"
    >
      <div className="min-w-0 pt-1">
        <div className="flex items-center gap-2 text-[14px] font-medium">
          {flagged && <span className={cn('size-1.5 shrink-0 rounded-full', error ? 'bg-crit' : 'bg-warn')} />}
          <span className="min-w-0">
            {param.name}
            {def?.required && (
              <span className="ml-0.5 text-ink-4" title="Обязательный параметр">
                *
              </span>
            )}
          </span>
        </div>
        {def?.hint && (
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="mt-0.5 line-clamp-2 cursor-help text-[12.5px] text-ink-3">{shortHint(def.hint)}</p>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">{def.hint}</TooltipContent>
          </Tooltip>
        )}
        {flagged && (
          <p className={cn('mt-1 text-[12.5px]', error ? 'text-crit' : 'text-warn')}>
            {check.message ?? (check.status === 'missing' ? 'Значение не задано' : 'Проверьте значение')}
            {check.how_to_fix && <span className="text-ink-3"> — {check.how_to_fix}</span>}
          </p>
        )}
      </div>

      <div className="flex items-start gap-1.5">
        <span className="mt-1 flex h-6 w-14 shrink-0 items-center justify-end">
          {pending ? (
            <Spinner className="size-3 text-ink-3" />
          ) : (
            <span className="flex items-center opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
              {param.history_count > 0 && <ParamHistory projectId={projectId} param={param} />}
              {RESETTABLE.has(param.provenance.status) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-ink-3"
                      onClick={doReset}
                      aria-label="Сбросить к значению по умолчанию"
                    >
                      <RotateCcw />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Сбросить к значению по умолчанию</TooltipContent>
                </Tooltip>
              )}
            </span>
          )}
        </span>
        <div className="w-50 shrink-0">
          <ParamValueInput param={param} pending={pending} onCommit={commit} suffix={param.unit} />
        </div>
      </div>
    </div>
  )
}

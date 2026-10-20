import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useResetParam, useUpdateParam } from '@/entities/project'
import type { ProjectParam } from '@/shared/api/types'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/button'
import { InfoHint } from '@/shared/ui/info-hint'
import { Spinner } from '@/shared/ui/states'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip'
import { displayParamValue } from './display'
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
  const dimensions = def?.type === 'dimensions'
  const boolean = def?.type === 'boolean'
  const lastWordAt = param.name.lastIndexOf(' ') + 1

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
        'group/row grid scroll-mt-48 items-start gap-y-2.5 px-4 py-3.5 transition-colors hover:bg-surface-2/70 sm:px-6',
        boolean ? 'grid-cols-[minmax(0,1fr)_auto] gap-x-4' : 'grid-cols-1 gap-x-6 sm:grid-cols-[minmax(0,1fr)_auto]',
      )}
    >
      <div className={cn('min-w-0', boolean ? 'pt-1.5' : 'pt-1')}>
        <div className="flex items-start text-[14px] font-medium">
          {flagged && (
            <span className={cn('mt-2 mr-2 size-1.5 shrink-0 rounded-full', error ? 'bg-crit' : 'bg-warn')} />
          )}
          <span className="min-w-0 wrap-anywhere">
            {param.name.slice(0, lastWordAt)}
            <span className="whitespace-nowrap">
              {param.name.slice(lastWordAt)}
              {def?.required && (
                <span className="ml-0.5 text-ink-4" title="Обязательный параметр">
                  *
                </span>
              )}
              {def?.hint && (
                <InfoHint title={param.name} className="-my-1 -mr-1 -ml-1 align-middle max-sm:-my-2 max-sm:-ml-2.5">
                  {def.hint}
                </InfoHint>
              )}
            </span>
          </span>
        </div>
        {flagged && (
          <p className={cn('mt-1 text-[12.5px]', error ? 'text-crit' : 'text-warn')}>
            {check.message ?? (check.status === 'missing' ? 'Значение не задано' : 'Проверьте значение')}
            {check.how_to_fix && <span className="text-ink-3"> - {check.how_to_fix}</span>}
          </p>
        )}
      </div>

      {/* Тумблер у правого края; остальные поля на телефоне под названием, у габаритов действия ниже. */}
      <div className={cn('flex items-start gap-1.5', dimensions && 'max-sm:flex-wrap max-sm:gap-y-1')}>
        <span
          className={cn(
            'flex shrink-0 items-center justify-end sm:w-14',
            boolean ? 'h-8' : 'mt-1 h-6 max-sm:order-last max-sm:mt-0 max-sm:h-10',
            dimensions && 'max-sm:mt-0 max-sm:ml-auto',
          )}
        >
          {pending ? (
            <Spinner className="size-3 text-ink-3" />
          ) : (
            <span
              className={cn(
                'flex items-center opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100',
                dimensions && 'max-sm:opacity-100',
              )}
            >
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
        <div
          className={cn(
            'min-w-0',
            boolean
              ? 'shrink-0'
              : ['flex-1 sm:flex-none sm:shrink-0', dimensions ? 'max-sm:basis-full sm:w-72' : 'sm:w-50'],
          )}
        >
          <ParamValueInput param={param} pending={pending} onCommit={commit} suffix={param.unit} />
        </div>
      </div>
    </div>
  )
}

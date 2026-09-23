import { History, MoreHorizontal, RotateCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useParamHistory, useResetParam } from '@/api/projects'
import type { ProjectParam } from '@/api/types'
import { SourcePill } from '@/components/Provenance'
import { ErrorState } from '@/components/States'
import { Button, Popover } from '@/components/ui'
import { formatDateTime } from '@/lib/format'
import { SOURCE_KIND_LABEL } from '@/lib/labels'
import { useStore } from '@/store'
import { displayRange, displayValue, isOverridden } from './paramValue'

// Reset and history are rare actions: the trigger stays invisible until the row is hovered, unless there is history.
export function ParamMenu({
  projectId,
  param,
  processNames,
}: {
  projectId: string
  param: ProjectParam
  processNames: Map<string, string>
}) {
  const visible = param.history_count > 0 || isOverridden(param)
  return (
    <Popover
      width={340}
      trigger={
        <button
          type="button"
          aria-label={`Подробнее: ${param.name}`}
          title={param.history_count > 0 ? `Правок: ${param.history_count}` : 'Источник, сброс, история'}
          className={`-mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] text-ink-4 transition-opacity hover:bg-black/[0.05] hover:text-ink focus-visible:opacity-100 data-[state=open]:opacity-100 ${
            visible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          {param.history_count > 0 ? <History size={12} /> : <MoreHorizontal size={13} />}
        </button>
      }
    >
      <ParamDetails projectId={projectId} param={param} processNames={processNames} />
    </Popover>
  )
}

function ParamDetails({
  projectId,
  param,
  processNames,
}: {
  projectId: string
  param: ProjectParam
  processNames: Map<string, string>
}) {
  const reset = useResetParam(projectId)
  const toast = useStore((s) => s.toast)
  const def = param.definition
  const range = displayRange(param)
  const source = param.provenance.source
  const affects = (def?.affects ?? []).map((key) => processNames.get(key) ?? key)
  const fallback = def?.default

  const doReset = () =>
    reset.mutate(param.key, {
      onSuccess: (fresh) => toast(`«${param.name}»: вернули значение по умолчанию ${displayValue(fresh)}`),
    })

  return (
    <div className="text-[13px]">
      <div className="font-medium leading-snug text-ink">{param.name}</div>
      <div className="num mt-0.5 text-[15px] font-semibold">{displayValue(param)}</div>
      <dl className="mt-3 space-y-1.5 text-[12.5px]">
        <Line label="Источник">
          <span className="flex flex-wrap items-center gap-1.5">
            <SourcePill provenance={param.provenance} />
            {source && (
              <span className="text-ink-2">
                {SOURCE_KIND_LABEL[source.kind]}: {source.title}
              </span>
            )}
          </span>
          {param.provenance.note && <span className="mt-1 block text-ink-3">{param.provenance.note}</span>}
        </Line>
        {def?.example && <Line label="Пример">{def.example}</Line>}
        {range && <Line label="Типично">{range}</Line>}
        {affects.length > 0 && <Line label="Влияет на">{affects.join(', ')}</Line>}
      </dl>

      {isOverridden(param) && fallback && (
        <Button
          size="sm"
          className="mt-3 w-full"
          icon={<RotateCcw size={13} />}
          disabled={reset.isPending}
          onClick={doReset}
        >
          Вернуть по умолчанию: {displayValue(param, fallback.value)}
        </Button>
      )}

      {param.history_count > 0 && <ParamHistory projectId={projectId} param={param} />}
    </div>
  )
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-2">
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  )
}

function ParamHistory({ projectId, param }: { projectId: string; param: ProjectParam }) {
  const history = useParamHistory(projectId, param.key, true)
  return (
    <div className="hairline mt-3 pt-3">
      <div className="mb-2 text-[12.5px] font-medium text-ink-2">История правок</div>
      {history.isPending && <div className="text-[12.5px] text-ink-3">Загружаем…</div>}
      {history.error && <ErrorState error={history.error} onRetry={() => history.refetch()} />}
      {history.data && history.data.length === 0 && <div className="text-[12.5px] text-ink-3">Правок пока не было</div>}
      {history.data && history.data.length > 0 && (
        <ol className="scroll-thin max-h-56 space-y-2.5 overflow-y-auto pr-1">
          {history.data.map((item, i) => (
            <li key={`${item.changed_at}-${i}`} className="border-l-2 border-line pl-2.5 text-[12.5px]">
              <div className="num">
                <span className="text-ink-4 line-through">{displayValue(param, item.old_value)}</span>
                {' → '}
                <span className="font-medium">{displayValue(param, item.new_value)}</span>
              </div>
              <div className="text-[12px] text-ink-3">
                {formatDateTime(item.changed_at)} · {item.changed_by}
                {item.note && ` · ${item.note}`}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

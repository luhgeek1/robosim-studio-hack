import { History } from 'lucide-react'
import { useState } from 'react'
import { useParamHistory } from '@/entities/project'
import { ProvenanceBadge } from '@/entities/provenance'
import type { ProjectParam } from '@/shared/api/types'
import { formatDateTime } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { ErrorBlock, LoadingBlock } from '@/shared/ui/states'
import { displayParamValue } from './display'

export function ParamHistory({ projectId, param }: { projectId: string; param: ProjectParam }) {
  const [open, setOpen] = useState(false)
  const history = useParamHistory(projectId, param.key, open)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" className="text-muted-foreground" title="История правок">
          <History /> <span className="num">{param.history_count}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))]">
        <div className="mb-2 font-medium">История правок</div>
        <div className="mb-3 text-xs text-muted-foreground">{param.name}</div>
        {history.isPending && <LoadingBlock rows={2} />}
        {history.error && <ErrorBlock error={history.error} />}
        {history.data?.length === 0 && <div className="text-muted-foreground">Правок пока не было</div>}
        {history.data && history.data.length > 0 && (
          <ol className="max-h-72 space-y-3 overflow-y-auto pr-1">
            {history.data.map((item, index) => (
              <li key={`${item.changed_at}-${index}`} className="space-y-1 border-l-2 pl-3">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="num">{formatDateTime(item.changed_at)}</span>
                  <ProvenanceBadge status={item.status} />
                </div>
                <div className="num">
                  <span className="text-muted-foreground line-through">{displayParamValue(param, item.old_value)}</span>
                  {' → '}
                  <span className="font-medium">{displayParamValue(param, item.new_value)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {item.changed_by}
                  {item.note && <> · {item.note}</>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </PopoverContent>
    </Popover>
  )
}

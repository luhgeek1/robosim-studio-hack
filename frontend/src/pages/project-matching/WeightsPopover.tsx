import { SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { CRITERION_LABEL, useRunMatching } from '@/entities/matching'
import { formatPct } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Label } from '@/shared/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { Slider } from '@/shared/ui/slider'
import { Spinner } from '@/shared/ui/states'
import { Switch } from '@/shared/ui/switch'

const toPercent = (weights: Record<string, number>) =>
  Object.fromEntries(Object.entries(weights).map(([key, w]) => [key, Math.round(w * 100)]))

export function WeightsPopover({
  projectId,
  weights,
  includeRnd,
  onIncludeRndChange,
}: {
  projectId: string
  weights: Record<string, number>
  includeRnd: boolean
  onIncludeRndChange: (value: boolean) => void
}) {
  const run = useRunMatching(projectId)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Record<string, number>>(() => toPercent(weights))
  const [rnd, setRnd] = useState(includeRnd)
  const total = Object.values(draft).reduce((sum, v) => sum + v, 0)

  const onOpenChange = (next: boolean) => {
    if (next) {
      setDraft(toPercent(weights))
      setRnd(includeRnd)
    }
    setOpen(next)
  }

  const apply = () => {
    // The API expects weights summing to 1; sliders are raw importance, so normalize before sending.
    const normalized = Object.fromEntries(Object.entries(draft).map(([key, v]) => [key, total ? v / total : 0]))
    run.mutate(
      { weights: normalized, include_rnd: rnd },
      {
        onSuccess: () => {
          onIncludeRndChange(rnd)
          setOpen(false)
        },
      },
    )
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <SlidersHorizontal /> Веса критериев
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 space-y-4">
        <div>
          <div className="font-medium">Веса скоринга</div>
          <p className="text-xs text-muted-foreground">
            Насколько важен каждый критерий. Перед пересчётом веса приводятся к сумме 100 %.
          </p>
        </div>
        <div className="space-y-3">
          {Object.keys(draft).map((key) => (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <Label htmlFor={`w-${key}`}>{CRITERION_LABEL[key] ?? key}</Label>
                <span className="num text-muted-foreground">
                  {total ? formatPct((draft[key] / total) * 100, { digits: 0 }) : '—'}
                </span>
              </div>
              <Slider
                id={`w-${key}`}
                min={0}
                max={100}
                step={5}
                value={[draft[key]]}
                onValueChange={([v]) => setDraft((prev) => ({ ...prev, [key]: v }))}
                aria-label={CRITERION_LABEL[key] ?? key}
              />
            </div>
          ))}
        </div>
        <label className="flex items-center justify-between gap-3 text-xs">
          <span>Показывать продукты в стадии разработки</span>
          <Switch checked={rnd} onCheckedChange={setRnd} />
        </label>
        {total === 0 && <p className="text-xs text-crit">Хотя бы один критерий должен иметь вес больше нуля.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setDraft(toPercent(weights))}>
            Сбросить
          </Button>
          <Button size="sm" onClick={apply} disabled={run.isPending || total === 0}>
            {run.isPending && <Spinner />} Пересчитать с этими весами
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

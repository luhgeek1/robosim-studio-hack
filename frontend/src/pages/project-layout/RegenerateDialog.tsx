import { RefreshCw, TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useGenerateLayout } from '@/entities/layout'
import type { Layout, LayoutGenerateRequest, LayoutTemplate } from '@/shared/api/types'
import { formatNumber } from '@/shared/lib/format'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { ErrorBlock, Spinner } from '@/shared/ui/states'
import { TEMPLATE_HINT, TEMPLATE_LABEL } from './labels'

type OverrideKey = 'aspect_ratio' | 'docks_in' | 'docks_out' | 'pick_stations' | 'chargers' | 'cross_aisles'

const OVERRIDES: { key: OverrideKey; label: string; unit: string; min: number; step: number; integer: boolean }[] = [
  { key: 'aspect_ratio', label: 'Длина здания к глубине', unit: 'коэфф.', min: 0.2, step: 0.1, integer: false },
  { key: 'docks_in', label: 'Ворот приёмки', unit: 'шт', min: 1, step: 1, integer: true },
  { key: 'docks_out', label: 'Ворот отгрузки', unit: 'шт', min: 1, step: 1, integer: true },
  { key: 'pick_stations', label: 'Станций отбора', unit: 'шт', min: 0, step: 1, integer: true },
  { key: 'chargers', label: 'Зарядных мест', unit: 'шт', min: 1, step: 1, integer: true },
  { key: 'cross_aisles', label: 'Поперечных проездов', unit: 'шт', min: 0, step: 1, integer: true },
]

function currentValue(layout: Layout | undefined, key: OverrideKey): number | undefined {
  if (!layout) return undefined
  const override = layout.generator?.overrides?.[key]
  if (override !== undefined) return override
  if (key === 'aspect_ratio') return layout.generator?.params?.layout_building_aspect_ratio
  if (key === 'chargers') return layout.stats.chargers
  return layout.derivation.find((step) => step.key === key)?.value
}

export function RegenerateDialog({
  projectId,
  layout,
  templates,
  open,
  onOpenChange,
}: {
  projectId: string
  layout?: Layout
  templates: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const generate = useGenerateLayout(projectId)
  const [template, setTemplate] = useState<string>(layout?.template ?? templates[0] ?? '')
  const [values, setValues] = useState<Partial<Record<OverrideKey, string>>>(() =>
    Object.fromEntries(Object.entries(layout?.generator?.overrides ?? {}).map(([key, value]) => [key, String(value)])),
  )

  const invalid = OVERRIDES.filter(({ key, min, integer }) => {
    const raw = values[key]?.trim()
    if (!raw) return false
    const n = Number(raw.replace(',', '.'))
    return !Number.isFinite(n) || n < min || (integer && !Number.isInteger(n))
  })

  const submit = () => {
    const overrides: Record<string, number> = {}
    for (const { key } of OVERRIDES) {
      const raw = values[key]?.trim()
      if (raw) overrides[key] = Number(raw.replace(',', '.'))
    }
    const body: LayoutGenerateRequest = {
      template: (template || null) as LayoutTemplate | null,
      overrides,
    }
    generate.mutate(body, {
      onSuccess: () => {
        toast.success('Планировка перегенерирована — пересчитайте сценарии')
        onOpenChange(false)
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{layout ? 'Перегенерировать планировку' : 'Сгенерировать планировку'}</DialogTitle>
          <DialogDescription>
            Схема строится из параметров объекта и нормативов. Поля ниже необязательны: пустое поле — значение
            генератора по умолчанию.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Шаблон</Label>
            <Select value={template} onValueChange={setTemplate}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Выберите шаблон" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((key) => (
                  <SelectItem key={key} value={key}>
                    {TEMPLATE_LABEL[key] ?? key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {TEMPLATE_HINT[template] && <p className="text-xs text-muted-foreground">{TEMPLATE_HINT[template]}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {OVERRIDES.map(({ key, label, unit, min, step, integer }) => {
              const current = currentValue(layout, key)
              const bad = invalid.some((o) => o.key === key)
              return (
                <Field
                  key={key}
                  label={`${label}, ${unit}`}
                  htmlFor={`ov-${key}`}
                  error={bad ? (integer ? `целое число, не меньше ${min}` : `не меньше ${min}`) : null}
                >
                  <Input
                    id={`ov-${key}`}
                    type="number"
                    inputMode="decimal"
                    min={min}
                    step={step}
                    value={values[key] ?? ''}
                    aria-invalid={bad || undefined}
                    placeholder={current !== undefined ? `сейчас ${formatNumber(current)}` : 'авто'}
                    onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </Field>
              )
            })}
          </div>

          {generate.error && <ErrorBlock error={generate.error} />}

          {layout && (
            <div className="flex gap-2 rounded-lg border border-warn/25 bg-warn-soft p-3 text-xs text-warn">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                Перегенерация повышает версию проекта: маршруты изменятся, и расчёты сценариев станут устаревшими — их
                нужно будет пересчитать.
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={generate.isPending || invalid.length > 0 || !template}>
            {generate.isPending ? <Spinner /> : <RefreshCw />}
            {layout ? 'Перегенерировать' : 'Сгенерировать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string
  htmlFor: string
  error: string | null
  children: ReactNode
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-xs">
        {label}
      </Label>
      {children}
      {error && <p className="text-xs text-crit">{error}</p>}
    </div>
  )
}
